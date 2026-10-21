"""
Personalized career plans: generate, revise (new version), save, edit,
link to progress, and export to PDF.

Saved plans own a progress timeline. Milestones and next actions become
progress tasks, so completing a step in the plan and in My Progress are the
same action.
"""

import copy
import json
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.llm import chat_json
from app.db.models import CareerPlan, ProgressTask, ProgressTimeline
from app.services import career_catalog, grounding, plan_stages
from app.services.context_service import build_context, context_block, grounding_corpus


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
        "title": _text(80),
        "career_goal": _text(100),
        "summary": _text(300),
        "next_steps": _items({"title": _text(90), "why": _text(200)}, ["title", "why"], 3),
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

What matters most is next_steps: exactly 3 things the student can do THIS MONTH, each small, concrete, and starting with a verb ("Ask your counselor about...", "Sign up for...", "Spend an hour on..."). why says, in one sentence, how it connects to the student.

Rules:
- Fit everything to the student's grade stage (below) and the time of year.
- Base every part on what you know about the student and name the connection. If they have no fixed goal, make it a plan to explore: careers to try, not one answer.
- careers: at most 3, each a slug from the Career catalog candidates list, with why in the student's own terms. The app adds official pay and education for each one, so never write pay, salaries, percentages, statistics, costs, deadlines, dates, admission requirements, or program and scholarship names anywhere in the plan.
- this_year: up to 3 periods (like "This fall", "This spring", "This summer") with up to 3 steps each.
- high_school: one short focus for each remaining grade, starting with the current one.
- after_high_school: up to 3 realistic routes (college, community college, apprenticeship, trade school, military, certificates, work).
- skills: up to 3 skills and how to build them for free or at school.
- Never use grades to rule anything out. Prefer free, school-based, or low-cost options, described generically.
- summary: 1 or 2 sentences. based_on: one sentence on what you used and what's missing.
- Write in clear, encouraging language a 9th grader understands. Address the student as "you"."""


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


def _clean_content(raw: dict, grade_level: str, corpus: str) -> dict:
    content = copy.deepcopy(raw)
    removed = _ground_plan(content, corpus)

    steps = [step for step in content.get("next_steps", []) if step.get("title", "").strip()][:3]
    cards = []

    for career in content.get("careers", []):
        card = career_card(career.get("slug", ""), career.get("why", ""))

        if card and card["slug"] not in {item["slug"] for item in cards}:
            cards.append(card)

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
    context = await build_context(student_id, None, query)

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

    return _clean_content(raw, grade_level, grounding_corpus(context, query))


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
