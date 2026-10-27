"""
Personalized career plans: generate, revise (new version), save, edit,
link to progress, and export to PDF.

Saved plans own a progress timeline. Milestones and next actions become
progress tasks, so completing a step in the plan and in My Progress are the
same action.
"""

import copy
import re
import logging
from contextvars import ContextVar
import json
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.llm import LLMError, chat_json
from app.db.models import CareerPlan, ProgressTask, ProgressTimeline
from app.services import career_catalog, college_match, field_quiz, grounding, pathways, plan_stages, text_clean
from app.services.context_service import build_context, college_text, context_block, grounding_corpus, target_majors
from app.services.student_service import save_profile_dict


logger = logging.getLogger(__name__)

# Set by the streaming endpoint: a function that receives progress lines
# ("Checking 89 Florida colleges...") while a plan is being built.
progress_reporter: ContextVar = ContextVar("plan_progress_reporter", default=None)


def _progress(text: str) -> None:
    report = progress_reporter.get()

    if report is not None:
        report(text)


def _items(properties: dict, required: list[str], max_items: int) -> dict:
    return {
        "type": "array",
        "maxItems": max_items,
        "items": {"type": "object", "properties": properties, "required": required},
    }


def _text(max_length: int) -> dict:
    return {"type": "string", "maxLength": max_length}


# Plans written since Phase 5 (content["schema"] == 2). Older plans keep
# their original fields and render with the original layout.
PLAN_SCHEMA_VERSION = 2
MAX_PLAN_CAREERS = 3

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "title": _text(120),
        "career_goal": _text(100),
        "summary": _text(300),
        "next_steps": _items({"title": _text(140), "why": _text(220)}, ["title", "why"], 3),
        "careers": _items({"slug": _text(100), "why": _text(220)}, ["slug", "why"], MAX_PLAN_CAREERS),
        "this_year": _items(
            {"period": _text(30), "steps": {"type": "array", "items": _text(150), "maxItems": 3}},
            ["period", "steps"],
            3,
        ),
        "high_school": _items({"grade": _text(20), "focus": _text(160)}, ["grade", "focus"], 4),
        "after_high_school": _items({"route": _text(80), "description": _text(220)}, ["route", "description"], 3),
        "skills": _items({"skill": _text(60), "how": _text(180)}, ["skill", "how"], 3),
        "based_on": _text(240),
    },
    "required": [
        "title",
        "career_goal",
        "summary",
        "next_steps",
        "careers",
        "this_year",
        "high_school",
        "after_high_school",
        "skills",
        "based_on",
    ],
}
PLAN_SCHEMA["properties"]["next_steps"]["minItems"] = 3


PLAN_PROMPT = """You create short, personal career plans for high school students at NeoCity Academy in Kissimmee, Florida. You are an AI; the plan is a starting point the student can change, not a prediction.

What matters most is next_steps: exactly 3 things the student can do THIS MONTH, each small, concrete, and starting with a verb. They must be about THIS student, never generic. Cover these three kinds, in this order:
(a) closing a gap from "they still need": the service hours Bright Futures needs, a test to plan, an empty resume section, with the number when the records give it;
(b) taking something they already do to the next level, naming it;
(c) building on their strongest subject or their major: a course to request, a project, a competition.
Each title is the action itself, for example "Log 13 more volunteer hours at the library to reach 75" or "Offer to teach Java to the new members of your robotics team". Never write "Step 1", the letters (a)-(c), or a description of these instructions as a title.
why: one sentence that names the record fact it builds on ("You have 62 service hours", "Your A in AP Computer Science Principles").

Rules:
- Fit everything to the student's grade stage (below) and the time of year.
- Base every part on what you know about the student and name the connection. If they have no fixed goal, make it a plan to explore: careers to try, not one answer.
- careers: at most 3, each a slug from the Career catalog candidates list, with why in the student's own terms. The app adds official pay and education for each one, so never write pay, salaries, percentages, statistics, costs, deadlines, dates, admission requirements, or program and scholarship names anywhere in the plan.
- this_year: up to 3 periods (like "This fall", "This spring", "This summer") with up to 3 steps each.
- high_school: one short focus for each remaining grade, starting with the current one.
- after_high_school: up to 3 realistic routes (college, community college, apprenticeship, trade school, military, certificates, work).
- skills: up to 3 skills and how to build them for free or at school.
- Build on the student's records: their strongest grades and advanced courses, their resume (activities, leadership, jobs, projects, service hours), their interest type, the major and minor the quiz suggested, and earlier conversations. Each next step names the record it builds on.
- If the resume is missing or thin, one next step is to add everything they've done to it. If service hours are below what Bright Futures needs, a step builds them.
- Grades set realistic targets; never use them to rule anything out. Prefer free, school-based, or low-cost options, described generically.
- summary: 1 or 2 sentences. based_on: one sentence on what you used and what's missing.
- Write in clear, encouraging language a 9th grader understands. Address the student as "you" everywhere, including the title and summary; never use their name or "the student"."""


