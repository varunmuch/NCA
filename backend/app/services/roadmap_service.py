"""
Career roadmaps: everything a student needs to work toward one career.

Two layers:
- Curated resources (app/data/career_resources.json): real programs,
  scholarships, and learning sites. The model never writes URLs; it can only
  pick resource ids from this list (enforced by the JSON schema enum).
- A personalized roadmap generated from the student's context: goals from
  the next two weeks to five years out, what to learn, courses, majors,
  colleges to research, and online searches.

Roadmaps are cached per student and career, and can be turned into a
progress timeline so the short-term goals become checkable tasks.
"""

import json
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus

from fastapi import HTTPException
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.llm import chat_json
from app.services import pathways, text_clean
from app.services import plan_stages
from app.db.models import CareerRoadmap, ProgressTimeline
from app.models.progress import ProgressTaskCreate, ProgressTimelineCreate
from app.services import career_catalog
from app.services.context_service import build_context, context_block
from app.services.progress_service import create_progress_task, create_progress_timeline


RESOURCES_PATH = Path(__file__).resolve().parents[1] / "data" / "career_resources.json"

# Schema key -> label. Each horizon is a required property (not an array
# item) because guided decoding does not enforce minItems.
HORIZON_KEYS = {
    "next_2_weeks": "Next 2 weeks",
    "this_semester": "This semester",
    "this_school_year": "This school year",
    "rest_of_high_school": "Rest of high school",
    "after_high_school": "After high school",
    "five_years_out": "5+ years out",
}

HORIZONS = list(HORIZON_KEYS.values())

# Horizons whose steps become progress tasks.
TRACKED_HORIZONS = HORIZONS[:3]

COURSE_KINDS = [
    "Core",
    "Honors",
    "AP",
    "IB",
    "Dual enrollment",
    "Career & technical (CTE)",
    "Elective",
    "Online (FLVS)",
]

COLLEGE_KINDS = [
    "State college / community college",
    "Public university",
    "Private college or university",
    "Technical college",
    "Apprenticeship",
    "Military / ROTC",
]

SEARCH_URLS = {
    "Khan Academy": "https://www.khanacademy.org/search?page_search_query={}",
    "Coursera": "https://www.coursera.org/search?query={}",
    "edX": "https://www.edx.org/search?q={}",
    "MIT OpenCourseWare": "https://ocw.mit.edu/search/?q={}",
    "freeCodeCamp": "https://www.freecodecamp.org/news/search/?query={}",
    "YouTube": "https://www.youtube.com/results?search_query={}",
}


@lru_cache(maxsize=1)
def _resources() -> dict:
    return json.loads(RESOURCES_PATH.read_text(encoding="utf-8"))


def curated_resources(family: str) -> list[dict]:
    """Family-specific resources first, then general ones."""

    data = _resources()
    items = list(data["families"].get(family, [])) + list(data["general"])

    return [{**item, "section_label": data["sections"][item["section"]]} for item in items]


def _text(max_length: int) -> dict:
    return {"type": "string", "maxLength": max_length}


def _items(properties: dict, required: list[str], max_items: int) -> dict:
    return {
        "type": "array",
        "maxItems": max_items,
        "items": {"type": "object", "properties": properties, "required": required},
    }


def _picks(key: str, values: list[str], max_items: int, why_length: int = 220) -> dict:
    """An array whose key must be one of the official choices (none: empty array)."""

    if not values:
        return {"type": "array", "maxItems": 0, "items": {"type": "object"}}

    return _items({key: {"type": "string", "enum": values}, "why": _text(why_length)}, [key, "why"], max_items)


