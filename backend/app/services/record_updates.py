"""
The counselor acts on what a student tells it: "I have 90 volunteer hours
now" or "I got a 1310 on the SAT" updates their record before the reply is
written, so the reply, Bright Futures, college chances, the quiz and My Path
all use the new number. The change is shown in the chat with an undo.

Only the student's own, current values count, never goals ("I need 100
hours"), requirements or what-ifs. The model proposes; code checks each
value against the student's exact words and a valid range.
"""

import asyncio
import logging
import re

from app.core.llm import LLMError, chat_json, untrusted_block

logger = logging.getLogger(__name__)

# Cheap check before any model call: only messages that could carry an update.
TRIGGER = re.compile(
    r"\b(hours?|hrs|volunteer\w*|service|sat|act|psat|scored?|got an? \d|major|majoring|majors|minor|study|"
    r"plan|path|checklist|remind|add|save|bookmark|goal|want to (be|become)|update|redo|refresh)\b",
    re.IGNORECASE,
)

# Things a student can ask the counselor to do (agent.py carries them out).
ACTIONS = {
    "add_step": 'a step to put on their My Path checklist, when they ask to add or be reminded of something ("add that to my plan", "remind me to sign up for the SAT"); value: the step, starting with a verb',
    "save_career": "a career to save, when they ask to save or bookmark it; value: the career",
    "set_goal": "a career to make their goal, when they say it is now their goal or ask to set it; value: the career",
    "update_plan": 'they ask to update, redo or build their plan or My Path; value: what should change, or ""',
    "refresh_majors": 'they ask for new major or minor suggestions; value: ""',
}

FIELDS = {
    "service_hours": {"label": "Service hours", "min": 0, "max": 5000},
    "paid_hours": {"label": "Paid work hours", "min": 0, "max": 10000},
    "sat": {"label": "SAT", "min": 400, "max": 1600},
    "act": {"label": "ACT", "min": 1, "max": 36},
    "intended_major": {"label": "Major you want"},
}

PROMPT = """You read one message from a high school student and pull out updates to their own record. Output JSON only.

Fill a field only when the student states their OWN CURRENT value in this message:
- service_hours: total community service or volunteer hours they have now ("I have 90 volunteer hours", "I'm at 80 service hours now"). If they say they ADDED hours ("I did 20 more hours"), add them to the current total given below.
- paid_hours: total paid work hours they have now.
- sat / act: a score they got ("I got 1310 on the SAT", "my ACT was 27"). PSAT counts as sat.
- intended_major: a college major they say they want ("I want to major in nursing").

Leave a field null for goals, requirements, questions and what-ifs ("I need 100 hours", "what if I got a 1400?", "is 1200 good?"), and for other people's numbers.

actions: things the student clearly ASKS the app to do in this message. Only a direct request counts, never a question about whether to do it ("should I add...?"). [] if none.
""" + "\n".join(f"- {name}: {text}" for name, text in ACTIONS.items()) + """

evidence: copy the exact words from the message that state the value or the request."""

SCHEMA = {
    "type": "object",
    "properties": {
        key: {
            "anyOf": [
                {"type": "null"},
                {
                    "type": "object",
                    "properties": {
                        "value": {"type": "string", "maxLength": 80} if key == "intended_major" else {"type": "integer"},
                        "evidence": {"type": "string", "maxLength": 200},
                    },
                    "required": ["value", "evidence"],
                },
            ]
        }
        for key in FIELDS
    },
    "required": list(FIELDS),
}

SCHEMA["properties"]["actions"] = {
    "type": "array",
    "maxItems": 3,
    "items": {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": list(ACTIONS)},
            "value": {"type": "string", "maxLength": 160},
            "evidence": {"type": "string", "maxLength": 200},
        },
        "required": ["action", "value", "evidence"],
    },
}
SCHEMA["required"] = list(FIELDS) + ["actions"]


