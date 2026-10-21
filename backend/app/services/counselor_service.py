"""
The AI Career Counselor: one bounded, observable turn at a time.

A turn is:
1. save the student's message
2. assemble context (profile, facts, documents, past conversations, plan)
3. either run one structured counselor call, or, when the student picked a
   deep-dive action, run the matching existing CIE module
4. validate the output against the catalog and the student's own words
5. save the reply and propose facts for the student to confirm
6. summarize older turns in the background

The model never writes to the database directly; it can only propose.
"""

import logging
import re

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.llm import LLMError, chat_completion, chat_json
from app.db.models import Conversation, Message
from app.models.profile import StudentProfile
from app.services import career_catalog
from app.services.career_path_service import generate_career_path
from app.services.certification_service import generate_certification_guidance
from app.services.context_service import build_context, context_block
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


COUNSELOR_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string", "maxLength": 2400},
        "follow_up_question": {"type": "string", "maxLength": 300},
        "quick_replies": {
            "type": "array",
            "items": {"type": "string", "maxLength": 60},
            "maxItems": 4,
        },
        "career_suggestions": {
            "type": "array",
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "slug": {"type": "string", "maxLength": 100},
                    "title": {"type": "string", "maxLength": 100},
                    "why": {"type": "string", "maxLength": 300},
                },
                "required": ["slug", "title", "why"],
            },
        },
        "suggested_actions": {
            "type": "array",
            "items": {"type": "string", "enum": ACTIONS},
            "maxItems": 3,
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
    },
    "required": [
        "reply",
        "follow_up_question",
        "quick_replies",
        "career_suggestions",
        "suggested_actions",
        "facts_to_remember",
        "conversation_title",
    ],
}


SYSTEM_PROMPT = """You are the NeoCity Academy AI Career Counselor. You are an AI, not a human, and you say so if asked. You help high school students (ages 14-18) understand their interests, explore careers, and make realistic plans.

How you counsel:
- Be warm, encouraging, and direct. Never patronizing. Write at a level a 9th grader reads easily. Use short paragraphs; use a bulleted list only when listing options or steps.
- Ground everything in what you actually know about the student (below), including their favorite subjects, interests, activities, and documents, not only their latest message. When you connect a career to them, say which of their interests, subjects, or experiences it connects to.
- Never ask for something already known. Check the student context first.
- If an important detail is missing for a good answer, ask ONE short, specific follow-up question in follow_up_question. Do not interrogate. Skip the question when you can already help well. Students may say "I'm not sure" or skip; that is fine, keep helping.
- Move the conversation forward every turn. Never repeat a previous reply or re-suggest the same careers in the same words. If the student says "I'm not sure", reassure them in one sentence, then try a new angle: an easy either/or choice, a different career direction, or one small thing they could try this week.
- Students who don't know what they want are not behind. Help them explore through interests, favorite subjects, and activities, and show several possibilities rather than one answer.
- Students with a goal: explain realistic pathways, what they can do in high school now, and related alternatives.
- Career fit is never certain. Use language like "could be worth exploring", never "you should be" or "you will be". Do not label students.
- Respect different routes: four-year college, community college, apprenticeships, trade school, military, certificates, and starting work.
- Do not invent facts about the student, their documents, schools, programs, salaries, admission requirements, or job statistics. If you don't know, say so and suggest how to find out (for example a school counselor or the program's website).
- If the student asks about their resume or transcript and the documents section shows it is not uploaded, not analyzed, or failed, say so plainly instead of guessing its contents.
- Grades and transcripts show what a student has studied, not what they are capable of. Never use grades to rule a student out.
- For important decisions (choosing a college, a major, a program, money), encourage talking with a school counselor and a parent or guardian.
- Stay focused on school, careers, skills, and planning. If asked something unrelated, briefly and kindly steer back.
- If a student seems distressed or mentions self-harm, abuse, or being unsafe, respond with care, encourage them to talk to a trusted adult right away, and share that in the US they can call or text 988 (Suicide & Crisis Lifeline) any time. Do not continue career advice in that reply.

Output fields:
- reply: your answer in Markdown, usually 60-200 words. Format it for easy reading on a phone: separate paragraphs with a blank line ("\n\n"), and put each list item on its own line starting with "- " or "1. ". Use **bold** sparingly for key terms. Never end the reply with a question; questions go only in follow_up_question. When you suggest careers, give each a one-line reason tied to the student; the app also shows a card for each career_suggestion.
- follow_up_question: one question that teaches you something about the student that would improve your next answer (for example: working with people vs. on your own, hands-on vs. ideas, indoors vs. outdoors, a subject they enjoy, how much more school they'd consider). Never a generic "Do you have any questions?". Use "" when no question is needed.
- quick_replies: up to 4 short answers the student could tap for your follow-up question (include "I'm not sure" when it fits), or [].
- career_suggestions: up to 3 careers worth exploring that you discuss in the reply, ideally from different directions. The candidates list is ordered by fit with the student; use a slug from it when one fits, otherwise slug "". "why" must cite the student's own information. Use [] when this turn isn't about specific careers.
- suggested_actions: up to 3 helpful next steps from the allowed list, only when genuinely useful. build_plan when they are ready for a plan; skill_check, project_ideas, certificates, interview_practice, or career_roadmap when they have a specific career in mind; upload_document when a resume or transcript would clearly help; explore_careers when browsing would help; update_profile rarely.
- facts_to_remember: only facts the student stated about themselves in their LATEST message (grade, subjects they like, interests, hobbies, skills, activities, careers they are curious about, goals, constraints). evidence must be an exact quote from that message. Never include your own guesses or interpretations. [] if none.
- conversation_title: 3-6 word title for this conversation."""


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