def _schema(resource_ids: list[str], found: dict) -> dict:
    return {
        "type": "object",
        "properties": {
            "headline": _text(200),
            "where_you_are": _text(500),
            "ladder": {
                "type": "object",
                "properties": {
                    key: {
                        "type": "object",
                        "properties": {
                            "goal": _text(140),
                            "steps": {"type": "array", "items": _text(240), "maxItems": 4},
                        },
                        "required": ["goal", "steps"],
                    }
                    for key in HORIZON_KEYS
                },
                "required": list(HORIZON_KEYS),
            },
            "what_to_learn": _items(
                {"topic": _text(80), "why": _text(200), "how": _text(200)},
                ["topic", "why", "how"],
                6,
            ),
            # Courses, majors, certifications and colleges come from official
            # lists (pathways.py); the model only picks and explains.
            "high_school_courses": _picks("course", found["courses"], 7),
            "college_majors": _picks("cip", [major["cip"] for major in found["majors"]], 4),
            "certifications": _picks("id", [cert["id"] for cert in found["certifications"]], 3),
            "online_learning": _items(
                {
                    "topic": _text(80),
                    "provider": {"type": "string", "enum": list(SEARCH_URLS)},
                    "search": _text(60),
                    "why": _text(160),
                },
                ["topic", "provider", "search", "why"],
                5,
            ),
            "college_options": _picks("id", [college["id"] for college in found["colleges"]], 6),
            "picked_resources": _items(
                {"id": {"type": "string", "enum": resource_ids}, "why": _text(180)},
                ["id", "why"],
                8,
            ),
            "first_step": _text(170),
        },
        "required": [
            "headline",
            "where_you_are",
            "ladder",
            "what_to_learn",
            "high_school_courses",
            "college_majors",
            "certifications",
            "online_learning",
            "college_options",
            "picked_resources",
            "first_step",
        ],
    }


ROADMAP_PROMPT = """You build a step-by-step career roadmap for a high school student at NeoCity Academy, a public STEM magnet high school in Kissimmee, Florida (Osceola County). Many students have no idea how to get from where they are to a career, so make the path concrete. You are an AI; this is a starting point the student can change.

Rules:
- Use the O*NET career facts for what the job requires. Connect steps to the student's real grade, interests, courses, activities, and goals from the context, and name the connection.
- Plain text only in every field: no Markdown, no asterisks, no field names or underscores. Each step is one complete sentence.
- If the grade is unknown, assume they could be in any grade and write steps that work for grades 9-12; say so in where_you_are.
- ladder: fill every horizon, from next_2_weeks to five_years_out, with a goal and 2-4 steps. Early steps are small, specific, and doable this week (start with a verb). Later steps describe the education/training route and first jobs. Include more than one route (college, state/community college, apprenticeship, military, certificates) when realistic.
- what_to_learn: the knowledge and skills this career needs that a teenager can start building now, and how.
- high_school_courses, college_majors, certifications, college_options: pick ONLY from the official lists at the end, by exact name, cip, or id. The app adds official details itself.
- high_school_courses: prefer the AP courses listed for this career and the math and science that lead to them; skip courses the transcript shows are done.
- certifications: put first the ones marked as needing no degree or long work experience.
- online_learning: free topics to study, with a short search phrase for that provider.
- college_options: 4 to 6 Florida colleges, including at least one state college (2-year) for the start-there-then-transfer route; favor schools near NeoCity when they fit. Begin each why with that college's name and talk only about it. Never call a school top, strong, competitive, excellent, or prestigious, and never state rankings, costs, or requirements.
- picked_resources: choose the resources from the list below that best fit this student and career, and say why each fits them. Include at least two scholarships or fellowships when any fit. Only pick resources limited to a gender, ethnicity, or income level when the context clearly says the student qualifies.
- headline: one short, motivating sentence in "you" form, without the student's name (e.g. "You can start building toward nursing this week.").
- first_step: the single best thing to do today.
- Do not invent salaries, statistics, deadlines, award amounts, or program names. Never use grades to rule anything out.
- Write in clear, encouraging language a 9th grader understands. Always address the student as "you"."""


def _career_facts(career: dict) -> str:
    return (
        f"Career: {career['title']}\n"
        f"Also called: {', '.join(career['sample_titles'])}\n"
        f"Description: {career['description']}\n"
        f"Typical tasks: {'; '.join(career['tasks'])}\n"
        f"Important knowledge: {', '.join(career['knowledge'])}\n"
        f"Skills: {', '.join(career['skills'])}\n"
        f"High school subjects: {', '.join(career['subjects'])}\n"
        f"Typical preparation: {career['preparation']}. {career['education_summary']}"
    )


def _resource_list(resources: list[dict]) -> str:
    return "\n".join(
        f"- {item['id']}: {item['title']} ({item['section_label']}) — {item['description']}"
        for item in resources
    )


