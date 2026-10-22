"""
Suggestions from a student's transcript or resume, aimed at their goal.

Code does the comparing; the model only explains and picks from lists:

- Transcript: the goal career's recommended courses (College Board AP list
  plus core courses) are matched against courses completed and in progress,
  so the student sees what's done, what's underway, and what to take next.
- Resume: the career's O*NET skills and knowledge are matched against the
  resume's skills, projects and activities, so the student sees strengths
  and gaps; suggestions may name only certifications from the official list.

Reviews are kept on the document (parsed_profile_json["review"]) and rebuilt
when the student's goal changes or the document is processed again.
"""

import re
from datetime import datetime, timezone

from app.core.database import AsyncSessionLocal
from app.core.llm import chat_json
from app.db.models import ResumeDocument
from app.services import career_catalog, field_quiz, interest_quiz, pathways, text_clean
from app.services.document_service import get_owned_document
from app.services.student_service import get_profile_dict

REVIEW_VERSION = 2

STOP_WORDS = {"ap", "honors", "honor", "and", "of", "the", "intro", "introduction", "to", "in", "cte", "course", "on", "at"}

# Course levels matter: Algebra 1 is not Algebra 2.
NUMERALS = {"i": "1", "ii": "2", "iii": "3", "iv": "4"}

# Words too general to link a core course to a career's AP courses.
GENERIC_WORDS = {"science", "studies", "art", "design", "principles", "a", "b", "ab", "bc", "1", "2", "3"}

# Words that mean the same subject in course names.
SYNONYMS = {"calc": "calculus", "bio": "biology", "chem": "chemistry", "comp": "computer", "sci": "science", "cs": "computer science", "stats": "statistics", "statistic": "statistics", "geom": "geometry", "precalc": "precalculus", "pre-calculus": "precalculus"}


def _words(text: str) -> set[str]:
    words = re.findall(r"[a-z]+(?:-[a-z]+)?|\d+", (text or "").lower())
    expanded = " ".join(SYNONYMS.get(word, NUMERALS.get(word, word)) for word in words)
    return {word for word in expanded.split() if word not in STOP_WORDS}


def _level(name: str) -> str:
    lowered = name.lower()

    if re.search(r"\bap\b", lowered):
        return "AP"

    if "dual" in lowered:
        return "Dual enrollment"

    return ""


def course_taken(recommended: str, taken: list[str]) -> str | None:
    """
    The transcript course that covers a recommended one, if any. Every
    meaningful word of the recommended course must appear, and an AP course
    only counts as done when the transcript course is AP too.
    """

    wanted = _words(recommended)

    if not wanted:
        return None

    for course in taken:
        if wanted <= _words(course) and (_level(recommended) != "AP" or _level(course) == "AP"):
            return course

    return None


def _skill_matches(skill: str, evidence: list[str]) -> str | None:
    wanted = _words(skill)

    for item in evidence:
        have = _words(item)

        if wanted and (wanted <= have or len(wanted & have) >= 2):
            return item

    return None


def goal_slug(profile: dict) -> str | None:
    """The student's goal career, else their best quiz match."""

    anchor = field_quiz.anchor_for(profile)

    if anchor:
        return anchor

    result = interest_quiz.result_payload(profile)

    if result and result.get("careers"):
        return result["careers"][0]["slug"]

    return None


def compare_transcript(slug: str, extraction: dict) -> dict:
    completed = [course.get("name", "") for course in extraction.get("courses_completed") or [] if course.get("name")]
    in_progress = [name for name in extraction.get("courses_in_progress") or [] if name]
    facts = career_catalog.career_facts(slug) or {}
    ap_words = set().union(*(_words(ap) for ap in facts.get("ap_courses") or [""])) - GENERIC_WORDS
    recommended = list(facts.get("ap_courses") or []) + [
        course for course in pathways.CORE_COURSES if (_words(course) - GENERIC_WORDS) & ap_words
    ]
    # Math sequence matters for nearly every path.
    recommended += [course for course in ("Algebra 2", "Precalculus", "Statistics") if course not in recommended]

    done, underway, next_up = [], [], []

    for course in dict.fromkeys(recommended):
        if match := course_taken(course, completed):
            done.append({"course": course, "matched": match})
        elif match := course_taken(course, in_progress):
            underway.append({"course": course, "matched": match})
        else:
            next_up.append(course)

    return {"done": done, "in_progress": underway, "next_up": next_up}


