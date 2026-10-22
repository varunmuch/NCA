"""
The AI Career Counselor: one bounded, observable turn at a time.

A turn is:
1. save the student's message
2. assemble context (profile, facts, documents, past conversations, plan)
3. stream a plain-text reply, then make one small structured call for what
   the app shows around it (quick replies, careers, facts, actions, title);
   or, when the student picked a deep-dive action, run the matching module
4. validate the output against the catalog and the student's own words
5. save the reply and propose facts for the student to confirm
6. summarize older turns in the background

The model never writes to the database directly; it can only propose.
"""

import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncIterator
from contextvars import ContextVar
from pathlib import Path

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.llm import LLMError, chat_completion, chat_json, chat_stream, llm_calls
from app.db.models import Conversation, Message
from app.models.profile import StudentProfile
from app.services import career_catalog, career_expansion, grounding, safety
from app.services.career_path_service import generate_career_path
from app.services.certification_service import generate_certification_guidance
from app.services.context_service import build_context, context_block, grounding_corpus
from app.services.conversation_service import (
    DEFAULT_TITLE,
    add_message,
    create_conversation,
    get_owned_conversation,
    message_as_model_text,
    message_to_dict,
    set_title_if_default,
)
from app.services.interview_service import generate_interview_prep
from app.services.project_service import generate_project_roadmap
from app.services.skill_gap_service import generate_skill_gap
from app.services.student_service import FACT_CATEGORIES, add_facts


logger = logging.getLogger("cie.counselor")

# The last turn's stage timings in this task; read by the latency benchmark.
last_turn_timing: ContextVar[dict | None] = ContextVar("last_turn_timing", default=None)


class _TurnTimer:
    """Wall time per stage of one turn, logged as one line (never content)."""

    def __init__(self) -> None:
        self.stages: dict[str, float] = {}
        self._start = self._mark = time.monotonic()
        self._token = llm_calls.set([])

    def lap(self, stage: str) -> None:
        now = time.monotonic()
        self.stages[stage] = round(now - self._mark, 3)
        self._mark = now

    def finish(self, kind: str, ok: bool) -> dict:
        calls = llm_calls.get() or []
        llm_calls.reset(self._token)

        record = {
            "kind": kind,
            "ok": ok,
            **self.stages,
            "total": round(time.monotonic() - self._start, 3),
            "llm_calls": len(calls),
            "prompt_tokens": sum(call["prompt_tokens"] for call in calls),
            "completion_tokens": sum(call["completion_tokens"] for call in calls),
        }

        logger.info("turn timing %s", " ".join(f"{key}={value}" for key, value in record.items()))
        last_turn_timing.set(record)

        return record


ACTIONS = [
    "build_plan",
    "explore_careers",
    "upload_document",
    "update_profile",
    "skill_check",
    "project_ideas",
    "certificates",
    "interview_practice",
    "career_roadmap",
]

MODULE_ACTIONS = {
    "skill_check": ("skill check", generate_skill_gap),
    "project_ideas": ("project idea", generate_project_roadmap),
    "certificates": ("certificates and courses guide", generate_certification_guidance),
    "interview_practice": ("interview practice set", generate_interview_prep),
    "career_roadmap": ("career roadmap", generate_career_path),
}


# Limits the validator enforces on every reply.
MAX_CAREER_SUGGESTIONS = 2
MAX_QUICK_REPLIES = 3
MAX_ACTIONS = 3

# Below this many known interests or subjects, ask before naming careers.
MIN_SIGNALS_FOR_CAREERS = 2

THIN_CONTEXT_NOTE = (
    "You know very little about this student's interests yet. Ask about them; "
    "don't name careers unless they asked about a specific one."
)

# Replies are kept short by the prompt, not by this limit: it only guards
# against a runaway reply. A reply that reaches it is continued, never cut
# (llm.chat_stream), and trimmed to a whole sentence as a last resort.
REPLY_MAX_TOKENS = 1200
EXTRAS_MAX_TOKENS = 250