def plan_to_dict(plan: CareerPlan, *, include_content: bool = True) -> dict:
    data = {
        "id": plan.id,
        "lineage_id": plan.lineage_id,
        "version": plan.version,
        "title": plan.title,
        "career_goal": plan.career_goal,
        "status": plan.status,
        "revision_note": plan.revision_note,
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
    }

    if include_content:
        data["content"] = plan.content

    return data


def career_card(slug: str, why: str) -> dict | None:
    """A plan career with its official pay and education, attached by code."""

    career = career_catalog.get_career(slug)

    if career is None:
        return None

    facts = career_catalog.career_facts(slug) or {}
    national = (facts.get("wages") or {}).get("national") or {}
    florida = (facts.get("wages") or {}).get("florida") or {}
    sources = facts.get("sources") or {}

    return {
        "slug": slug,
        "title": career["title"],
        "family_label": career_catalog.family_label(career["family"]),
        "why": why.strip(),
        "pay_median": national.get("annual_median"),
        "pay_median_florida": florida.get("annual_median"),
        "pay_hourly": national.get("hourly_median"),
        "education": ((facts.get("education") or {}).get("typical_entry")),
        # What workers in the occupation report (O*NET survey), e.g. many
        # AI engineers start with a bachelor's though the typical entry is a master's.
        "education_survey": pathways.education_survey(career.get("onet_code") or ""),
        "growth_percent": ((facts.get("outlook") or {}).get("growth_percent")),
        "pay_source": (sources.get("wages") or {}).get("name"),
        "outlook_source": (sources.get("outlook") or {}).get("name"),
        "as_of": facts.get("retrieved"),
    }


PLAN_TEXT_FIELDS = (
    ("summary", None),
    ("next_steps", ("title", "why")),
    ("careers", ("why",)),
    ("this_year", ("steps",)),
    ("high_school", ("focus",)),
    ("after_high_school", ("description",)),
    ("skills", ("how",)),
    ("based_on", None),
)


def _ground_plan(content: dict, corpus: str) -> list[dict]:
    """Remove any sentence with a figure or name no source supports."""

    scopes = list(career_catalog.career_scopes())
    removed: list[dict] = []

    def clean(text: str) -> str:
        cleaned, found = grounding.ground_reply(text, corpus, scopes, note=False)
        removed.extend({"kind": claim["kind"], "text": claim["text"]} for claim in found)
        return cleaned

    for key, subkeys in PLAN_TEXT_FIELDS:
        value = content.get(key)

        if subkeys is None:
            if isinstance(value, str):
                content[key] = clean(value)
            continue

        for item in value or []:
            for subkey in subkeys:
                if isinstance(item.get(subkey), list):
                    item[subkey] = [cleaned for text in item[subkey] if (cleaned := clean(text))]
                elif isinstance(item.get(subkey), str):
                    item[subkey] = clean(item[subkey])

    return removed


