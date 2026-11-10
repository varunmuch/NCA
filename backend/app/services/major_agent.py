"""
The agentic end of the interest quiz.

1. follow_ups: after the RIASEC parts, look at what the student's records
   already show and ask only what's missing (SAT/ACT, service hours, the
   major they want, interests), plus up to two questions the model writes
   about this student's own grades, activities and quiz answers.
2. recommend: the model picks three major + minor sets from official
   Florida fields. The major follows the student's preference (or their
   grades and resume when they have none); the minor follows the quiz.
   Code checks every pick, attaches careers and colleges, and removes any
   figure the records don't back up.
"""

import logging
from datetime import datetime, timezone

from app.core.llm import LLMError, chat_json, untrusted_block
from app.services import career_catalog, college_match, grounding, student_record, text_clean
from app.services.student_service import get_profile_dict, list_facts, save_profile_dict

logger = logging.getLogger(__name__)

FOLLOW_UP_PROMPT = """You are the interest quiz for NeoCity Academy's career explorer in Kissimmee, Florida. The student just finished the RIASEC interest questions. Before suggesting a college major and minor, you may ask up to 2 short multiple-choice questions.

Ask only what would change which major or minor fits, and make each question about THIS student: start by naming one specific thing from their records in their own words ("On your robotics team...", "You got an A in AP Computer Science Principles..."), then ask the choice it raises. Never ask for something the records already answer. Never ask for SAT/ACT scores, service hours or the major they want; the app asks those itself.

Each question: one plain sentence a 9th grader understands, and 2 to 4 short options (under 8 words each). Address the student as "you". If nothing useful is left to ask, return an empty list."""

RECOMMEND_PROMPT = """You suggest college majors and minors for a high school student at NeoCity Academy in Kissimmee, Florida. You are an AI; these are suggestions to explore, not a verdict.

Give exactly 3 sets, each a major and a minor from the lists below (use the 4-digit codes). How to choose:
- MAJOR: the student's own preference comes first. If they named a major, set 1 uses it (code below). The other sets offer close alternatives that fit their grades and resume. If they named none, choose majors from their strongest grades, advanced courses, activities, jobs and projects.
- MINOR: from their interest quiz. Pick minors from the "Minors that fit the quiz" list, matching their RIASEC type. A minor must add a different field, never repeat a word of its major's name.
- why_major: one or two sentences naming specific evidence from the records: a course and grade, the GPA in a subject area, an activity, award, job or project. Use only facts in the records.
- why_minor: one sentence linking the minor to their interest type (say the type by name, like Investigative or Social) and, when possible, to something they do.
- summary: two sentences on what the records show about them overall. Mention their GPA only if it's in the records.
- Be realistic: grades matter a lot for getting into a major. If grades in the preferred major's key subjects are low, say so honestly and kindly, and what it would take (a course to take and do well in, tutoring), or a realistic alternative.
- Never write salaries, admission chances, rankings, or college names. Plain text, no Markdown, no field names. Address the student as "you"."""


def _questions_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "maxItems": 2,
                "items": {
                    "type": "object",
                    "properties": {
                        "question": {"type": "string", "maxLength": 200},
                        "options": {"type": "array", "minItems": 2, "maxItems": 4, "items": {"type": "string", "maxLength": 60}},
                    },
                    "required": ["question", "options"],
                },
            }
        },
        "required": ["questions"],
    }


def _record_block(record: dict, facts: list[dict]) -> str:
    confirmed = [f"{fact['category_label']}: {fact['value']}" for fact in facts if fact["status"] == "confirmed"][:20]
    text = student_record.record_text(record)

    if confirmed:
        text += "\n- Confirmed in chats: " + "; ".join(confirmed)

    return untrusted_block("student_records", text)