def _norm(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def current_values(record: dict) -> dict:
    tests = record.get("tests") or {}

    return {
        "service_hours": record.get("service_hours"),
        "paid_hours": record.get("paid_work_hours"),
        "sat": tests.get("sat"),
        "act": tests.get("act"),
        "intended_major": record.get("intended_major") or "",
    }


def validate(raw: dict, message: str, current: dict) -> dict:
    """Keep only updates whose evidence is in the message and whose value is in range."""

    updates = {}
    said = _norm(message)

    for key, rules in FIELDS.items():
        item = raw.get(key)

        if not isinstance(item, dict):
            continue

        evidence = _norm(str(item.get("evidence") or ""))

        if not evidence or evidence not in said:
            continue

        value = item.get("value")

        if key == "intended_major":
            value = str(value or "").strip()

            if not value or _norm(value) == _norm(current.get(key) or ""):
                continue

            updates[key] = value[:80]
            continue

        if not isinstance(value, int) or not rules["min"] <= value <= rules["max"]:
            continue

        # The number itself must appear in what they said, unless they
        # added hours to a known total ("20 more hours" -> 82).
        added = re.search(r"\b(\d+)\b[^.]{0,20}\b(more|extra|additional)\b", message, re.IGNORECASE)
        if str(value) not in re.findall(r"\d+", message) and not (
            key in ("service_hours", "paid_hours") and added and current.get(key) is not None and value == current[key] + int(added.group(1))
        ):
            continue

        if value != current.get(key):
            updates[key] = value

    return updates


def validate_actions(raw: dict, message: str) -> list[dict]:
    """Requests whose evidence is really in the message; one of each kind."""

    said = _norm(message)
    found = []
    seen = set()

    for item in raw.get("actions") or []:
        action = item.get("action")
        evidence = _norm(str(item.get("evidence") or ""))

        if action not in ACTIONS or action in seen or not evidence or evidence not in said:
            continue

        value = str(item.get("value") or "").strip()

        if action in ("add_step", "save_career", "set_goal") and not value:
            continue

        seen.add(action)
        found.append({"action": action, "value": value[:160]})

    return found


async def extract(message: str, record: dict, timeout: float = 6.0) -> tuple[dict, list[dict]]:
    """Updates and requested actions in this message; never slows a turn past the timeout."""

    if not TRIGGER.search(message) or len(message) > 1500:
        return {}, []

    current = current_values(record)
    known = ", ".join(f"{FIELDS[key]['label']}: {value}" for key, value in current.items() if value not in (None, ""))

    try:
        raw = await asyncio.wait_for(
            chat_json(
                [
                    {"role": "system", "content": PROMPT + (f"\n\nTheir record now: {known}." if known else "")},
                    {"role": "user", "content": untrusted_block("student_message", message)},
                ],
                schema=SCHEMA,
                schema_name="record_updates",
                max_tokens=500,
                temperature=0,
            ),
            timeout=timeout,
        )
    except (LLMError, asyncio.TimeoutError):
        logger.warning("Record update check skipped for this turn")
        return {}, []

    return validate(raw, message, current), validate_actions(raw, message)


def describe(updates: dict, current: dict) -> list[dict]:
    """What changed, for the chat card and its undo."""

    return [
        {
            "field": key,
            "label": FIELDS[key]["label"],
            "old": current.get(key) if current.get(key) not in ("",) else None,
            "new": value,
        }
        for key, value in updates.items()
    ]


def _plain_item(item: str) -> str:
    return item.replace(" (or CLT 95)", "").replace(" (or CLT 82)", "")


def acknowledgment(changes: list[dict], before: dict, after: dict) -> str:
    """
    The sentence that opens the reply, written by code so it is exact: what
    was saved, and what it changes for Bright Futures.
    """

    saved = "; ".join(
        f"{change['label'].lower()} {change['old']} \u2192 {change['new']}" if change["old"] not in (None, "") else f"{change['label'].lower()}: {change['new']}"
        for change in changes
    )
    sentence = f"I updated your profile ({saved})."
    old_levels = {level["key"]: level for level in (before.get("bright_futures") or {}).get("levels") or []}
    flipped = False
    parts = []

    for level in (after.get("bright_futures") or {}).get("levels") or []:
        old = old_levels.get(level["key"]) or {"checks": []}
        flipped = flipped or any(check["status"] != previous["status"] for check, previous in zip(level["checks"], old["checks"]))
        gaps = [check for check in level["checks"] if check["status"] != "met"]
        short = level["name"].split(" (")[0]

        if not gaps:
            parts.append(f"you're on track for {short}")
        else:
            needs = "; ".join(
                f"{_plain_item(check['item'])} ({check['note'].replace('Yours: ', 'you have ').replace('Your estimate: ', 'your estimate is ').rstrip('.')})"
                if check["status"] == "not_yet"
                else f"{_plain_item(check['item'])} (not in your record yet)"
                for check in gaps
            )
            parts.append(f"{short} still needs {needs}")

    if flipped and parts:
        sentence += " For Bright Futures, " + ", and ".join(parts) + "."

    return sentence + " "