def _whole_words(text: str, limit: int) -> str:
    """Shorten to whole words so a title never ends mid-word."""

    text = " ".join((text or "").split())

    if len(text) <= limit:
        return text

    cut = text[:limit].rsplit(" ", 1)[0]

    return cut.rstrip(" ,:;-–—")


def _clean_content(raw: dict, grade_level: str, corpus: str) -> dict:
    content = copy.deepcopy(raw)
    removed = _ground_plan(content, corpus)

    steps = [step for step in content.get("next_steps", []) if step.get("title", "").strip()][:3]
    cards = []

    for career in content.get("careers", []):
        card = career_card(career.get("slug", ""), career.get("why", ""))

        if card and card["slug"] not in {item["slug"] for item in cards}:
            cards.append(card)

    content["title"] = _whole_words(content.get("title", ""), 90)

    content.update(
        {
            "schema": PLAN_SCHEMA_VERSION,
            "next_steps": steps,
            "careers": cards[:MAX_PLAN_CAREERS],
            "stage": plan_stages.stage_for(grade_level),
            # Older readers (Home, the counselor's context, the checklist) use these.
            "career_direction": content.get("summary", ""),
            "next_three_actions": [step["title"] for step in steps],
            "short_term_milestones": [],
            "careers_exploring": [{"slug": card["slug"], "title": card["title"], "why": card["why"]} for card in cards],
        }
    )

    if removed:
        content["grounding"] = {"removed": removed}

    return content


async def _generate_content(
    student_id: str,
    *,
    career_goal: str,
    instruction: str,
    previous: dict | None,
) -> dict:
    query = " ".join(part for part in [career_goal, instruction] if part) or "career plan"
    _progress("Reading your transcript, resume, quiz and past chats")
    context = await build_context(student_id, None, query)
    # A plan always weighs colleges and scholarships, whatever the request says.
    context["college_text"] = college_text(context["record"], context["profile"], "college")

    request_lines = []

    if previous is not None:
        request_lines.append(
            "Revise the student's current plan (JSON below). Keep what still "
            "fits and change what the request asks for."
        )
        request_lines.append(f"Current plan:\n{json.dumps(previous, indent=1)}")

    if career_goal:
        request_lines.append(f"The student wants the plan focused on: {career_goal}")

    if instruction:
        request_lines.append(f"The student's request: {instruction}")

    if not request_lines:
        request_lines.append(
            "Create the student's career plan from everything you know about them."
        )

    request_lines.append(record_guidance(context["record"]))
    request_lines.append("Check before answering: does each next step name something from these records? If a step could be given to any student, rewrite it.")

    grade_level = context["profile"].get("grade_level", "")
    system = (
        PLAN_PROMPT
        + "\n\n## Grade stage\n"
        + plan_stages.stage_text(grade_level)
        + "\n\n"
        + context_block(context)
        + "\n\n## Career catalog candidates (slug: title)\n"
        + context["candidates_text"]
    )

    _progress("Writing your next steps for this month")
    raw = await chat_json(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": "\n\n".join(request_lines)},
        ],
        schema=PLAN_SCHEMA,
        schema_name="career_plan",
        max_tokens=2500,
        temperature=0.4,
    )

    corpus = grounding_corpus(context, query)
    _progress("Checking every figure against official sources")
    content = _clean_content(raw, grade_level, corpus)

    focus = _focus_career(content, career_goal)

    # A goal the student typed for this plan becomes their goal if they had none.
    if focus and career_goal and not (context["profile"].get("career_aspiration") or "").strip():
        await save_profile_dict(student_id, {"career_aspiration": (career_catalog.get_career(focus) or {}).get("title", career_goal)})

    if focus and focus not in {card["slug"] for card in content.get("careers", [])}:
        card = career_card(focus, f"You told us you want to become {(career_catalog.get_career(focus) or {}).get('title', 'this')}.")

        if card:
            content["careers"] = [card] + content.get("careers", [])[: MAX_PLAN_CAREERS - 1]
            content["careers_exploring"] = [{"slug": item["slug"], "title": item["title"], "why": item["why"]} for item in content["careers"]]

    if focus:
        # Keep the plan's careers inside the goal's field, so a future
        # software engineer isn't shown biomedical engineering.
        field = field_quiz.goal_field_slugs(focus)
        content["careers"] = [card for card in content.get("careers", []) if card["slug"] in field]

        # Fill the list with the closest careers in the same field.
        for item in field_quiz.field_for(focus):
            if len(content["careers"]) >= MAX_PLAN_CAREERS:
                break

            if item["slug"] not in {card["slug"] for card in content["careers"]}:
                card = career_card(item["slug"], f"Close to {(career_catalog.get_career(focus) or {}).get('title', 'your goal')}: it uses many of the same interests and school subjects.")

                if card:
                    content["careers"].append(card)
        content["careers_exploring"] = [{"slug": item["slug"], "title": item["title"], "why": item["why"]} for item in content["careers"]]

    if focus:
        try:
            content["pathway"] = await _build_pathway(focus, context, grade_level, corpus)
        except LLMError:
            # The plan is still useful without the pathway; it can be rebuilt.
            logger.warning("Pathway for %s could not be built", focus)

    return content