async def follow_ups(student_id: str) -> dict:
    """What the quiz still needs to ask this student."""

    profile = await get_profile_dict(student_id)
    record = await student_record.build_record(student_id, profile)
    told = profile.get("academic_profile") or {}
    fields = []

    fields.append(
        {
            "id": "intended_major",
            "kind": "text",
            "label": "What would you like to major in?",
            "hint": "Your preference becomes your major. Leave it blank if you're not sure; we'll suggest one from your grades and resume.",
            "value": told.get("intended_major") or profile.get("career_aspiration") or "",
            "optional": True,
        }
    )

    if not (record["tests"]["sat"] or record["tests"]["act"]):
        fields.append(
            {
                "id": "tests",
                "kind": "tests",
                "label": "Have you taken the SAT, PSAT or ACT?",
                "hint": "Scores help sort colleges into reach, match and likely, and check Bright Futures. Practice or PSAT scores are fine.",
                "optional": True,
            }
        )

    if record["service_hours"] is None:
        fields.append(
            {
                "id": "service_hours",
                "kind": "number",
                "label": "About how many community service hours do you have?",
                "hint": "Volunteering anywhere counts: church, school clubs, food banks, tutoring. Bright Futures needs 75 to 100.",
                "optional": True,
            }
        )

    resume = record.get("resume") or {}
    knows_interests = bool(profile.get("interests") or resume.get("activities") or told.get("interests"))

    if not knows_interests:
        fields.append(
            {
                "id": "interests",
                "kind": "text",
                "label": "What do you do for fun, or what could you talk about for hours?",
                "hint": "Hobbies, games, sports, clubs, things you make. Anything.",
                "optional": True,
            }
        )

    questions = []

    try:
        facts = await list_facts(student_id)
        raw = await chat_json(
            [
                {"role": "system", "content": FOLLOW_UP_PROMPT + "\n\n## What the records show\n" + _record_block(record, facts)},
                {"role": "user", "content": "Write your questions (or none)."},
            ],
            schema=_questions_schema(),
            schema_name="quiz_follow_ups",
            max_tokens=500,
            temperature=0.4,
        )
        corpus = student_record.record_text(record)

        for index, item in enumerate(raw.get("questions") or []):
            question, _ = grounding.ground_reply(text_clean.clean_paragraph(item.get("question", "")), corpus, note=False)
            options = [text_clean.plain_text(option)[:60] for option in item.get("options") or [] if option.strip()][:4]

            if question and len(options) >= 2:
                questions.append({"id": f"ai_{index + 1}", "kind": "choice", "label": question, "options": options, "optional": True})
    except LLMError:
        logger.warning("Follow-up questions unavailable; continuing with the fixed ones")

    return {
        "fields": fields + questions,
        "knows": {
            "transcript": bool(record["academics"]),
            "resume": bool(record["resume"]),
            "gpa": (record["academics"] or {}).get("gpa_unweighted"),
            "service_hours": record["service_hours"],
            "tests": record["tests"],
        },
    }


def _int(value) -> int | None:
    try:
        number = int(str(value).strip())
    except (TypeError, ValueError):
        return None

    return number if number > 0 else None


async def save_answers(student_id: str, answers: dict) -> dict:
    """Keep what the student told the quiz on their profile."""

    profile = await get_profile_dict(student_id)
    told = dict(profile.get("academic_profile") or {})

    if "intended_major" in answers:
        told["intended_major"] = str(answers.get("intended_major") or "").strip()[:120]

    sat = _int(answers.get("sat"))
    act = _int(answers.get("act"))

    if sat and 400 <= sat <= 1600:
        told["sat"] = sat

    if act and 1 <= act <= 36:
        told["act"] = act

    if answers.get("test_plan"):
        told["test_plan"] = str(answers["test_plan"])[:120]

    for key, limit in (("service_hours", 5000), ("paid_hours", 10000)):
        hours = _int(answers.get(key))

        if hours is not None and hours <= limit:
            told[key] = hours

    # An explicit empty value clears what the student told us (used by undo).
    for key in ("sat", "act", "service_hours", "paid_hours"):
        if key in answers and answers[key] in ("", 0, "0"):
            told.pop(key, None)

    if answers.get("interests"):
        told["interests"] = str(answers["interests"]).strip()[:400]

    extra = {key: value for key, value in (answers.get("follow_ups") or {}).items() if value}

    if extra:
        told["quiz_follow_ups"] = extra

    return await save_profile_dict(student_id, {"academic_profile": told})