# The second, structured call: what the app shows around the reply.
EXTRAS_SCHEMA = {
    "type": "object",
    "properties": {
        "quick_replies": {
            "type": "array",
            "items": {"type": "string", "maxLength": 60},
            "maxItems": MAX_QUICK_REPLIES,
        },
        "suggested_actions": {
            "type": "array",
            "items": {"type": "string", "enum": ACTIONS},
            "maxItems": MAX_ACTIONS,
        },
        "facts_to_remember": {
            "type": "array",
            "maxItems": 4,
            "items": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "enum": list(FACT_CATEGORIES)},
                    "value": {"type": "string", "maxLength": 200},
                    "evidence": {"type": "string", "maxLength": 300},
                },
                "required": ["category", "value", "evidence"],
            },
        },
        "conversation_title": {"type": "string", "maxLength": 60},
        "careers_mentioned": {
            "type": "array",
            "items": {"type": "string", "maxLength": 60},
            "maxItems": 3,
        },
        "source_ids": {
            "type": "array",
            "items": {"type": "string", "maxLength": 4},
            "maxItems": 4,
        },
    },
    "required": [
        "source_ids",
        "quick_replies",
        "suggested_actions",
        "facts_to_remember",
        "conversation_title",
    ],
}


# Fixed text first: vLLM caches the shared prefix, so everything that is the
# same for every student and turn belongs at the top of the prompt.
SYSTEM_PROMPT_RULES = """You are the NeoCity Academy AI Career Counselor. You are an AI, not a human, and you say so if asked. You talk with high school students (ages 14-18) the way a warm, calm school counselor would: you listen first, you help them notice what they enjoy, and you help them take one small next step.

Your voice:
- Short. Usually 2 to 4 sentences, never more than about 100 words. One idea per reply.
- Start by reflecting back what the student just said, in their own words, so they feel heard. Then add one helpful thing. Then, if it helps, ask ONE short question. Never ask two questions, and never add filler questions like "What do you think?" or "How does that sound?".
- Warm, encouraging, and plain. No jargon, no lists longer than 3 items, no pressure, no lectures. Write so a 9th grader reads it easily. Don't open with "Great question" or similar filler.
- Celebrate small steps the student takes or plans, specifically.
- If they say "I'm not sure", reassure them in one short sentence and offer an easy either/or choice instead.
- Never repeat yourself, never ask for something you already know (check the student context), and move the conversation forward every turn.

Suggesting careers:
- Discover before recommending. Until the student has shared at least two things about themselves (interests, favorite subjects, activities, things they're good at), ask about them instead of naming careers.
- Then suggest at most 2 careers in a reply, each with one reason that uses the student's own words. Use the careers' names as written in the candidates list when one fits.
- Career fit is never certain. Say "could be worth exploring", never "you should be" or "you will be". Never label a student.
- Respect every route: four-year college, community college, apprenticeships, trade school, the military, certificates, and starting work.
- If the student asks you to make a plan, don't write the plan here. In 2 or 3 sentences, say what it would focus on for their grade, and that "Build my plan" makes it, with steps they can check off.

Facts:
- Facts and figures (pay or salary, job growth or outlook, percentages, scholarship or program names, deadlines and dates, GPA or admission requirements, links) must come from the Sources section or from what the student told you. If they aren't there, say plainly that you don't have reliable information on that, and point to where to find it: their school counselor, bls.gov for pay and job outlook, studentaid.gov for FAFSA and financial aid, careeronestop.org for scholarships. Never guess, estimate, or round a number, date, or name. Don't mention figures the student didn't ask about.
- When Sources give pay, job outlook, or education, you may share them: copy the figures exactly, say pay is the median (half earn more, half less) from the year shown, and that pay varies with place and experience. BLS has no "starting salary"; if asked, give the range the source shows instead.
- If the student asks about their resume or transcript and the documents section shows it is not uploaded, not analyzed, or failed, say so plainly instead of guessing its contents. Never invent facts about the student or their documents.
- Grades and transcripts show what a student has studied, not what they're capable of. Never use grades to rule a student out.
- For big decisions (a college, a major, a program, money), encourage talking with a school counselor and a parent or guardian.
- Stay focused on school, careers, skills, and planning. If asked something unrelated, kindly steer back in one sentence.

Safety comes first:
- If a student seems distressed, hopeless, or mentions self-harm, abuse, being hurt, or not being safe, stop career talk. Respond with care, encourage them to talk to a trusted adult right away (a parent, teacher, or their school counselor), and tell them they can call or text 988, the Suicide & Crisis Lifeline, any time. If they are in immediate danger, tell them to call 911.

Format: plain Markdown, paragraphs separated by a blank line, **bold** rarely. Never output JSON, field names, or source ids like [S1]."""