PATHWAY_PROMPT = """You map out the education path to one career for a high school student at NeoCity Academy in Kissimmee, Florida. You pick ONLY from the lists below; the app adds official details (net price, graduation rate, earnings, certifying organization, links) itself.

Rules:
- courses: up to 8 high school courses, each with the grade to take it in, starting with the student's current grade (never an earlier grade). Skip courses the student's transcript shows they already finished. Prefer the AP courses listed for this career, plus the core math and science that lead to them. Use dual enrollment or FLVS where it helps.
- majors: up to 3 college majors that lead to this career. If the student's records show a suggested or preferred major, put it first.
- colleges: 5 to 7 Florida colleges offering their major, mixing reach, match and likely schools for this student (the "Colleges and scholarships" section labels each). Include at least one state college (2-year) for the route of starting there and transferring to a university, and favor schools near NeoCity when they fit.
- courses: build on the subjects where their grades are strongest (an AP or honors next step), and add help for a weaker subject.
- certifications: up to 4, putting first the ones marked as needing no degree or long work experience, since a teenager or new graduate can work toward them.
- Describe schools only by facts in the list (city, public or private, 2-year or 4-year, being near NeoCity, the programs listed). Never call a school or program top, strong, competitive, excellent, or prestigious.
- For a college, begin why with the college's own name, and talk only about that college.
- why: one plain sentence linking the pick to this student (their interests, classes, activities, or goals), or to the career if little is known.
- summary: 1 or 2 sentences describing the route, including more than one way in when realistic (for example a bachelor's degree, or starting at a state college).
- Never write prices, percentages, salaries, rankings, dates, or admission requirements; the app shows official figures.
- Plain text only: no Markdown, no asterisks, no field names. Address the student as "you"."""


def _add_chosen_majors(found: dict, context: dict) -> None:
    """The quiz's majors lead the pathway, with the colleges that offer them."""

    majors = target_majors(context["record"], context["profile"])

    if not majors:
        return

    catalog = college_match.majors_catalog()
    chosen = [
        {"cip": catalog[cip4]["cip"], "title": catalog[cip4]["title"], "includes": [], "florida_colleges": catalog[cip4]["florida_colleges"]}
        for cip4 in majors
        if cip4 in catalog
    ]
    found["majors"] = chosen + [major for major in found["majors"] if major["cip"] not in {item["cip"] for item in chosen}]

    known = {college["id"] for college in found["colleges"]}

    for card in college_match.colleges_for_majors(majors, context["record"], limit=10):
        if card["id"] not in known:
            found["colleges"].append(
                {
                    **{key: card[key] for key in ("id", "name", "city", "ownership", "kind", "url", "net_price", "graduation_rate", "students")},
                    "central_florida": card["city"].lower() in pathways.CENTRAL_FLORIDA,
                    "programs": card["programs"],
                }
            )


