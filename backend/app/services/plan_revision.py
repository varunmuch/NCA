"""
"Revise with AI", as an agent.

1. understand: the model turns the student's request into which parts of
   the plan to change, a new goal if they named one, and preferences for
   colleges (cheaper, closer, more likely, public...) and classes.
2. steer: code applies the college preferences to the candidate list, so
   "cheaper colleges" really yields cheaper colleges, not just new words.
3. keep: parts the request didn't touch stay exactly as they were.
4. diff: code lists what changed (steps, classes, majors, colleges,
   certifications, careers) for a "What changed" card on the new version.
"""

import logging
import re

from app.core.llm import LLMError, chat_json, untrusted_block
from app.services import college_match, school_courses

logger = logging.getLogger(__name__)

PARTS = {
    "next_steps": "the 3 steps for this month",
    "this_year": "the rest of this year",
    "high_school": "the focus for each grade",
    "courses": "high school classes",
    "majors": "college majors",
    "colleges": "colleges",
    "certifications": "certifications",
    "careers": "careers to explore",
    "skills": "skills to build",
    "after_high_school": "routes after high school",
}

# Plan fields the model writes, by part.
PLAN_FIELDS = {"next_steps", "this_year", "high_school", "careers", "skills", "after_high_school"}
PATHWAY_FIELDS = {"courses", "majors", "colleges", "certifications"}

PROMPT = """You turn a high school student's request to change their career plan into instructions for the app. Output JSON only.

- parts: which parts of the plan the request changes (from the list). A general request ("make it better", "make it more about me") changes next_steps, this_year and courses. A new career direction changes every part.
- goal: a career or direction they now want, only if they name one ("I want to be a nurse instead"); else "".
- colleges: preferences for colleges ONLY when the request says so in words; "" (or []) for everything not mentioned. Never add a preference the student didn't ask for.
  cost: "lower" for cheaper or more affordable. location: "closer" for near home or Orlando/Kissimmee, "anywhere" if they want farther. selectivity: "more_likely" for easier to get into or safer, "more_reach" for more competitive or dream schools. kind: "public", "private", "state_college" (start at a 2-year college), "university".
  add / remove: college names they ask to add or drop.
- courses: "more_advanced" for more AP/honors/dual enrollment or harder classes, "lighter" for an easier load, "" otherwise. add / remove: class names they ask for.
- summary: one short sentence, addressed to "you", saying what you'll change ("I'll swap in cheaper colleges near Orlando and add more AP classes.").
- clear: false only when the request is too vague to know what to change ("change it", "make it better", "I don't like it", "idk"). Then question: one short question asking what they'd like changed, and options: 3 or 4 short, specific choices that fit this plan (like "Cheaper colleges", "More AP classes", "Different career"). When clear is true, question is "" and options [].

The current plan is below for reference."""

SCHEMA = {
    "type": "object",
    "properties": {
        "parts": {"type": "array", "items": {"type": "string", "enum": list(PARTS)}, "maxItems": 10},
        "goal": {"type": "string", "maxLength": 100},
        "colleges": {
            "type": "object",
            "properties": {
                "cost": {"type": "string", "enum": ["", "lower"]},
                "location": {"type": "string", "enum": ["", "closer", "anywhere"]},
                "selectivity": {"type": "string", "enum": ["", "more_likely", "more_reach"]},
                "kind": {"type": "string", "enum": ["", "public", "private", "state_college", "university"]},
                "add": {"type": "array", "items": {"type": "string", "maxLength": 80}, "maxItems": 4},
                "remove": {"type": "array", "items": {"type": "string", "maxLength": 80}, "maxItems": 6},
            },
            "required": ["cost", "location", "selectivity", "kind", "add", "remove"],
        },
        "courses": {
            "type": "object",
            "properties": {
                "level": {"type": "string", "enum": ["", "more_advanced", "lighter"]},
                "add": {"type": "array", "items": {"type": "string", "maxLength": 80}, "maxItems": 4},
                "remove": {"type": "array", "items": {"type": "string", "maxLength": 80}, "maxItems": 6},
            },
            "required": ["level", "add", "remove"],
        },
        "summary": {"type": "string", "maxLength": 240},
        "clear": {"type": "boolean"},
        "question": {"type": "string", "maxLength": 160},
        "options": {"type": "array", "items": {"type": "string", "maxLength": 50}, "maxItems": 4},
    },
    "required": ["parts", "goal", "colleges", "courses", "summary", "clear", "question", "options"],
}