# Free-text fields inside roadmap list items (ids and enums are left alone).
PROSE_FIELDS = ("topic", "why", "how", "course", "major", "name")


COLLEGE_KIND_LABELS = {
    ("Public", "4-year"): "Public university",
    ("Public", "2-year"): "State college / community college",
    ("Private nonprofit", "4-year"): "Private college or university",
    ("Private nonprofit", "2-year"): "Private college or university",
}


def _official_picks(content: dict, found: dict) -> None:
    """Replace the model's picks with official names and details."""

    picks = pathways.attach(
        {
            "summary": "",
            "courses": [{"course": item.get("course"), "grade": "", "why": item.get("why", "")} for item in content.get("high_school_courses") or []],
            "majors": content.get("college_majors") or [],
            "colleges": content.get("college_options") or [],
            "certifications": content.get("certifications") or [],
        },
        found,
        text_clean.clean_paragraph,
    )

    content["high_school_courses"] = [
        {"course": item["course"], "kind": COURSE_KIND_LABELS.get(item["kind"], "Elective"), "why": item["why"]} for item in picks["courses"]
    ]
    content["college_majors"] = [{"major": item["title"], "why": item["why"]} for item in picks["majors"]]
    content["certifications"] = [
        {
            "name": item["name"],
            "organization": item["organization"],
            "url": item["url"],
            "beginner_friendly": item["beginner_friendly"],
            "why": item["why"],
        }
        for item in picks["certifications"]
    ]
    content["college_options"] = [
        {
            "name": item["name"],
            "kind": COLLEGE_KIND_LABELS.get((item["ownership"], item["kind"]), "Private college or university"),
            "city": item["city"],
            "url": item["url"],
            "net_price": item["net_price"],
            "graduation_rate": item["graduation_rate"],
            "why": item["why"],
        }
        for item in picks["colleges"]
    ]


COURSE_KIND_LABELS = {
    "AP": "AP",
    "Dual enrollment": "Dual enrollment",
    "Online": "Online (FLVS)",
    "Career & technical": "Career & technical (CTE)",
    "Core": "Core",
}


def _clean(raw: dict, resources: list[dict], found: dict | None = None) -> dict:
    content = dict(raw)
    by_id = {item["id"]: item for item in resources}

    if found is not None:
        _official_picks(content, found)

    # Model-written text: remove Markdown markers and made-up field names.
    for key in ("headline", "where_you_are", "first_step"):
        content[key] = text_clean.clean_paragraph(content.get(key, ""))

    for section in ("what_to_learn", "high_school_courses", "college_majors", "certifications", "online_learning", "college_options", "picked_resources"):
        items = []

        for item in content.get(section, []):
            item = {
                field: (text_clean.clean_paragraph(value) if field in PROSE_FIELDS else value)
                for field, value in item.items()
            }

            if not any(item.get(field) for field in PROSE_FIELDS if field in item):
                continue

            items.append(item)

        content[section] = items

    raw_ladder = content.get("ladder") or {}
    ladder = []

    for key, horizon in HORIZON_KEYS.items():
        rung = raw_ladder.get(key)

        if not rung:
            continue

        steps = text_clean.clean_items(rung.get("steps", []), 4)
        goal = text_clean.clean_paragraph(rung.get("goal", ""))

        if goal or steps:
            ladder.append({"horizon": horizon, "goal": goal, "steps": steps})

    content["ladder"] = ladder

    for item in content.get("online_learning", []):
        template = SEARCH_URLS.get(item["provider"])
        item["url"] = template.format(quote_plus(item["search"] or item["topic"])) if template else ""

    picked = []
    picked_ids: set[str] = set()

    for item in content.get("picked_resources", []):
        if item["id"] in by_id and item["id"] not in picked_ids:
            picked_ids.add(item["id"])
            picked.append(item)

    content["picked_resources"] = picked

    return content


def _to_dict(career: dict, record: CareerRoadmap | None) -> dict:
    return {
        "slug": career["slug"],
        "title": career["title"],
        "resources": curated_resources(career["family"]),
        "roadmap": record.content if record else None,
        "generated_at": record.updated_at.isoformat() if record and record.updated_at else None,
        "timeline_id": record.timeline_id if record else None,
    }


def _career_or_404(slug: str) -> dict:
    career = career_catalog.get_career(slug)

    if career is None:
        raise HTTPException(status_code=404, detail="Career not found.")

    return career