EXAMPLES_PATH = Path(__file__).resolve().parents[1] / "data" / "counselor_examples.json"


def _examples_block() -> str:
    """The example exchanges, as fixed text: part of the cached prefix."""

    examples = json.loads(EXAMPLES_PATH.read_text(encoding="utf-8"))["examples"]

    return "\n\n".join(
        f"Student: {example['student']}\nYou: {example['counselor']}" for example in examples
    )


SYSTEM_PROMPT = (
    SYSTEM_PROMPT_RULES
    + "\n\n## Examples of your voice (match the length and tone; the facts in them are only for those careers)\n\n"
    + _examples_block()
)


EXTRAS_PROMPT = """You add the interactive parts around a career counselor's reply to a high school student. You never change the reply. Output JSON only.

- quick_replies: if the reply ends with a question, up to 3 short answers the student could tap (include "I'm not sure" when it fits); otherwise [].
- suggested_actions: up to 3 genuinely useful next steps from the allowed list. build_plan when they are ready for a plan; skill_check, project_ideas, certificates, interview_practice, or career_roadmap when they have a specific career in mind; upload_document when a resume or transcript would clearly help; explore_careers when browsing would help; update_profile rarely. [] when none fit.
- facts_to_remember: only facts the student stated about themselves in their LATEST message (grade, subjects they like, interests, hobbies, skills, activities, careers they are curious about, goals, constraints). evidence must be an exact quote from that message. Never your own guesses. [] if none.
- conversation_title: a 3-6 word title for this conversation.
- source_ids: ids of the Sources (like "S1") whose facts the reply uses. [] if it uses none.
- careers_mentioned: job titles the student named in their LATEST message as something they want to do or are curious about, in their words (like "software engineer", "marine biologist"). [] if none."""


def _quote_in_message(evidence: str, message: str) -> bool:
    def normalize(text: str) -> str:
        return " ".join(re.findall(r"[a-z0-9']+", text.lower()))

    evidence_norm = normalize(evidence)

    return bool(evidence_norm) and evidence_norm in normalize(message)


def _tidy_markdown(text: str) -> str:
    """
    Guided JSON decoding sometimes drops newlines. Put inline list items
    back on their own lines so Markdown renders them as lists.
    """

    # Stray emphasis runs ("****word*****") and padded markers ("** word **")
    # become plain **bold**, which the chat renders.
    text = re.sub(r"\*{3,}", "**", text)
    text = re.sub(r"\*\*\s+([^*\n]+?)\s+\*\*", r"**\1**", text)

    if "\n" in text:
        return text.strip()

    text = re.sub(r"\s+(\d{1,2})\.\s+(?=\*\*|[A-Z])", r"\n\1. ", text)
    text = re.sub(r"\s+-\s+(?=\*\*)", "\n- ", text)

    # A list ends where the last item's sentence is followed by a new paragraph
    # we can't detect reliably, so only separate the intro from the list.
    text = re.sub(r"(:)\n", r"\1\n\n", text, count=1)

    return text.strip()


def _drop_trailing_question(reply: str, follow_up: str) -> str:
    """
    The follow-up question is shown separately, so a reply that also ends
    in a question would ask twice.
    """

    if not follow_up.strip() or not reply.rstrip().endswith("?"):
        return reply

    trimmed = re.sub(r"(?:\s*[^.!?\n]*\?)+\s*$", "", reply).rstrip()

    return trimmed if len(trimmed) > 40 else reply