# A preference only counts when the request has words for it; the model
# tends to fill every field.
EVIDENCE = {
    ("colleges", "cost"): r"cheap|afford|cost|price|money|expensive|tuition|budget|debt|scholarship",
    ("colleges", "location"): r"close|near|home|local|orlando|kissimmee|osceola|far|away|out of state|anywhere|drive",
    ("colleges", "selectivity"): r"easier|easy|safe|likely|chance|get into|competitive|reach|dream|harder|selective|top|ivy",
    ("colleges", "kind"): r"public|private|state college|community college|2-year|two-year|university|universities|transfer",
    ("courses", "level"): r"\bap\b|honors|dual|advanced|harder|challeng|rigor|easier|lighter|less|fewer|too many|stress",
}

# College Board AP courses, by the subject area they build on.
AP_BY_AREA = {
    "Math": ["AP Statistics", "AP Calculus BC", "AP Precalculus", "AP Calculus AB"],
    "Science": ["AP Physics 1", "AP Chemistry", "AP Biology", "AP Environmental Science", "AP Physics C: Mechanics"],
    "Computer science": ["AP Computer Science A", "AP Computer Science Principles"],
    "Engineering": ["AP Physics 1", "AP Physics C: Mechanics", "AP Calculus BC"],
    "English": ["AP English Language and Composition", "AP English Literature and Composition", "AP Seminar"],
    "Social studies": ["AP Psychology", "AP United States History", "AP Macroeconomics", "AP United States Government and Politics"],
    "World language": ["AP Spanish Language and Culture"],
    "Arts": ["AP 2-D Art and Design", "AP Drawing", "AP Art History", "AP Music Theory"],
    "Business": ["AP Macroeconomics", "AP Microeconomics"],
    "Health & PE": ["AP Biology", "AP Psychology"],
}


def _plan_outline(content: dict) -> str:
    pathway = content.get("pathway") or {}
    lines = [
        "Steps: " + "; ".join(step.get("title", "") for step in content.get("next_steps") or []),
        "Careers: " + ", ".join(card.get("title", card.get("slug", "")) for card in content.get("careers") or []),
        "Classes: " + ", ".join(f"{course['course']} ({course['grade']})" for course in pathway.get("courses") or []),
        "Majors: " + ", ".join(major["title"] for major in pathway.get("majors") or []),
        "Colleges: " + ", ".join(college["name"] for college in pathway.get("colleges") or []),
        "Certifications: " + ", ".join(cert["name"] for cert in pathway.get("certifications") or []),
    ]

    return "\n".join(lines)