def _focus_career(content: dict, career_goal: str) -> str:
    """
    The career the pathway is built for: the goal the student asked for
    (which may be an added career, like AI Engineer), else the plan's first
    career.
    """

    named = career_catalog.named_careers(career_goal) if career_goal else []

    if named:
        return named[0]

    if content.get("careers"):
        return content["careers"][0]["slug"]

    named = career_catalog.named_careers(content.get("career_goal", ""))

    return named[0] if named else ""


async def _build_pathway(slug: str, context: dict, grade_level: str, corpus: str) -> dict:
    title = (career_catalog.get_career(slug) or {}).get("title", "this career")
    _progress(f"Looking up the path to {title}: Florida colleges, majors and certifications")
    found = await pathways.candidates(slug)
    _add_chosen_majors(found, context)
    _progress(
        f"Found {len(found['colleges'])} Florida colleges with a matching program, "
        f"{len(found['majors'])} majors and {len(found['certifications'])} certifications"
    )
    _progress("Choosing the courses, colleges and certifications that fit you")
    allowed = pathways.candidates_text(found)
    scopes = list(career_catalog.career_scopes())

    def clean(text: str) -> str:
        text = text_clean.clean_paragraph(text)
        cleaned, _ = grounding.ground_reply(text, corpus + "\n" + allowed, scopes, note=False)
        return cleaned

    career = career_catalog.get_career(slug) or {}
    raw = await chat_json(
        [
            {
                "role": "system",
                "content": PATHWAY_PROMPT
                + "\n\n## Grade stage\n"
                + plan_stages.stage_text(grade_level)
                + "\n\n"
                + context_block(context)
                + "\n\n"
                + allowed,
            },
            {"role": "user", "content": f"Build the path to: {career.get('title', slug)}."},
        ],
        schema=pathways.schema(found),
        schema_name="career_pathway",
        max_tokens=2500,
        temperature=0.3,
    )

    pathway = pathways.attach(raw, found, clean)

    return fit_pathway(pathway, context["record"])