def _validate_output(
    output: dict,
    student_message: str,
    candidates: list[dict],
    *,
    corpus: str | None = None,
    sources: list[dict] | None = None,
    allow_careers: bool = True,
) -> dict:
    """
    Check everything the model proposed. With a corpus (the streamed chat
    path), sentences carrying figures or names no source supports are
    removed from the reply, and career cards are taken from the careers
    the corrected reply names.
    """

    candidate_slugs = {candidate["slug"] for candidate in candidates}
    follow_up = output.get("follow_up_question", "")
    reply = _drop_filler_questions(
        _drop_trailing_question(_tidy_markdown(output.get("reply", "")), follow_up)
    )
    removed: list[dict] = []

    if corpus is not None:
        # Every catalog career, not only this turn's sources: a figure given
        # for any named career must be that career's own.
        reply, removed = grounding.ground_reply(reply, corpus, list(career_catalog.career_scopes()))
        output = {**output, "career_suggestions": careers_in_reply(reply) if allow_careers else []}

    known = {source["id"]: source for source in sources or []}
    cited = [known[source_id] for source_id in dict.fromkeys(output.get("source_ids") or []) if source_id in known]
    card_slugs = {card.get("slug") for card in output.get("career_suggestions") or []}

    # A card's own catalog page is always a source for it.
    for source in known.values():
        if source["slug"] in card_slugs and source not in cited:
            cited.append(source)

    suggestions = []

    for suggestion in output.get("career_suggestions", [])[:MAX_CAREER_SUGGESTIONS]:
        slug = suggestion.get("slug", "")
        career = career_catalog.get_career(slug) if slug else None

        # Only link careers that exist in the catalog.
        if career is None:
            slug = ""

        suggestions.append(
            {
                "slug": slug,
                "title": career["title"] if career else suggestion.get("title", "").strip(),
                "family": career["family"] if career else "",
                "family_label": career_catalog.family_label(career["family"]) if career else "",
                "why": suggestion.get("why", "").strip(),
                "in_candidates": slug in candidate_slugs,
            }
        )

    facts = [
        fact
        for fact in output.get("facts_to_remember", [])
        if fact.get("category") in FACT_CATEGORIES
        and fact.get("value", "").strip()
        and _quote_in_message(fact.get("evidence", ""), student_message)
    ]

    actions = []

    for action in output.get("suggested_actions", []):
        if action in ACTIONS and action not in actions:
            actions.append(action)

    return {
        "reply": reply,
        "follow_up_question": follow_up.strip(),
        "quick_replies": [
            reply.strip() for reply in output.get("quick_replies", []) if reply.strip()
        ][:MAX_QUICK_REPLIES],
        "career_suggestions": [item for item in suggestions if item["title"]],
        "suggested_actions": actions[:MAX_ACTIONS],
        "facts": facts,
        "title": output.get("conversation_title", "").strip(),
        "careers_mentioned": [str(phrase).strip()[:60] for phrase in output.get("careers_mentioned") or [] if str(phrase).strip()][:3],
        "sources": [{"id": source["id"], "title": source["title"], "url": source["url"]} for source in cited],
        "grounding": {"removed": [{"kind": claim["kind"], "text": claim["text"]} for claim in removed]},
    }


def counselor_messages(context: dict, student_name: str) -> list[dict]:
    """
    The reply prompt, most stable parts first so vLLM reuses the cached
    prefix: fixed instructions, then this student, then what this message
    retrieved (candidates), then the conversation.
    """

    system = (
        SYSTEM_PROMPT
        + (f"\n\nThe student's name is {student_name}." if student_name else "")
        + (f"\n\n{THIN_CONTEXT_NOTE}" if context.get("signals", MIN_SIGNALS_FOR_CAREERS) < MIN_SIGNALS_FOR_CAREERS else "")
        + "\n\n"
        + context_block(context)
        + "\n\n## Career catalog candidates (slug: title), best fit first\n"
        + context["candidates_text"]
        + "\n\n## Sources (career facts you may state; nothing else is verified)\n"
        + (context.get("sources_text") or "(none)")
        + _career_page_note(context.get("career_page"))
    )

    return [{"role": "system", "content": system}, *context["turns"]]