async def understand(instruction: str, content: dict) -> dict:
    """What to change, from the student's own words. Falls back to a broad revision."""

    fallback = {
        "parts": ["next_steps", "this_year", "courses"],
        "goal": "",
        "colleges": {"cost": "", "location": "", "selectivity": "", "kind": "", "add": [], "remove": []},
        "courses": {"level": "", "add": [], "remove": []},
        "summary": "",
    }

    if not instruction.strip():
        return fallback

    try:
        raw = await chat_json(
            [
                {"role": "system", "content": PROMPT + "\n\nParts: " + "; ".join(f"{key} = {text}" for key, text in PARTS.items()) + "\n\n## Current plan\n" + _plan_outline(content)},
                {"role": "user", "content": untrusted_block("student_request", instruction)},
            ],
            schema=SCHEMA,
            schema_name="plan_revision",
            max_tokens=500,
            temperature=0,
        )
    except LLMError:
        logger.warning("Couldn't read the revision request; revising broadly")
        return fallback

    parts = [part for part in raw.get("parts") or [] if part in PARTS] or fallback["parts"]
    colleges = {**fallback["colleges"], **(raw.get("colleges") or {})}
    courses = {**fallback["courses"], **(raw.get("courses") or {})}

    for (group, key), pattern in EVIDENCE.items():
        target = colleges if group == "colleges" else courses

        if target.get(key) and not re.search(pattern, instruction, re.IGNORECASE):
            target[key] = ""

    # Named colleges or classes must be in the request too.
    for target in (colleges, courses):
        for key in ("add", "remove"):
            target[key] = [name for name in target.get(key) or [] if name and name.lower() in instruction.lower()]

    # Any college or class preference means that part changes.
    if any(colleges.get(key) for key in ("cost", "location", "selectivity", "kind", "add", "remove")) and "colleges" not in parts:
        parts.append("colleges")

    if any(courses.get(key) for key in ("level", "add", "remove")) and "courses" not in parts:
        parts.append("courses")

    goal = (raw.get("goal") or "").strip()

    if goal:
        parts = list(PARTS)

    result = {"parts": parts, "goal": goal, "colleges": colleges, "courses": courses, "summary": (raw.get("summary") or "").strip()}

    # Too vague to act on: ask instead of guessing. Never for a request that
    # names a part, a goal or a preference.
    specific = goal or any(colleges.get(key) for key in ("cost", "location", "selectivity", "kind", "add", "remove")) or any(courses.get(key) for key in ("level", "add", "remove"))
    named_part = re.search(r"college|school|class|course|ap\b|step|career|major|cert|skill|goal|month|year|cheap|near|hands|free", instruction, re.IGNORECASE)

    if raw.get("clear") is False and not specific and not named_part:
        result["clarify"] = {
            "question": (raw.get("question") or "What would you like me to change in your plan?").strip(),
            "options": [option for option in raw.get("options") or [] if option.strip()][:4]
            or ["Cheaper colleges closer to home", "More AP classes", "Different next steps", "A different career"],
        }

    return result


def _matches(name: str, wanted: list[str]) -> bool:
    words = {word for word in re.findall(r"[a-z]+", name.lower()) if word not in {"university", "of", "college", "the", "florida", "state"}}
    acronym = "".join(word[0] for word in re.findall(r"[A-Za-z]+", name) if word[0].isupper()).lower()

    for item in wanted:
        target = item.lower().strip()
        target_words = {word for word in re.findall(r"[a-z]+", target) if word not in {"university", "of", "college", "the", "florida", "state"}}

        if target == acronym or target in name.lower() or (target_words and target_words <= words):
            return True

    return False


