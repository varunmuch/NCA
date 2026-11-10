"""
The knight's hello: a short, cheerful greeting written for this student
when they open the app, shown in a speech bubble by the counselor button.

It mentions something real from their records. If something important for
their grade is missing (the quiz in 9th grade, SAT/ACT scores in 11th), it
asks for it, with a one-tap action the counselor then carries out.
Cached for a few hours so page loads stay fast.
"""

import logging
import re
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.llm import LLMError, chat_json, untrusted_block
from app.services import grounding, student_record, text_clean
from app.services.student_service import display_name, get_profile_dict

logger = logging.getLogger(__name__)

CACHE_SECONDS = 3 * 60 * 60
_cache: dict[str, tuple[float, str, dict]] = {}

# What matters most to ask for, by grade (first missing one wins).
ASK_BY_GRADE = {
    "9th grade": ["quiz", "resume", "transcript"],
    "10th grade": ["transcript", "quiz", "resume", "hours"],
    "11th grade": ["tests", "transcript", "resume", "hours", "quiz"],
    "12th grade": ["tests", "transcript", "hours", "resume", "quiz"],
}

ASKS = {
    "quiz": ("the interest quiz (it finds their interest type and a major)", "Take the quiz", "Open the quiz for me"),
    "transcript": ("their transcript (grades make the advice fit)", "Add my transcript", "Where do I upload my transcript?"),
    "resume": ("a resume with everything they've done", "Add my resume", "Where do I upload my resume?"),
    "tests": ("their SAT or ACT score, even a practice one", "Add my scores", "I want to add my SAT or ACT score"),
    "hours": ("their volunteer hours (Bright Futures counts them)", "Add my hours", "I want to add my volunteer hours"),
}

NUDGES = {
    "quiz": "Want to find your interest type with a quick quiz? 🎯",
    "transcript": "Can you add your transcript so I can see your grades?",
    "resume": "Got a resume? Add everything you've done!",
    "tests": "Taken the SAT or ACT yet? Tell me your score!",
    "hours": "How many volunteer hours do you have so far?",
}

PROMPT = """You are the Knight, NeoCity Academy's friendly career mascot. A high school student just opened the app. Write a tiny, cheerful hello for a speech bubble.

- message: one short sentence, under 18 words. Playful and warm, simple words, like talking to a kid you're cheering on. At most one emoji.
- Don't mention the time of day.
- Make it about THEM: mention one real thing from their records below (their grade, an activity, their goal, their next step, something they just did). Never generic.
- Just the hello: don't ask them for anything (the app adds that), unless "Ask for" is nothing, then end with a little nudge toward their next step.
- Never invent numbers, names or facts that aren't in the records. Address them by first name.
- action_label: 2 to 4 words for a button (like "Take the quiz"), or "" if there's nothing to do."""

SCHEMA = {
    "type": "object",
    "properties": {
        "message": {"type": "string", "maxLength": 220},
        "action_label": {"type": "string", "maxLength": 30},
    },
    "required": ["message", "action_label"],
}


def _what_to_ask(record: dict, grade: str) -> str | None:
    missing = {item["key"] for item in record.get("missing") or []}
    order = ASK_BY_GRADE.get(grade, ["transcript", "quiz", "resume", "tests"])

    return next((key for key in order if key in missing), None)


def _time_of_day() -> str:
    # NeoCity Academy is in Kissimmee, Florida.
    hour = datetime.now(ZoneInfo("America/New_York")).hour
    return "morning" if hour < 12 else "afternoon" if hour < 18 else "evening"


def _fallback(name: str, grade: str, ask: str | None, step: str) -> dict:
    hello = f"Hi {name}! " if name else "Hi there! "

    if ask:
        label, prompt = ASKS[ask][1], ASKS[ask][2]
        nudge = NUDGES[ask]
        return {"message": hello + nudge, "action_label": label, "action_prompt": prompt}

    if step:
        return {"message": hello + f"Ready for your next step: {step}?", "action_label": "Let's go", "action_prompt": "What should I do next?"}

    return {"message": hello + "Great to see you. What should we explore today?", "action_label": "", "action_prompt": ""}


async def greeting(student_id: str, next_step: str = "") -> dict:
    profile = await get_profile_dict(student_id)
    record = await student_record.build_record(student_id, profile)
    name = display_name(profile)
    grade = profile.get("grade_level", "")
    ask = _what_to_ask(record, grade)
    signature = f"{datetime.now():%Y-%m-%d}|{ask}|{next_step}|{len(record.get('missing') or [])}"

    cached = _cache.get(student_id)

    if cached and cached[1] == signature and time.time() - cached[0] < CACHE_SECONDS:
        return cached[2]

    facts = student_record.record_text(record)
    lines = [
        f"Name: {name or 'unknown'}",
        f"Grade: {grade or 'unknown'}",
        f"Career goal: {profile.get('career_aspiration') or 'not set'}",
        f"Next step in their plan: {next_step or 'none yet'}",
        f"Ask for: {ASKS[ask][0]}" if ask else "Ask for: nothing (their records are complete)",
        "Records:\n" + facts,
    ]

    try:
        raw = await chat_json(
            [
                {"role": "system", "content": PROMPT},
                {"role": "user", "content": untrusted_block("student_records", "\n".join(lines))},
            ],
            schema=SCHEMA,
            schema_name="knight_greeting",
            max_tokens=160,
            temperature=0.8,
        )
        message, _ = grounding.ground_reply(text_clean.clean_paragraph(raw.get("message", "")), facts + "\n" + "\n".join(lines), note=False)
        message = re.sub(r"\s+", " ", message).strip()
        # Keep it bubble-sized: at most two sentences.
        # Bubble-sized: one sentence, or two when the first is just "Hey, Sam!".
        sentences = re.split(r"(?<=[.!?])\s+", message)
        message = sentences[0]

        if len(message) < 30 and len(sentences) > 1 and len(message) + len(sentences[1]) <= 100:
            message = f"{message} {sentences[1]}"

        if len(message) < 12:
            raise LLMError("Greeting came back empty.")

        # The question comes from code, so it always matches the button.
        if ask:
            message = message.rstrip() + " " + NUDGES[ask]

        result = {
            "message": message,
            "action_label": ASKS[ask][1] if ask else ((raw.get("action_label") or "").strip()[:30] if next_step else ""),
            # What tapping the button says to the counselor (code-chosen, so it always works).
            "action_prompt": ASKS[ask][2] if ask else ("What should I do next?" if next_step else ""),
        }
    except LLMError:
        logger.warning("Greeting unavailable; using a simple one")
        result = _fallback(name, grade, ask, next_step)

    _cache[student_id] = (time.time(), signature, result)

    return result
