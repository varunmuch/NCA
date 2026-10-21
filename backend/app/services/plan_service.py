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
from app.services import career_catalog
from app.services.context_service import build_context, context_block


def _items(properties: dict, required: list[str], max_items: int) -> dict:
    return {
        "type": "array",
        "maxItems": max_items,
        "items": {"type": "object", "properties": properties, "required": required},
    }


def _text(max_length: int) -> dict:
    return {"type": "string", "maxLength": max_length}


PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "title": _text(80),
        "career_goal": _text(100),
        "career_direction": _text(700),
        "interests_and_strengths": {"type": "array", "items": _text(160), "maxItems": 6},
        "careers_exploring": _items(
            {"slug": _text(100), "title": _text(100), "why": _text(260)},
            ["slug", "title", "why"],
            4,
        ),
        "academic_subjects": _items(
            {"subject": _text(60), "why": _text(200)}, ["subject", "why"], 5
        ),
        "skills_to_develop": _items(
            {"skill": _text(80), "how": _text(220)}, ["skill", "how"], 5
        ),
        "projects_and_activities": _items(
            {"title": _text(90), "description": _text(240)}, ["title", "description"], 4
        ),
        "learning_opportunities": _items(
            {"title": _text(90), "description": _text(240)}, ["title", "description"], 4
        ),
        "high_school_roadmap": _items(
            {
                "period": _text(40),
                "focus": _text(120),
                "steps": {"type": "array", "items": _text(160), "maxItems": 4},
            },
            ["period", "focus", "steps"],
            5,
        ),
        "education_pathways": _items(
            {"path": _text(90), "description": _text(260)}, ["path", "description"], 4
        ),
        "short_term_milestones": _items(
            {"title": _text(100), "description": _text(200), "timeframe": _text(40)},
            ["title", "description", "timeframe"],
            5,
        ),
        "long_term_goals": {"type": "array", "items": _text(180), "maxItems": 4},
        "alternative_pathways": _items(
            {"title": _text(90), "description": _text(240)}, ["title", "description"], 3
        ),
        "next_three_actions": {
            "type": "array",
            "items": _text(160),
            "minItems": 3,
            "maxItems": 3,
        },
        "based_on": _text(300),
    },
    "required": [
        "title",
        "career_goal",
        "career_direction",
        "interests_and_strengths",
        "careers_exploring",
        "academic_subjects",
        "skills_to_develop",
        "projects_and_activities",
        "learning_opportunities",
        "high_school_roadmap",
        "education_pathways",
        "short_term_milestones",
        "long_term_goals",
        "alternative_pathways",
        "next_three_actions",
        "based_on",
    ],
}


PLAN_PROMPT = """You create personalized career plans for high school students at NeoCity Academy. You are an AI; the plan is a starting point the student can change, not a prediction.

Rules:
- Base every part on the student context below. Connect choices to the student's real interests, subjects, courses, activities, and goals, and name the connection.
- Fit the plan to the student's grade. If the grade is unknown, write the roadmap by school year ("Grade 9", "Grade 10"...) starting from where they likely are, and say the grade is unknown in based_on.
- If the student has no fixed goal, make the plan about exploration: 2-4 careers to explore, experiences to test interests, and decision points. Don't force one career.
- Include several routes where realistic (college, community college, apprenticeship, trade school, military, certificates, work).
- Prefer free, school-based, or low-cost opportunities (clubs, electives, library, free online courses, volunteering, job shadowing, summer programs) and describe them generically. Do not invent specific program names, deadlines, costs, salaries, admission requirements, or statistics.
- Never use grades to rule anything out.
- Milestones must be concrete and checkable, within the next 3-12 months.
- next_three_actions: the three most useful things to do in the next two weeks, each starting with a verb.
- careers_exploring: use slugs from the Career catalog candidates list when one fits, otherwise slug "".
- based_on: one sentence naming what information you used (profile, conversations, resume, transcript) and anything important that is missing.
- Write in clear, encouraging language a 9th grader understands. Always address the student as "you" (never by name or "the student"), including in career_direction and every "why"."""


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


def _clean_content(raw: dict) -> dict:
    content = copy.deepcopy(raw)

    for career in content.get("careers_exploring", []):
        match = career_catalog.get_career(career.get("slug", ""))

        if match is None:
            career["slug"] = ""
        else:
            career["title"] = match["title"]

    # Stable ids let milestones link to progress tasks across edits.
    for milestone in content.get("short_term_milestones", []):
        milestone.setdefault("id", uuid4().hex[:12])

    content["next_three_actions"] = [
        action for action in content.get("next_three_actions", []) if action.strip()
    ][:3]

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

    system = (
        PLAN_PROMPT
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
        max_tokens=5000,
        temperature=0.4,
    )

    return _clean_content(raw)


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

    previous = {
        key: value
        for key, value in (source.content or {}).items()
        if key != "based_on"
    }

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