def _career_page_note(page: dict | None) -> str:
    """Tell the model about the page the app opened for the career the student named."""

    if not page:
        return ""

    if page.get("slug"):
        return (
            f"\n\n## A page for the career the student named\n"
            f"The app has a page for {page['title']} with pay, classes to take, and a roadmap builder, "
            f"and shows the student a button to open it. Say so in a few words and invite them to open it "
            f"and build their roadmap there. Never say the career isn't listed."
        )

    return (
        f"\n\n## A page for the career the student named\n"
        f"The app is preparing a page for \"{page['phrase']}\" from official job data. "
        f"Never say the career isn't listed."
    )


def extras_messages(context: dict, student_message: str, reply: str) -> list[dict]:
    return [
        {"role": "system", "content": EXTRAS_PROMPT},
        {
            "role": "user",
            "content": (
                "## Sources\n"
                + "\n".join(f"{source['id']}: {source['title']}" for source in context.get("sources") or [])
                + "\n\n## The student's latest message\n"
                + student_message
                + "\n\n## The counselor's reply\n"
                + reply
            ),
        },
    ]


FILLER_QUESTION = re.compile(
    r"\s*(?:What do you think|How does that sound|Does (?:that|this) (?:sound|make sense)[^?.!\n]{0,30}"
    r"|Sound good|Any thoughts|Make sense|Does that help)\?",
    re.IGNORECASE,
)


def _drop_filler_questions(reply: str) -> str:
    """Keep one real question: a filler like "What do you think?" goes when there's another."""

    if reply.count("?") <= 1:
        return reply

    trimmed = FILLER_QUESTION.sub("", reply).strip()
    return trimmed if trimmed.count("?") >= 1 else reply


def whole_sentences(text: str) -> str:
    """Text up to its last complete sentence, so nothing ends mid-thought."""

    ends = [match.end() for match in re.finditer(r"[.!?](?:[\"')\]*_]*)(?=\s|$)", text)]
    return text[: ends[-1]].strip() if ends else text.strip()


def _plain(text: str) -> str:
    text = re.sub(r"[*_`#>]+", "", text)
    return re.sub(r"^\s*(?:[-•]|\d{1,2}[.)])\s+", "", text).strip()


def careers_in_reply(reply: str, limit: int = MAX_CAREER_SUGGESTIONS) -> list[dict]:
    """
    Career cards for the catalog careers the reply actually names, in the
    order it names them. The reason shown is the reply's own sentence, so a
    card can never say something the reply didn't.
    """

    lowered = reply.lower()
    found: list[tuple[int, dict]] = []

    for career in career_catalog.load_catalog()["careers"]:
        title = career["title"].lower()
        # "Graphic Designers" also matches "graphic designer".
        pattern = re.escape(title[:-1] if title.endswith("s") else title)
        match = re.search(rf"\b{pattern}", lowered)

        if match:
            found.append((match.start(), career))

    found.sort(key=lambda item: item[0])
    cards = []

    for position, career in found[:limit]:
        # The line (list item) or sentence that names the career.
        start = reply.rfind("\n", 0, position) + 1
        end = reply.find("\n", position)
        line = _plain(reply[start : end if end != -1 else len(reply)])
        # Drop a leading "Graphic Designers:" so the card doesn't repeat its title.
        line = re.sub(rf"^{re.escape(career['title'])}\s*[:\-–—]\s*", "", line, flags=re.IGNORECASE)
        sentences = re.split(r"(?<=[.!?])\s+", line)
        # The sentence that names it; after "Title:" was dropped, the first.
        title = career["title"].lower()
        own = re.escape(title[:-1] if title.endswith("s") else title)
        why = next((item for item in sentences if re.search(rf"\b{own}", item.lower())), sentences[0])

        cards.append({"slug": career["slug"], "title": career["title"], "why": why[:300]})

    return cards