def _course_key(name: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", name.lower().replace("honors", "").replace("advanced placement", "ap")))


def record_guidance(record: dict) -> str:
    """Concrete things the plan must build on or fix, worked out in code from the record."""

    lines = ["Use these facts from the student's records (each next step should build on one):"]
    resume = record.get("resume") or {}
    doing = (resume.get("activities") or []) + (resume.get("leadership") or [])

    if doing:
        lines.append("- They already do: " + "; ".join(item.split(":")[0] for item in doing[:6]) + ". Never suggest joining these; suggest the next level (a leadership role, a competition, teaching others).")

    academics = record.get("academics") or {}

    if academics.get("strong_areas"):
        lines.append(f"- Strongest grades: {', '.join(academics['strong_areas'])}.")

    if academics.get("weak_areas"):
        lines.append(f"- Lower grades: {', '.join(academics['weak_areas'])}: one step can get help there.")

    taken = [course["name"] for course in academics.get("courses") or []] + list(academics.get("in_progress") or [])

    if taken:
        lines.append("- Already taken or taking now (never suggest these): " + "; ".join(taken[:25]) + ".")

    for level in (record.get("bright_futures") or {}).get("levels") or []:
        gaps = [check for check in level["checks"] if check["status"] == "not_yet"]

        if gaps:
            lines.append(f"- For {level['name']} they still need: " + "; ".join(f"{check['item']} ({check['note']})" for check in gaps) + ".")

    tests = record.get("tests") or {}

    if not (tests.get("sat") or tests.get("act")):
        lines.append("- No SAT or ACT yet: include when to take the PSAT/SAT in their plan.")

    missing = [item["label"] for item in record.get("resume_checklist") or [] if not item["done"]]

    if missing:
        lines.append("- Resume sections still empty: " + ", ".join(missing) + ".")

    return "\n".join(lines)


def fit_pathway(pathway: dict, record: dict) -> dict:
    """Reach/match/likely labels, admissions and scholarships for each college; the major and minor; Bright Futures."""

    # Never suggest a course the transcript shows they've taken or are taking.
    academics = record.get("academics") or {}
    taken = {_course_key(course["name"]) for course in academics.get("courses") or []} | {_course_key(name) for name in academics.get("in_progress") or []}

    if taken and pathway.get("courses"):
        pathway["courses"] = [course for course in pathway["courses"] if _course_key(course["course"]) not in taken]

    for item in pathway.get("colleges", []):
        official = college_match.college(item["id"])

        if official:
            item["fit"] = college_match.fit_label(official, record)
            item["admissions"] = official.get("admissions") or {}
            item["scholarships"] = college_match.college_scholarships(item["id"])

    options = (record.get("major_minor") or {}).get("options") or []

    if options:
        pathway["major_minor"] = {key: options[0][key] for key in ("major", "minor", "why_major", "why_minor") if key in options[0]}

    pathway["bright_futures"] = record.get("bright_futures")

    return pathway


async def list_plans(student_id: str) -> list[dict]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CareerPlan)
            .where(
                CareerPlan.student_id == student_id,
                CareerPlan.deleted_at.is_(None),
            )
            .order_by(CareerPlan.created_at.desc())
        )

        return [plan_to_dict(plan, include_content=False) for plan in result.scalars().all()]


async def get_owned_plan(student_id: str, plan_id: str) -> CareerPlan:
    async with AsyncSessionLocal() as db:
        plan = await db.get(CareerPlan, plan_id)

    if plan is None or plan.student_id != student_id or plan.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Plan not found.")

    return plan


async def generate_plan(student_id: str, *, career_goal: str = "", instruction: str = "") -> dict:
    content = await _generate_content(
        student_id,
        career_goal=career_goal.strip(),
        instruction=instruction.strip(),
        previous=None,
    )

    plan_id = str(uuid4())
    now = datetime.utcnow()

    async with AsyncSessionLocal() as db:
        plan = CareerPlan(
            id=plan_id,
            student_id=student_id,
            lineage_id=plan_id,
            version=1,
            title=content.get("title") or "My Career Plan",
            career_goal=content.get("career_goal", "")[:255],
            content=content,
            status="draft",
            revision_note=instruction[:500],
            created_at=now,
            updated_at=now,
        )
        db.add(plan)
        await db.commit()

        return plan_to_dict(plan)


async def revise_plan(
    student_id: str,
    plan_id: str,
    *,
    instruction: str,
    career_goal: str = "",
) -> dict:
    source = await get_owned_plan(student_id, plan_id)

    content = source.content or {}

    if content.get("schema") == PLAN_SCHEMA_VERSION:
        # Only what the model wrote; pay and education are added by code.
        previous = {key: content[key] for key in PLAN_SCHEMA["properties"] if key in content and key != "based_on"}
        previous["careers"] = [{"slug": card["slug"], "why": card["why"]} for card in content.get("careers", [])]
    else:
        previous = {key: value for key, value in content.items() if key != "based_on"}

    content = await _generate_content(
        student_id,
        career_goal=career_goal.strip(),
        instruction=instruction.strip(),
        previous=previous,
    )

    async with AsyncSessionLocal() as db:
        latest_version = (
            await db.execute(
                select(CareerPlan.version)
                .where(CareerPlan.lineage_id == source.lineage_id)
                .order_by(CareerPlan.version.desc())
                .limit(1)
            )
        ).scalar_one()

        now = datetime.utcnow()
        plan = CareerPlan(
            id=str(uuid4()),
            student_id=student_id,
            lineage_id=source.lineage_id,
            version=latest_version + 1,
            title=content.get("title") or source.title,
            career_goal=content.get("career_goal", "")[:255],
            content=content,
            status="draft",
            revision_note=(career_goal and f"Changed goal to {career_goal}. " or "")
            + instruction[:400],
            created_at=now,
            updated_at=now,
        )
        db.add(plan)
        await db.commit()

        return plan_to_dict(plan)