def compare_resume(slug: str, extraction: dict) -> dict:
    career = career_catalog.get_career(slug) or {}
    evidence = [
        *extraction.get("skills", []),
        *extraction.get("projects", []),
        *extraction.get("activities", []),
        *extraction.get("work_experience", []),
        *extraction.get("volunteering", []),
        *extraction.get("awards", []),
    ]
    wanted = list(dict.fromkeys([*career.get("skills", [])[:6], *career.get("knowledge", [])[:3]]))
    strengths, gaps = [], []

    for skill in wanted:
        if match := _skill_matches(skill, evidence):
            strengths.append({"skill": skill, "evidence": match})
        else:
            gaps.append(skill)

    return {"strengths": strengths, "gaps": gaps, "has_projects": bool(extraction.get("projects"))}


TRANSCRIPT_PROMPT = """You review a high school student's transcript against the courses that lead to a career, and suggest what to take next. The comparison is already done by the app; you explain it in warm, plain words for a 9th grader.

Rules:
- summary: 2 sentences: what they've already done that helps, and the most useful next step. Mention specific course names from the lists.
- next_courses: up to 4 picks from "Not taken yet", in the order to take them, each with one sentence on why it helps this career and how it builds on a course they took.
- tips: up to 2 short, practical tips, each one sentence. You may mention dual enrollment at Valencia College or Florida Virtual School, but never name a specific college course, program, or website.
- Never comment on grades as good or bad, never rule anything out, and never invent course names, requirements or numbers.
- Plain text only: no Markdown, no asterisks. Address the student as "you"."""

RESUME_PROMPT = """You review a high school student's resume against the skills a career needs, and suggest improvements. The comparison is already done by the app; you explain it in warm, plain words for a 9th grader.

Rules:
- summary: 2 sentences: the strongest things already on the resume for this career, and the biggest opportunity.
- suggestions: 3 to 5 concrete actions, each one sentence starting with a verb: a project they could build, an activity to join, how to describe something they already did, or a skill to show. Tie each to a skill from "Not shown yet" or to something already on the resume.
- certifications: up to 2 picks from the list, only ones a teenager could work toward, with one sentence on why.
- Never judge the student's character or ability, never invent experience, awards or numbers, and never suggest claiming a skill they haven't shown; suggest describing only what they actually did, or doing something new.
- Plain text only: no Markdown, no asterisks. Address the student as "you"."""


def _list_text(title: str, items: list[str]) -> str:
    return f"## {title}\n" + ("\n".join(f"- {item}" for item in items) if items else "(none)")


async def _review_transcript(slug: str, extraction: dict, grade: str) -> dict:
    compared = compare_transcript(slug, extraction)
    career = career_catalog.get_career(slug) or {}
    schema = {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "maxLength": 500},
            "next_courses": {
                "type": "array",
                "maxItems": 4,
                "items": {
                    "type": "object",
                    "properties": {
                        "course": {"type": "string", "enum": compared["next_up"] or ["none"]},
                        "why": {"type": "string", "maxLength": 260},
                    },
                    "required": ["course", "why"],
                },
            },
            "tips": {"type": "array", "maxItems": 2, "items": {"type": "string", "maxLength": 220}},
        },
        "required": ["summary", "next_courses", "tips"],
    }
    raw = await chat_json(
        [
            {"role": "system", "content": TRANSCRIPT_PROMPT},
            {
                "role": "user",
                "content": "\n\n".join(
                    [
                        f"Career goal: {career.get('title', slug)}. Student's grade: {grade or 'unknown'}.",
                        _list_text("Already done", [f"{item['course']} (transcript: {item['matched']})" for item in compared["done"]]),
                        _list_text("In progress", [f"{item['course']} (transcript: {item['matched']})" for item in compared["in_progress"]]),
                        _list_text("Not taken yet", compared["next_up"]),
                    ]
                ),
            },
        ],
        schema=schema,
        schema_name="transcript_review",
        max_tokens=1200,
        temperature=0.3,
    )
    allowed = set(compared["next_up"])
    seen = set()
    next_courses = []

    for item in raw.get("next_courses") or []:
        if item.get("course") in allowed and item["course"] not in seen:
            seen.add(item["course"])
            next_courses.append({"course": item["course"], "kind": pathways.course_kind(item["course"]), "why": text_clean.clean_paragraph(item.get("why", ""))})

    return {
        **compared,
        "summary": text_clean.clean_paragraph(raw.get("summary", "")),
        "next_courses": next_courses,
        "tips": text_clean.clean_items(raw.get("tips"), 2),
    }