def _recommend_schema(major_codes: list[str], minor_codes: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "maxLength": 420},
            "options": {
                "type": "array",
                "minItems": 3,
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "properties": {
                        "major": {"type": "string", "enum": major_codes},
                        "minor": {"type": "string", "enum": minor_codes},
                        "why_major": {"type": "string", "maxLength": 320},
                        "why_minor": {"type": "string", "maxLength": 240},
                    },
                    "required": ["major", "minor", "why_major", "why_minor"],
                },
            },
        },
        "required": ["summary", "options"],
    }


def _sets_from_rankings(record: dict, majors: list[dict], minors: list[dict], preferred: dict | None) -> dict:
    """Three major + minor sets from the rankings alone (when the model can't answer)."""

    code = (record.get("riasec") or {}).get("code", "")
    picked_majors = ([preferred] if preferred else []) + [major for major in majors if not preferred or major["cip4"] != preferred["cip4"]]
    options = []
    used_minors: set[str] = set()

    for major in picked_majors[:3]:
        major_words = college_match._words(major["title"])
        minor = next(
            (item for item in minors if item["cip4"] != major["cip4"] and item["cip4"] not in used_minors and not college_match._words(item["title"]) <= major_words),
            None,
        )

        if not minor:
            continue

        used_minors.add(minor["cip4"])
        strong = ", ".join((record.get("academics") or {}).get("strong_areas") or [])
        options.append(
            {
                "major": major["cip4"],
                "minor": minor["cip4"],
                "why_major": (
                    f"You told us you want to study {record['intended_major']}."
                    if preferred and major["cip4"] == preferred["cip4"]
                    else f"It fits your interests{f' and your strongest subjects ({strong})' if strong else ''}."
                ),
                "why_minor": f"It matches your {code} interest type." if code else "It matches your interests.",
            }
        )

    return {"summary": "", "options": options}


def _field(major: dict) -> dict:
    return {"cip4": major["cip4"], "cip": major["cip"], "title": major["title"]}