EDITABLE_LIST_KEYS = {
    "short_term_milestones",
    "next_three_actions",
    "long_term_goals",
    "next_steps",
}


async def update_plan(student_id: str, plan_id: str, updates: dict) -> dict:
    """
    Student edits: title, milestones, next actions, and long-term goals.
    """

    await get_owned_plan(student_id, plan_id)

    async with AsyncSessionLocal() as db:
        plan = await db.get(CareerPlan, plan_id)
        content = copy.deepcopy(plan.content or {})

        if "title" in updates and str(updates["title"]).strip():
            plan.title = str(updates["title"]).strip()[:255]

        for key in EDITABLE_LIST_KEYS:
            if key not in updates:
                continue

            value = updates[key]

            if not isinstance(value, list):
                raise HTTPException(status_code=400, detail=f"{key} must be a list.")

            if key == "short_term_milestones":
                cleaned = []

                for item in value[:12]:
                    title = str(item.get("title", "")).strip()[:100]

                    if not title:
                        continue

                    cleaned.append(
                        {
                            "id": str(item.get("id") or uuid4().hex[:12])[:24],
                            "title": title,
                            "description": str(item.get("description", "")).strip()[:300],
                            "timeframe": str(item.get("timeframe", "")).strip()[:40],
                        }
                    )

                content[key] = cleaned
            elif key == "next_steps":
                steps = [
                    {"title": str(item.get("title", "")).strip()[:90], "why": str(item.get("why", "")).strip()[:200]}
                    for item in value[:5]
                    if str(item.get("title", "")).strip()
                ]
                content["next_steps"] = steps
                # The checklist follows the steps.
                content["next_three_actions"] = [step["title"] for step in steps]
            else:
                content[key] = [str(item).strip()[:200] for item in value if str(item).strip()][:6]

        plan.content = content
        plan.updated_at = datetime.utcnow()
        await db.commit()

    if plan.status == "saved":
        await _sync_progress(student_id, plan_id)

    return await get_plan_detail(student_id, plan_id)


async def save_plan(student_id: str, plan_id: str) -> dict:
    await get_owned_plan(student_id, plan_id)

    async with AsyncSessionLocal() as db:
        plan = await db.get(CareerPlan, plan_id)
        plan.status = "saved"
        plan.updated_at = datetime.utcnow()
        await db.commit()

    await _sync_progress(student_id, plan_id)

    return await get_plan_detail(student_id, plan_id)


async def delete_plan(student_id: str, plan_id: str) -> None:
    await get_owned_plan(student_id, plan_id)

    async with AsyncSessionLocal() as db:
        plan = await db.get(CareerPlan, plan_id)
        plan.deleted_at = datetime.utcnow()
        await db.commit()


async def _plan_timeline(db, student_id: str, lineage_id: str) -> ProgressTimeline | None:
    return (
        await db.execute(
            select(ProgressTimeline)
            .join(CareerPlan, CareerPlan.id == ProgressTimeline.plan_id)
            .where(
                ProgressTimeline.student_id == student_id,
                CareerPlan.lineage_id == lineage_id,
            )
            .limit(1)
        )
    ).scalar_one_or_none()