async def _extras(context: dict, student_message: str, reply: str) -> dict:
    """The structured parts around a reply. A failure here keeps the reply."""

    try:
        return await chat_json(
            extras_messages(context, student_message, reply),
            schema=EXTRAS_SCHEMA,
            schema_name="counselor_extras",
            max_tokens=EXTRAS_MAX_TOKENS,
            temperature=0.2,
        )
    except LLMError as exc:
        logger.warning("Counselor extras failed: %s", exc)
        return {}


async def _module_reply(action: str, question: str, context: dict) -> dict:
    label, generator = MODULE_ACTIONS[action]
    profile = context["profile"]

    profile_model = StudentProfile.model_validate(
        {key: value for key, value in profile.items() if key in StudentProfile.model_fields}
    )

    grade = profile.get("grade_level") or "unknown grade"

    framed_question = (
        f"{question}\n\n(The student is a high school student, grade: {grade}. "
        "Keep every suggestion realistic and appropriate for a high school "
        "student; prefer free or school-available resources.)"
    )

    memory_context = {
        "student_context": context["profile_text"],
        "plan_and_progress": context["plan_text"],
        "recent_messages": [
            {"role": turn["role"], "content": turn["content"][:800]}
            for turn in context["turns"][-6:]
        ],
    }

    result = await generator(framed_question, profile_model, memory_context)
    data = result.model_dump()
    target = data.get("target_role") or data.get("project_title") or ""

    reply = f"Here's a {label}" + (f" for **{target}**" if target else "") + "."
    reply += " Look it over, and tell me what you'd like to change or explore next."

    return {
        "reply": reply,
        "follow_up_question": "",
        "quick_replies": [],
        "career_suggestions": [],
        "suggested_actions": ["build_plan"],
        "facts": [],
        "title": f"{label.capitalize()}" + (f": {target}" if target else ""),
        "module": {"type": action, "result": data},
    }


