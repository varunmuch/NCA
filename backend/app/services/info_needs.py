"""
The counselor asks for what it needs instead of guessing.

When a question depends on something the student's record doesn't have
(chances at a college need a test score, Bright Futures needs hours, a
major needs the interest quiz), the reply asks for it, with a small form or
a link right in the chat. The student's answer goes through the normal
record update, so the next reply uses it.

Asked at most once per conversation for the same thing, so it never nags.
"""

import re

# What a kind of question needs, and why (in the student's terms).
TOPICS = [
    (
        re.compile(r"\b(chances?|get in(to)?|admit\w*|admission|reach|safety|likely|match school|which colleges|what colleges|colleges? (should|to)|apply(ing)? to)\b", re.IGNORECASE),
        "To estimate your chances",
        ["tests", "transcript"],
    ),
    (
        re.compile(r"\b(bright futures|scholarships?|financial aid|pay for college|afford college)\b", re.IGNORECASE),
        "To check which scholarships fit you",
        ["transcript", "hours", "tests"],
    ),
    (
        re.compile(r"\b((what|which) (should i )?major|major (in|should)|my major|minor)\b", re.IGNORECASE),
        "To suggest a major and minor that fit you",
        ["quiz", "transcript"],
    ),
    (
        re.compile(r"\b((what|which) (classes|courses)|classes (should|to take)|courses (should|to take)|next year'?s? (classes|courses|schedule))\b", re.IGNORECASE),
        "To pick classes that build on your grades",
        ["transcript"],
    ),
]

ASKS = {
    "tests": {
        "label": "your SAT or ACT score (a practice or PSAT score works)",
        "fields": [
            {"id": "sat", "label": "SAT", "placeholder": "400-1600"},
            {"id": "act", "label": "ACT", "placeholder": "1-36"},
        ],
    },
    "hours": {
        "label": "about how many volunteer hours you have",
        "fields": [{"id": "service_hours", "label": "Volunteer hours", "placeholder": "e.g. 40"}],
    },
    "transcript": {"label": "your transcript, so I can see your grades", "link": {"label": "Upload my transcript", "href": "/profile#documents"}},
    "quiz": {"label": "your interest quiz results", "link": {"label": "Take the interest quiz", "href": "/discover"}},
}


def _missing(key: str, record: dict) -> bool:
    if key == "tests":
        tests = record.get("tests") or {}
        # "Haven't taken it yet" is an answer too.
        return not (tests.get("sat") or tests.get("act") or tests.get("plan"))

    if key == "hours":
        return record.get("service_hours") is None

    if key == "transcript":
        return not record.get("academics")

    if key == "quiz":
        return not record.get("riasec")

    return False


def needs_for(message: str, record: dict, already_asked: set[str]) -> dict | None:
    """What to ask for before (or while) answering this message, or None."""

    for pattern, purpose, keys in TOPICS:
        if not pattern.search(message):
            continue

        missing = [key for key in keys if _missing(key, record) and key not in already_asked]

        if not missing:
            return None

        labels = [ASKS[key]["label"] for key in missing]
        joined = labels[0] if len(labels) == 1 else ", ".join(labels[:-1]) + " and " + labels[-1]

        return {
            "keys": missing,
            "question": f"{purpose}, I need {joined}.",
            "fields": [field for key in missing for field in ASKS[key].get("fields", [])],
            "links": [ASKS[key]["link"] for key in missing if "link" in ASKS[key]],
        }

    return None


def answer_text(values: dict) -> str:
    """The student's answers from the chat form, as a message the record update understands."""

    parts = []

    if values.get("sat"):
        parts.append(f"I got {values['sat']} on the SAT")

    if values.get("act"):
        parts.append(f"I got {values['act']} on the ACT")

    if values.get("service_hours"):
        parts.append(f"I have {values['service_hours']} volunteer hours")

    return (" and ".join(parts) + ".") if parts else ""