async def _review_resume(slug: str, extraction: dict) -> dict:
    compared = compare_resume(slug, extraction)
    career = career_catalog.get_career(slug) or {}
    certs = [cert for cert in await pathways.certifications(career.get("onet_code") or "") if cert["beginner_friendly"]][:8]
    cert_ids = [cert["id"] for cert in certs]
    schema = {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "maxLength": 500},
            "suggestions": {"type": "array", "minItems": 3, "maxItems": 5, "items": {"type": "string", "maxLength": 240}},
            "certifications": {
                "type": "array",
                "maxItems": 2 if cert_ids else 0,
                "items": {
                    "type": "object",
                    "properties": {"id": {"type": "string", "enum": cert_ids or ["none"]}, "why": {"type": "string", "maxLength": 220}},
                    "required": ["id", "why"],
                },
            },
        },
        "required": ["summary", "suggestions", "certifications"],
    }
    raw = await chat_json(
        [
            {"role": "system", "content": RESUME_PROMPT},
            {
                "role": "user",
                "content": "\n\n".join(
                    [
                        f"Career goal: {career.get('title', slug)}.",
                        _list_text("Shown on the resume", [f"{item['skill']} (resume: {item['evidence']})" for item in compared["strengths"]]),
                        _list_text("Not shown yet", compared["gaps"]),
                        _list_text("Resume projects", extraction.get("projects") or []),
                        _list_text("Resume activities", extraction.get("activities") or []),
                        _list_text("Certifications (id: name, organization)", [f"{cert['id']}: {cert['name']}, {cert['organization']}" for cert in certs]),
                    ]
                ),
            },
        ],
        schema=schema,
        schema_name="resume_review",
        max_tokens=1200,
        temperature=0.3,
    )
    by_id = {cert["id"]: cert for cert in certs}
    picked, seen = [], set()

    for item in raw.get("certifications") or []:
        if item.get("id") in by_id and item["id"] not in seen:
            seen.add(item["id"])
            cert = by_id[item["id"]]
            picked.append({**{key: cert[key] for key in ("name", "organization", "url")}, "why": text_clean.clean_paragraph(item.get("why", ""))})

    return {
        **compared,
        "summary": text_clean.clean_paragraph(raw.get("summary", "")),
        "suggestions": text_clean.clean_items(raw.get("suggestions"), 5),
        "certifications": picked,
    }


async def review_document(student_id: str, document_id: int, *, refresh: bool = False) -> dict:
    record = await get_owned_document(student_id, document_id)
    parsed = record.parsed_profile_json or {}
    extraction = parsed.get("extraction")

    if record.status != "processed" or not extraction:
        return {"status": "not_ready", "message": "We're still reading this document. Check back in a minute."}

    if record.doc_type not in ("transcript", "resume"):
        return {"status": "unsupported", "message": "Suggestions are available for transcripts and resumes."}

    profile = await get_profile_dict(student_id)
    slug = goal_slug(profile)

    if slug is None:
        return {"status": "needs_goal", "message": "Tell us a career you're curious about, or take the interest quiz, to get suggestions."}

    cached = parsed.get("review") or {}

    if not refresh and cached.get("goal_slug") == slug and cached.get("version") == REVIEW_VERSION:
        return cached

    if record.doc_type == "transcript":
        body = await _review_transcript(slug, extraction, profile.get("grade_level", ""))
    else:
        body = await _review_resume(slug, extraction)

    review = {
        "status": "ready",
        "version": REVIEW_VERSION,
        "doc_type": record.doc_type,
        "goal_slug": slug,
        "goal_title": (career_catalog.get_career(slug) or {}).get("title", ""),
        "goal_source": "goal" if field_quiz.anchor_for(profile) == slug else "quiz",
        "created_at": datetime.now(timezone.utc).isoformat(),
        **body,
    }

    async with AsyncSessionLocal() as db:
        stored = await db.get(ResumeDocument, document_id)
        stored.parsed_profile_json = {**(stored.parsed_profile_json or {}), "review": review}
        await db.commit()

    return review