async def _record(db, student_id: str, slug: str) -> CareerRoadmap | None:
    return (
        await db.execute(
            select(CareerRoadmap).where(
                CareerRoadmap.student_id == student_id,
                CareerRoadmap.career_slug == slug,
            )
        )
    ).scalar_one_or_none()


async def get_roadmap(student_id: str, slug: str) -> dict:
    career = _career_or_404(slug)

    async with AsyncSessionLocal() as db:
        record = await _record(db, student_id, slug)

        # Forget a progress link whose timeline the student deleted.
        if record and record.timeline_id is not None:
            timeline = await db.get(ProgressTimeline, record.timeline_id)

            if timeline is None or timeline.student_id != student_id:
                record.timeline_id = None
                await db.commit()

    return _to_dict(career, record)


async def generate_roadmap(student_id: str, slug: str) -> dict:
    career = _career_or_404(slug)
    resources = curated_resources(career["family"])
    context = await build_context(student_id, None, career["title"])
    found = await pathways.candidates(slug)

    raw = await chat_json(
        [
            {
                "role": "system",
                "content": (
                    ROADMAP_PROMPT
                    + "\n\n## Grade stage\n"
                    + plan_stages.stage_text(context["profile"].get("grade_level", ""))
                    + "\n\n"
                    + context_block(context)
                    + "\n\n## Resources you may pick from (id: title)\n"
                    + _resource_list(resources)
                    + "\n\n"
                    + pathways.candidates_text(found)
                ),
            },
            {"role": "user", "content": _career_facts(career)},
        ],
        schema=_schema([item["id"] for item in resources], found),
        schema_name="career_roadmap",
        max_tokens=4500,
        temperature=0.4,
    )

    content = _clean(raw, resources, found)

    async with AsyncSessionLocal() as db:
        record = await _record(db, student_id, slug)

        if record is None:
            record = CareerRoadmap(student_id=student_id, career_slug=slug, content=content)
            db.add(record)
        else:
            record.content = content
            record.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(record)

    return _to_dict(career, record)


async def track_roadmap(student_id: str, slug: str) -> dict:
    """Turn the roadmap's near-term steps into a My Progress timeline."""

    current = await get_roadmap(student_id, slug)

    if current["roadmap"] is None:
        raise HTTPException(status_code=409, detail="Create your roadmap first.")

    if current["timeline_id"] is not None:
        return current

    roadmap = current["roadmap"]

    timeline = await create_progress_timeline(
        student_id,
        ProgressTimelineCreate(
            title=f"Roadmap: {current['title']}"[:255],
            description=roadmap.get("headline", ""),
            status="in_progress",
        ),
    )

    order = 0

    for rung in roadmap.get("ladder", []):
        if rung["horizon"] not in TRACKED_HORIZONS:
            continue

        for step in rung["steps"]:
            await create_progress_task(
                student_id,
                timeline["id"],
                ProgressTaskCreate(
                    title=step[:255],
                    notes=f"{rung['horizon']}: {rung['goal']}",
                    priority="high" if rung["horizon"] == HORIZONS[0] else "medium",
                    sort_order=order,
                ),
            )
            order += 1

    async with AsyncSessionLocal() as db:
        record = await _record(db, student_id, slug)
        record.timeline_id = timeline["id"]
        await db.commit()

    return {**current, "timeline_id": timeline["id"]}


async def list_roadmaps(student_id: str, limit: int = 6) -> list[dict]:
    async with AsyncSessionLocal() as db:
        records = (
            await db.execute(
                select(CareerRoadmap)
                .where(CareerRoadmap.student_id == student_id)
                .order_by(CareerRoadmap.updated_at.desc())
                .limit(limit)
            )
        ).scalars().all()

    roadmaps = []

    for record in records:
        career = career_catalog.get_career(record.career_slug)

        if career is None:
            continue

        roadmaps.append(
            {
                "slug": career["slug"],
                "title": career["title"],
                "family": career["family"],
                "headline": record.content.get("headline", ""),
                "first_step": record.content.get("first_step", ""),
                "tracked": record.timeline_id is not None,
                "updated_at": record.updated_at.isoformat() if record.updated_at else None,
            }
        )

    return roadmaps