def steer_colleges(found: dict, prefs: dict, record: dict, previous: list[dict], majors: list[str]) -> list[str]:
    """
    Reshape the college candidates to the student's preferences, in code.
    Returns plain-words notes on what was applied, for the model and the card.
    """

    candidates = list(found.get("colleges") or [])
    notes = []

    # Colleges they ask for by name, if a Florida college offers the major.
    if prefs.get("add"):
        known = {college["id"] for college in candidates}

        for card in college_match.colleges_for_majors(majors, record, limit=40) if majors else []:
            if card["id"] not in known and _matches(card["name"], prefs["add"]):
                candidates.append({**{key: card[key] for key in ("id", "name", "city", "ownership", "kind", "url", "net_price", "graduation_rate", "students")}, "central_florida": False, "programs": card["programs"]})
                notes.append(f"added {card['name']} as you asked")

    if prefs.get("remove"):
        before = len(candidates)
        candidates = [college for college in candidates if not _matches(college["name"], prefs["remove"])]

        if len(candidates) < before:
            notes.append("dropped " + ", ".join(prefs["remove"]))

    def chance(college: dict) -> int | None:
        official = college_match.college(college["id"])
        return college_match.fit_label(official, record).get("chance") if official else None

    kind = prefs.get("kind")

    if kind:
        keep = {
            "public": lambda college: college["ownership"] == "Public",
            "private": lambda college: college["ownership"] != "Public",
            "state_college": lambda college: college["kind"] == "2-year" or "State College" in college["name"],
            "university": lambda college: college["kind"] == "4-year",
        }[kind]
        filtered = [college for college in candidates if keep(college)]

        if len(filtered) >= 3:
            candidates = filtered
            notes.append({"public": "public colleges only", "private": "private colleges only", "state_college": "starting at a state college", "university": "four-year universities only"}[kind])

    if prefs.get("location") == "closer":
        near = [college for college in candidates if college.get("central_florida")]

        if len(near) >= 3:
            candidates = near + [college for college in candidates if college not in near][:2]
            notes.append("colleges near Kissimmee and Orlando first")

    if prefs.get("selectivity") == "more_likely":
        likely = [college for college in candidates if (chance(college) or 100) >= 50]

        if len(likely) >= 3:
            candidates = likely
            notes.append("colleges where your estimated chance is 50% or more")
    elif prefs.get("selectivity") == "more_reach":
        candidates.sort(key=lambda college: chance(college) if chance(college) is not None else 100)
        notes.append("more competitive colleges first")

    if prefs.get("cost") == "lower":
        priced = [college for college in candidates if college.get("net_price")]
        previous_prices = [college["net_price"] for college in previous if college.get("net_price")]
        # At or below the middle of what they had, so the list really gets cheaper.
        ceiling = sorted(previous_prices)[(len(previous_prices) - 1) // 2] if previous_prices else None

        priced.sort(key=lambda college: college["net_price"])
        cheaper = [college for college in priced if ceiling is None or college["net_price"] <= ceiling]

        if len(cheaper) >= 3:
            candidates = cheaper + [college for college in candidates if not college.get("net_price") and college["kind"] == "2-year"]
            notes.append("lower average cost after aid")

    found["colleges"] = candidates[:14]

    return notes


def steer_courses(found: dict, prefs: dict, record: dict | None = None) -> list[str]:
    notes = []
    courses = list(found.get("courses") or [])

    if prefs.get("level") == "more_advanced":
        # More AP choices from the subjects where their grades are strongest.
        areas = ((record or {}).get("academics") or {}).get("strong_areas") or ["Math", "Science"]
        offered = school_courses.advanced_in(areas) if school_courses.offered() else [course for area in areas for course in AP_BY_AREA.get(area, [])]
        extra = [course for course in offered if course not in courses]
        courses = list(dict.fromkeys(courses + extra))
        advanced = [course for course in courses if course.startswith(("AP ", "AICE ", "Dual enrollment")) or "Honors" in course]
        found["courses"] = advanced + [course for course in courses if course not in advanced]
        courses = found["courses"]
        notes.append("more AP, honors and dual enrollment classes")
    elif prefs.get("level") == "lighter":
        found["courses"] = [course for course in courses if not course.startswith("AP ")] + [course for course in courses if course.startswith("AP ")][:2]
        notes.append("a lighter class load")

    if prefs.get("remove"):
        found["courses"] = [course for course in found["courses"] if not any(item.lower() in course.lower() for item in prefs["remove"])]
        notes.append("dropped " + ", ".join(prefs["remove"]))

    return notes


def keep_untouched(new: dict, old: dict, parts: list[str]) -> None:
    """Parts the request didn't ask to change stay exactly as they were."""

    if not old:
        return

    for field in PLAN_FIELDS:
        if field not in parts and field in old:
            new[field] = old[field]

    if field_keep := [field for field in PATHWAY_FIELDS if field not in parts]:
        new_pathway, old_pathway = new.get("pathway"), old.get("pathway")

        if new_pathway and old_pathway and new_pathway.get("career_slug") == old_pathway.get("career_slug"):
            for field in field_keep:
                if field in old_pathway:
                    new_pathway[field] = old_pathway[field]

    # Plan careers and their mirror stay in step.
    if "careers" not in parts and "careers_exploring" in old:
        new["careers_exploring"] = old["careers_exploring"]


def _names(items: list, key: str) -> list[str]:
    return [item.get(key, "") if isinstance(item, dict) else str(item) for item in items or []]


def diff(old: dict, new: dict) -> list[dict]:
    """What changed between two plan versions, by part, in the student's terms."""

    old_pathway = old.get("pathway") or {}
    new_pathway = new.get("pathway") or {}
    sections = [
        ("Steps this month", _names(old.get("next_steps"), "title"), _names(new.get("next_steps"), "title")),
        ("Careers", _names(old.get("careers"), "title"), _names(new.get("careers"), "title")),
        ("Classes", [f"{c['course']} ({c['grade']})" for c in old_pathway.get("courses") or []], [f"{c['course']} ({c['grade']})" for c in new_pathway.get("courses") or []]),
        ("Majors", _names(old_pathway.get("majors"), "title"), _names(new_pathway.get("majors"), "title")),
        ("Colleges", _names(old_pathway.get("colleges"), "name"), _names(new_pathway.get("colleges"), "name")),
        ("Certifications", _names(old_pathway.get("certifications"), "name"), _names(new_pathway.get("certifications"), "name")),
    ]
    changes = []

    for label, before, after in sections:
        added = [item for item in after if item and item not in before]
        removed = [item for item in before if item and item not in after]

        if added or removed:
            changes.append({"part": label, "added": added, "removed": removed})

    if old.get("career_goal") != new.get("career_goal") and new.get("career_goal"):
        changes.insert(0, {"part": "Goal", "added": [new["career_goal"]], "removed": [old.get("career_goal", "")] if old.get("career_goal") else []})

    return changes


def ensure_course_change(pathway: dict, previous: dict | None, prefs: dict, found_courses: list[str], record: dict, next_grade: str) -> list[str]:
    """If they asked for more advanced classes and the picks didn't grow, add some."""

    if prefs.get("level") != "more_advanced" or not pathway:
        return []

    from app.services import pathways

    def advanced(items):
        return [item for item in items if item["course"].startswith(("AP ", "Dual enrollment"))]

    before = len(advanced((previous or {}).get("courses") or []))
    current = pathway.get("courses") or []

    if len(advanced(current)) > before:
        return []

    academics = record.get("academics") or {}
    taken = {course["name"].lower() for course in academics.get("courses") or []} | {name.lower() for name in academics.get("in_progress") or []}
    have = {item["course"] for item in current}
    added = []

    for course in found_courses:
        if len(added) >= 3:
            break

        if course.startswith(("AP ", "Dual enrollment")) and course not in have and course.lower() not in taken:
            current.append({"course": course, "grade": next_grade, "kind": pathways.course_kind(course), "why": "Added because you asked for more advanced classes; it builds on your strongest subjects."})
            added.append(course)

    pathway["courses"] = school_courses.describe(current)

    return [f"added {', '.join(added)}"] if added else []


def apply_course_edits(pathway: dict, prefs: dict, next_grade: str) -> list[str]:
    """Classes the student named: add the ones asked for, drop the ones they don't want."""

    if not pathway:
        return []

    from app.services import pathways

    notes = []
    courses = list(pathway.get("courses") or [])

    for name in prefs.get("remove") or []:
        kept = [course for course in courses if name.lower() not in course["course"].lower()]

        if len(kept) < len(courses):
            notes.append(f"removed {name}")
            courses = kept

    for name in prefs.get("add") or []:
        # The school's own name for it ("AP Calc" is "AP Calculus AB & BC").
        title = school_courses.name_for(name) or name.strip()

        if not any(title.lower() in course["course"].lower() or name.lower() in course["course"].lower() for course in courses):
            courses.append({"course": title, "grade": next_grade, "kind": pathways.course_kind(title), "why": "Added because you decided on it with your counselor."})
            notes.append(f"added {title}")

    pathway["courses"] = school_courses.describe(courses)

    return notes