async def recommend(student_id: str) -> dict:
    profile = await get_profile_dict(student_id)
    record = await student_record.build_record(student_id, profile)
    facts = await list_facts(student_id)
    catalog = college_match.majors_catalog()

    preferred = college_match.find_major(record["intended_major"]) if record["intended_major"] else None
    majors = college_match.rank_majors(record, limit=30)

    if preferred and preferred["cip4"] not in {major["cip4"] for major in majors}:
        majors.insert(0, {**preferred, "interest_fit": round(100 * college_match.interest_fit((record["riasec"] or {}).get("scores") or {}, preferred))})

    minors = college_match.rank_minors(record, exclude=set(), limit=24)
    told = (profile.get("academic_profile") or {}).get("quiz_follow_ups") or {}

    lines = ["## Majors (code: title; interest fit 0-100)"]
    lines += [f"- {major['cip4']}: {major['title']} ({major['interest_fit']})" for major in majors]
    lines.append("\n## Minors that fit the quiz (code: title; interest fit 0-100)")
    lines += [f"- {minor['cip4']}: {minor['title']} ({minor['interest_fit']})" for minor in minors]

    request = "Suggest 3 major and minor sets."

    if preferred:
        request += f" The student wants to major in \"{record['intended_major']}\"; set 1's major is {preferred['cip4']} ({preferred['title']})."
    elif record["intended_major"]:
        request += f" The student said they'd like to major in \"{record['intended_major']}\"; use the closest major in the list for set 1."

    if told:
        request += "\nTheir answers to your follow-up questions: " + "; ".join(f"{question} -> {answer}" for question, answer in told.items())

    system = RECOMMEND_PROMPT + "\n\n## The student's records\n" + _record_block(record, facts) + "\n\n" + "\n".join(lines)
    try:
        raw = await chat_json(
            [{"role": "system", "content": system}, {"role": "user", "content": request}],
            schema=_recommend_schema([major["cip4"] for major in majors], [minor["cip4"] for minor in minors]),
            schema_name="major_minor",
            max_tokens=1400,
            temperature=0.4,
        )
    except LLMError:
        # The model sometimes runs on past its limit; the quiz still finishes,
        # with sets built in code from the same rankings.
        logger.warning("Major and minor sets built without the model")
        raw = _sets_from_rankings(record, majors, minors, preferred)

    corpus = student_record.record_text(record) + "\n" + "\n".join(f"{q} {a}" for q, a in told.items())

    def clean(text: str) -> str:
        cleaned, _ = grounding.ground_reply(text_clean.clean_paragraph(text), corpus, note=False)
        return cleaned

    options = []
    seen = set()

    for item in raw.get("options") or []:
        major = catalog.get(item.get("major"))
        minor = catalog.get(item.get("minor"))

        if not major or not minor or major["cip4"] == minor["cip4"] or (major["cip4"], minor["cip4"]) in seen:
            continue

        # A minor that just repeats the major ("Mathematics" with "Mathematics and Computer Science") adds nothing.
        if college_match._words(minor["title"]) <= college_match._words(major["title"]):
            continue

        seen.add((major["cip4"], minor["cip4"]))
        options.append({"major": _field(major), "minor": _field(minor), "why_major": clean(item.get("why_major", "")), "why_minor": clean(item.get("why_minor", ""))})

    # The student's own choice always leads.
    if preferred:
        if options and options[0]["major"]["cip4"] != preferred["cip4"]:
            match = next((option for option in options if option["major"]["cip4"] == preferred["cip4"]), None)

            if match:
                options.remove(match)
                options.insert(0, match)
            else:
                minor = next((m for m in minors if m["cip4"] != preferred["cip4"]), None)
                options.insert(
                    0,
                    {
                        "major": _field(preferred),
                        "minor": _field(minor) if minor else options[0]["minor"],
                        "why_major": f"You told us you want to major in {record['intended_major']}.",
                        "why_minor": options[0]["why_minor"] if options else "",
                    },
                )

        options[0]["preferred"] = True

    for option in options:
        major = catalog[option["major"]["cip4"]]
        option["careers"] = [
            {"slug": slug, "title": career["title"]}
            for slug in major["careers"][:5]
            if (career := career_catalog.get_career(slug))
        ]
        option["interest_fit"] = round(100 * college_match.interest_fit((record["riasec"] or {}).get("scores") or {}, major))
        option["florida_colleges"] = major["florida_bachelors"]

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": clean(raw.get("summary", "")),
        "options": options[:3],
        "based_on": {
            "transcript": bool(record["academics"]),
            "resume": bool(record["resume"]),
            "quiz": bool(record["riasec"]),
            "tests": bool(record["tests"]["sat"] or record["tests"]["act"]),
            "preference": record["intended_major"],
        },
    }

    await save_profile_dict(student_id, {"major_minor": result})

    return await with_colleges(student_id, result)


async def with_colleges(student_id: str, result: dict | None) -> dict | None:
    """A saved result plus colleges for each major, labeled against today's record."""

    if not result or not result.get("options"):
        return None

    profile = await get_profile_dict(student_id)
    record = await student_record.build_record(student_id, profile)
    options = []

    for option in result["options"]:
        cards = college_match.colleges_for_majors([option["major"]["cip4"]], record, limit=6)
        options.append({**option, "colleges": cards})

    return {**result, "options": options, "bright_futures": record["bright_futures"]}