async def run_turn_stream(
    student_id: str,
    *,
    conversation_id: str | None,
    text: str,
    action: str | None = None,
    retry: bool = False,
) -> AsyncIterator[dict]:
    """
    One counselor turn as events:
      start  {conversation_id, user_message}
      delta  {text}                  reply text as it is generated
      done   {conversation_id, conversation_title, user_message, assistant_message}
      error  {conversation_id, user_message, assistant_message, error}

    Deep-dive modules are not streamed: they go straight from start to done.
    """

    timer = _TurnTimer()
    kind = action if action in MODULE_ACTIONS else "chat"

    if conversation_id:
        conversation = await get_owned_conversation(student_id, conversation_id)
    else:
        conversation = await create_conversation(student_id)

    if retry:
        # Answer the latest student message again instead of saving a copy.
        last = await _last_message(conversation.id)

        if last is None or last.role != "user":
            raise ValueError("There is no unanswered message to retry.")

        user_message = last
        text = last.content
        action = (last.metadata_json or {}).get("action")
        kind = action if action in MODULE_ACTIONS else "chat"
    else:
        user_metadata = {"action": action} if action else {}
        user_message = await add_message(
            student_id, conversation.id, "user", text, user_metadata
        )

    timer.lap("setup")
    yield {
        "event": "start",
        "conversation_id": conversation.id,
        "user_message": message_to_dict(user_message),
    }

    context = await build_context(student_id, conversation, text)
    timer.lap("context")

    # Agentic step: a career the student says they want gets a page now
    # (validated against official job titles), started before the reply.
    page_task = None
    goals = career_expansion.goal_phrases(text) if action not in MODULE_ACTIONS else []

    if goals:
        page_task = asyncio.create_task(career_expansion.ensure_career(goals[0]))

        try:
            # A page within an occupation we have is ready in milliseconds.
            context["career_page"] = _page_info(await asyncio.wait_for(asyncio.shield(page_task), timeout=1.5))
            _lead_sources_with(context, context["career_page"])
        except asyncio.TimeoutError:
            context["career_page"] = {"phrase": goals[0]}
        except Exception:
            logger.exception("Career page for %r failed", goals[0])
            page_task = None

        timer.lap("career_page")

    try:
        if action in MODULE_ACTIONS:
            output = await _module_reply(action, text, context)
            timer.lap("model")
        else:
            parts: list[str] = []
            generation: dict = {}

            async for piece in chat_stream(
                counselor_messages(context, context["name"]),
                max_tokens=REPLY_MAX_TOKENS,
                temperature=0.5,
                name="counselor_reply",
                outcome=generation,
            ):
                if not parts:
                    timer.lap("first_token")

                parts.append(piece)
                yield {"event": "delta", "text": piece}

            reply = "".join(parts).strip()

            if generation.get("finish") == "length":
                # Still cut after continuing: end on a whole sentence.
                reply = whole_sentences(reply)

            if not reply:
                raise LLMError("The model returned an empty reply.")

            # Safety net: crisis help is added if the model left it out, as
            # the last streamed piece so nothing on screen jumps.
            crisis = safety.is_crisis(text)
            addition = safety.missing_help(text, reply)

            if addition:
                yield {"event": "delta", "text": addition}
                reply += addition

            timer.lap("reply")

            extras = await _extras(context, text, reply)
            timer.lap("extras")

            if page_task is not None and not (context.get("career_page") or {}).get("slug"):
                # A brand-new occupation: give it the rest of the time it needs.
                try:
                    context["career_page"] = _page_info(await asyncio.wait_for(asyncio.shield(page_task), timeout=20))
                except Exception:
                    logger.warning("Career page for %r wasn't ready in time", goals[0])
            output = _validate_output(
                {**extras, "reply": reply},
                text,
                context["candidates"],
                corpus=grounding_corpus(context, text),
                sources=context.get("sources"),
                # Discover before recommending: no cards until we know enough,
                # unless the student asked about a specific career.
                allow_careers=not crisis
                and (
                    context.get("signals", MIN_SIGNALS_FOR_CAREERS) >= MIN_SIGNALS_FOR_CAREERS
                    or bool(careers_in_reply(text))
                ),
            )

            if crisis:
                # No buttons pulling toward plans or careers in a crisis turn.
                output["suggested_actions"] = []
            else:
                _attach_career_page(output, context.get("career_page"))
            timer.lap("validate")
    except Exception:
        logger.exception("Counselor turn failed")
        timer.finish(kind, ok=False)
        yield {
            "event": "error",
            "conversation_id": conversation.id,
            "user_message": message_to_dict(user_message),
            "assistant_message": {
                "id": None,
                "role": "assistant",
                "content": "",
                "metadata": {"error": True},
                "created_at": None,
            },
            "error": "The counselor couldn't answer just now. Please try again.",
        }
        return

    proposed = await add_facts(
        student_id,
        output["facts"],
        status="suggested",
        source_type="conversation",
        source_id=conversation.id,
    )

    metadata = {
        "follow_up_question": output["follow_up_question"],
        "quick_replies": output["quick_replies"],
        "career_suggestions": output["career_suggestions"],
        "suggested_actions": output["suggested_actions"],
        "proposed_facts": proposed,
    }

    if output.get("sources"):
        metadata["sources"] = output["sources"]

    if (output.get("grounding") or {}).get("removed"):
        # Kept so evals and staff can see what was taken out, and why.
        metadata["grounding"] = output["grounding"]

    if output.get("open_career"):
        metadata["open_career"] = output["open_career"]

    if "module" in output:
        metadata["module"] = output["module"]

    assistant_message = await add_message(
        student_id,
        conversation.id,
        "assistant",
        output["reply"],
        metadata,
    )

    if conversation.title == DEFAULT_TITLE:
        await set_title_if_default(
            conversation.id,
            output["title"] or text[:60],
        )

    refreshed = await get_owned_conversation(student_id, conversation.id)
    timer.lap("save")

    # Careers the student named that we don't have are looked up and added
    # for everyone, after the reply (never slowing it).
    if output.get("careers_mentioned"):
        career_expansion.ensure_in_background(output["careers_mentioned"])
    timer.finish(kind, ok=True)

    yield {
        "event": "done",
        "conversation_id": conversation.id,
        "conversation_title": refreshed.title,
        "user_message": message_to_dict(user_message),
        "assistant_message": message_to_dict(assistant_message),
    }