def _validate_output(output: dict, student_message: str, candidates: list[dict]) -> dict:
    candidate_slugs = {candidate["slug"] for candidate in candidates}

    suggestions = []

    for suggestion in output.get("career_suggestions", [])[:3]:
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
        "reply": _drop_trailing_question(
            _tidy_markdown(output.get("reply", "")),
            output.get("follow_up_question", ""),
        ),
        "follow_up_question": output.get("follow_up_question", "").strip(),
        "quick_replies": [
            reply.strip() for reply in output.get("quick_replies", []) if reply.strip()
        ][:4],
        "career_suggestions": [item for item in suggestions if item["title"]],
        "suggested_actions": actions[:3],
        "facts": facts,
        "title": output.get("conversation_title", "").strip(),
    }


async def _counselor_reply(context: dict, student_name: str) -> dict:
    system = (
        SYSTEM_PROMPT
        + "\n\n"
        + context_block(context)
        + "\n\n## Career catalog candidates (slug: title)\n"
        + context["candidates_text"]
        + (f"\n\nThe student's name is {student_name}." if student_name else "")
    )

    messages = [{"role": "system", "content": system}, *context["turns"]]

    return await chat_json(
        messages,
        schema=COUNSELOR_SCHEMA,
        schema_name="counselor_turn",
        max_tokens=1400,
        temperature=0.5,
    )


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


async def run_turn(
    student_id: str,
    *,
    conversation_id: str | None,
    text: str,
    action: str | None = None,
    retry: bool = False,
) -> dict:
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
    else:
        user_metadata = {"action": action} if action else {}
        user_message = await add_message(
            student_id, conversation.id, "user", text, user_metadata
        )

    context = await build_context(student_id, conversation, text)

    try:
        if action in MODULE_ACTIONS:
            output = await _module_reply(action, text, context)
        else:
            raw = await _counselor_reply(context, context["name"])
            output = _validate_output(raw, text, context["candidates"])
    except Exception:
        logger.exception("Counselor turn failed")
        failed = {
            "id": None,
            "role": "assistant",
            "content": "",
            "metadata": {"error": True},
            "created_at": None,
        }
        return {
            "conversation_id": conversation.id,
            "user_message": message_to_dict(user_message),
            "assistant_message": failed,
            "error": "The counselor couldn't answer just now. Please try again.",
        }

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

    return {
        "conversation_id": conversation.id,
        "conversation_title": refreshed.title,
        "user_message": message_to_dict(user_message),
        "assistant_message": message_to_dict(assistant_message),
    }


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