async def _sync_progress(student_id: str, plan_id: str) -> None:
    """
    Make sure every milestone and next action of a saved plan has a
    progress task. Existing tasks (and their completion) are kept.
    """

    async with AsyncSessionLocal() as db:
        plan = await db.get(CareerPlan, plan_id)
        content = copy.deepcopy(plan.content or {})

        timeline = await _plan_timeline(db, student_id, plan.lineage_id)
        now = datetime.utcnow()

        if timeline is None:
            timeline = ProgressTimeline(
                student_id=student_id,
                title=f"My plan: {plan.title}"[:255],
                description=content.get("career_direction", "")[:1000],
                status="in_progress",
                sort_order=0,
                plan_id=plan.id,
                created_at=now,
                updated_at=now,
            )
            db.add(timeline)
            await db.flush()
        else:
            timeline.plan_id = plan.id
            timeline.title = f"My plan: {plan.title}"[:255]

        tasks = (
            await db.execute(
                select(ProgressTask).where(ProgressTask.timeline_id == timeline.id)
            )
        ).scalars().all()
        tasks_by_id = {task.id: task for task in tasks}
        tasks_by_title = {task.title.strip().lower(): task for task in tasks}

        sort_order = len(tasks)

        def ensure_task(title: str, notes: str, existing_id) -> ProgressTask:
            nonlocal sort_order

            task = tasks_by_id.get(existing_id) or tasks_by_title.get(title.strip().lower())

            if task is None:
                task = ProgressTask(
                    timeline_id=timeline.id,
                    student_id=student_id,
                    title=title[:255],
                    notes=notes,
                    status="not_started",
                    priority="medium",
                    due_date=None,
                    sort_order=sort_order,
                    created_at=now,
                    updated_at=now,
                )
                db.add(task)
                sort_order += 1
                tasks_by_title[title.strip().lower()] = task
            else:
                task.title = title[:255]

            return task

        created = []

        for milestone in content.get("short_term_milestones", []):
            task = ensure_task(
                milestone["title"],
                " ".join(
                    part
                    for part in [milestone.get("description", ""), milestone.get("timeframe", "")]
                    if part
                ),
                milestone.get("task_id"),
            )
            created.append((milestone, task))

        action_tasks = []

        for action in content.get("next_three_actions", []):
            action_tasks.append(ensure_task(action, "Next action from your plan", None))

        await db.flush()

        for milestone, task in created:
            milestone["task_id"] = task.id

        content["next_action_task_ids"] = [task.id for task in action_tasks]
        plan.content = content

        await db.commit()


async def get_plan_detail(student_id: str, plan_id: str) -> dict:
    plan = await get_owned_plan(student_id, plan_id)
    data = plan_to_dict(plan)

    async with AsyncSessionLocal() as db:
        versions = (
            await db.execute(
                select(CareerPlan)
                .where(
                    CareerPlan.lineage_id == plan.lineage_id,
                    CareerPlan.student_id == student_id,
                    CareerPlan.deleted_at.is_(None),
                )
                .order_by(CareerPlan.version.desc())
            )
        ).scalars().all()

        timeline = await _plan_timeline(db, student_id, plan.lineage_id)
        task_status = {}

        if timeline is not None:
            rows = (
                await db.execute(
                    select(ProgressTask.id, ProgressTask.status).where(
                        ProgressTask.timeline_id == timeline.id
                    )
                )
            ).all()
            task_status = {task_id: status for task_id, status in rows}

    data["versions"] = [plan_to_dict(version, include_content=False) for version in versions]
    data["task_status"] = {str(task_id): status for task_id, status in task_status.items()}
    data["timeline_id"] = timeline.id if timeline else None

    return data


async def latest_plan(student_id: str) -> dict | None:
    async with AsyncSessionLocal() as db:
        plan = (
            await db.execute(
                select(CareerPlan)
                .where(
                    CareerPlan.student_id == student_id,
                    CareerPlan.deleted_at.is_(None),
                )
                .order_by(
                    (CareerPlan.status == "saved").desc(),
                    CareerPlan.updated_at.desc(),
                )
                .limit(1)
            )
        ).scalar_one_or_none()

    return plan_to_dict(plan) if plan else None