def _lead_sources_with(context: dict, page: dict | None) -> None:
    """The named career's own facts become source S1 for this turn."""

    if not page or not page.get("slug"):
        return

    from app.services.context_service import BUDGET_SOURCES, _fit, build_sources, sources_block

    rest = [match for match in context.get("candidates", []) if match["slug"] != page["slug"]]
    context["sources"] = build_sources([{"slug": page["slug"]}, *rest])
    context["sources_text"] = _fit(sources_block(context["sources"]), BUDGET_SOURCES)


def _page_info(outcome: dict | None) -> dict | None:
    if not outcome or not outcome.get("slug"):
        return None

    career = career_catalog.get_career(outcome["slug"])

    if career is None:
        return None

    return {
        "slug": career["slug"],
        "title": career["title"],
        "created": outcome.get("result") == "added",
        "note": career.get("official_note", ""),
    }


def _attach_career_page(output: dict, page: dict | None) -> None:
    """The named career leads the cards, with buttons to open it and build a roadmap."""

    if not page or not page.get("slug"):
        return

    output["open_career"] = page
    cards = [card for card in output.get("career_suggestions", []) if card.get("slug") != page["slug"]]
    career = career_catalog.get_career(page["slug"])
    first = {
        "slug": page["slug"],
        "title": page["title"],
        "family": career["family"],
        "family_label": career_catalog.family_label(career["family"]),
        "why": page.get("note") or career["description"][:200],
        "in_candidates": False,
    }
    output["career_suggestions"] = [first, *cards][:MAX_CAREER_SUGGESTIONS]


async def run_turn(
    student_id: str,
    *,
    conversation_id: str | None,
    text: str,
    action: str | None = None,
    retry: bool = False,
) -> dict:
    """The same turn, returned whole (the non-streaming endpoints)."""

    async for event in run_turn_stream(
        student_id,
        conversation_id=conversation_id,
        text=text,
        action=action,
        retry=retry,
    ):
        if event["event"] in ("done", "error"):
            return {key: value for key, value in event.items() if key != "event"}

    raise LLMError("The counselor turn ended without a reply.")


async def _last_message(conversation_id: str) -> Message | None:
    async with AsyncSessionLocal() as db:
        return (
            await db.execute(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()


# --------------------------------------------------------------- summaries

SUMMARY_KEEP_RECENT = 12
SUMMARY_MIN_BATCH = 6


async def summarize_if_needed(conversation_id: str) -> None:
    """
    Fold turns older than the recent window into the conversation summary.
    Raw messages are kept; the summary only shortens future prompts.
    """

    async with AsyncSessionLocal() as db:
        conversation = await db.get(Conversation, conversation_id)

        if conversation is None:
            return

        messages = (
            await db.execute(
                select(Message)
                .where(
                    Message.conversation_id == conversation_id,
                    Message.id > conversation.summarized_through_message_id,
                )
                .order_by(Message.id.asc())
            )
        ).scalars().all()

        older = messages[:-SUMMARY_KEEP_RECENT]

        if len(older) < SUMMARY_MIN_BATCH:
            return

        transcript = "\n".join(
            f"{message.role}: {message_as_model_text(message)[:1500]}"
            for message in older
        )

        try:
            summary = await chat_completion(
                [
                    {
                        "role": "system",
                        "content": (
                            "You keep concise notes on a career counseling "
                            "conversation with a high school student. Update the "
                            "notes with the new turns. Keep: what the student "
                            "said about themselves, careers discussed and their "
                            "reactions, decisions, open questions, and advice "
                            "given. Only record what was actually said. Newer "
                            "information overrides older. At most 180 words, "
                            "plain sentences."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Current notes:\n{conversation.summary or '(none)'}\n\n"
                            f"New turns:\n{transcript}"
                        ),
                    },
                ],
                max_tokens=400,
                temperature=0,
            )
        except LLMError as exc:
            logger.warning("Summary failed for %s: %s", conversation_id, exc)
            return

        conversation.summary = summary.strip()
        conversation.summarized_through_message_id = older[-1].id
        await db.commit()
