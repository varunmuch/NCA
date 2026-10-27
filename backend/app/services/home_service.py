"""
The data behind the Home page. Everything shown is read from the
student's real records; nothing is generated here.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.db.models import CareerPlan, Message, ProgressTask, SavedCareer
from app.services import student_record
from app.services import career_catalog, field_quiz
from app.services.conversation_service import list_conversations
from app.services.document_service import list_documents
from app.services.plan_service import latest_plan
from app.services.roadmap_service import list_roadmaps
from app.services.student_service import display_name, get_profile_dict, list_facts, save_profile_dict


async def _saved_slugs(student_id: str) -> list[str]:
    async with AsyncSessionLocal() as db:
        return list(
            (
                await db.execute(
                    select(SavedCareer.career_slug)
                    .where(SavedCareer.student_id == student_id)
                    .order_by(SavedCareer.created_at.desc())
                )
            ).scalars().all()
        )


async def _careers_worth_exploring(student_id: str, profile: dict) -> list[dict]:
    async with AsyncSessionLocal() as db:
        saved = (
            await db.execute(
                select(SavedCareer.career_slug)
                .where(SavedCareer.student_id == student_id)
                .order_by(SavedCareer.created_at.desc())
            )
        ).scalars().all()

        # Careers the counselor suggested recently, newest first.
        suggested_rows = (
            await db.execute(
                select(Message.metadata_json)
                .where(
                    Message.student_id == student_id,
                    Message.role == "assistant",
                    Message.metadata_json["career_suggestions"].isnot(None),
                )
                .order_by(Message.id.desc())
                .limit(20)
            )
        ).scalars().all()

    careers: list[dict] = []
    seen: set[str] = set()

    for slug in saved:
        career = career_catalog.get_career(slug)

        if career and slug not in seen:
            seen.add(slug)
            careers.append(
                {**career_catalog.summary(career), "reason": "You saved this career", "saved": True}
            )

    for metadata in suggested_rows:
        for suggestion in (metadata or {}).get("career_suggestions") or []:
            slug = suggestion.get("slug")
            career = career_catalog.get_career(slug) if slug else None

            if career and slug not in seen:
                seen.add(slug)
                careers.append(
                    {
                        **career_catalog.summary(career),
                        "reason": suggestion.get("why") or "Suggested by your counselor",
                        "saved": False,
                    }
                )

    if len(careers) < 3:
        for match in career_catalog.match_careers(profile, limit=3):
            if match["slug"] not in seen:
                seen.add(match["slug"])
                careers.append(
                    {
                        **match,
                        "reason": match["match_reasons"][0] if match["match_reasons"] else "",
                        "saved": False,
                    }
                )

    anchor = field_quiz.anchor_for(profile)

    if anchor:
        # With a goal, Home suggests the goal and careers in its field only.
        field = field_quiz.goal_field_slugs(anchor)
        goal = career_catalog.get_career(anchor)
        in_field = [career for career in careers if career["slug"] in field and career["slug"] != anchor]
        top = [{**career_catalog.summary(goal), "reason": "Your career goal", "saved": anchor in saved}] if goal else []
        extra = [
            {**career_catalog.summary(item), "reason": "Close to your goal", "saved": False}
            for item in field_quiz.field_for(anchor)
            if item["slug"] not in {career["slug"] for career in in_field} and item["slug"] != anchor
        ]
        return (top + in_field + extra)[:3]

    return careers[:3]


async def _journey(student_id: str) -> dict:
    async with AsyncSessionLocal() as db:
        counts = dict(
            (
                await db.execute(
                    select(ProgressTask.status, func.count())
                    .where(ProgressTask.student_id == student_id)
                    .group_by(ProgressTask.status)
                )
            ).all()
        )

        # The current plan's own steps come first (older versions leave
        # their steps on the checklist); then steps added in chat, newest first.
        plan = (
            await db.execute(
                select(CareerPlan)
                .where(CareerPlan.student_id == student_id, CareerPlan.status == "saved", CareerPlan.deleted_at.is_(None))
                .order_by(CareerPlan.updated_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        current_ids = [task_id for task_id in ((plan.content or {}).get("next_action_task_ids") or []) if task_id] if plan else []
        open_tasks = (
            await db.execute(
                select(ProgressTask)
                .where(
                    ProgressTask.student_id == student_id,
                    ProgressTask.status != "done",
                )
                .order_by(
                    ProgressTask.due_date.is_(None),
                    ProgressTask.due_date,
                    ProgressTask.sort_order,
                    ProgressTask.id,
                )
            )
        ).scalars().all()
        by_id = {task.id: task for task in open_tasks}
        next_task = next((by_id[task_id] for task_id in current_ids if task_id in by_id), None) or (open_tasks[0] if open_tasks else None)

        recent_done = (
            await db.execute(
                select(ProgressTask.title)
                .where(
                    ProgressTask.student_id == student_id,
                    ProgressTask.status == "done",
                )
                .order_by(ProgressTask.updated_at.desc())
                .limit(3)
            )
        ).scalars().all()

    total = sum(counts.values())

    return {
        "total": total,
        "done": counts.get("done", 0),
        "in_progress": counts.get("in_progress", 0),
        "next_task": (
            {
                "id": next_task.id,
                "title": next_task.title,
                "due_date": next_task.due_date,
                "status": next_task.status,
            }
            if next_task
            else None
        ),
        "recent_done": list(recent_done),
    }


def _next_step(
    profile: dict,
    conversations: list[dict],
    pending_facts: int,
    plan: dict | None,
    journey: dict,
    roadmaps: list[dict],
    saved_slugs: list[str],
    record: dict | None = None,
) -> dict:
    if not profile.get("onboarding_completed"):
        return {
            "kind": "onboarding",
            "title": "Tell us a little about you",
            "description": "Five quick questions so your counselor can personalize everything. You can skip any of them.",
            "cta": "Get started",
            "href": "/welcome",
        }

    record = record or {}
    missing = {item["key"]: item for item in record.get("missing") or []}

    # Profile first: grades and resume decide the advice, so they come before anything else.
    if "transcript" in missing:
        return {
            "kind": "transcript",
            "title": "Upload your transcript",
            "description": "Your grades decide which majors, colleges and scholarships are realistic for you. A photo or PDF of your unofficial transcript works.",
            "cta": "Add my transcript",
            "href": "/profile#documents",
        }

    if "resume" in missing:
        return {
            "kind": "resume",
            "title": "Add your resume, with everything you've done",
            "description": "Clubs, sports, jobs, babysitting, volunteering with hours, projects, awards. It all counts, and it all shapes your advice.",
            "cta": "Add my resume",
            "href": "/profile#documents",
        }

    if not profile.get("interest_scores") or not record.get("major_minor"):
        return {
            "kind": "quiz",
            "title": "Take the interest quiz to find your major and minor",
            "description": "About 8 minutes. You'll get your interest type and a major and minor picked from your grades, resume and answers.",
            "cta": "Start the quiz",
            "href": "/discover",
        }

    if plan is None:
        return {
            "kind": "plan",
            "title": "Build My Path",
            "description": "Your major and minor, the classes to take next, colleges to aim for with scholarships, and three steps for this month.",
            "cta": "Build My Path",
            "href": "/plan",
        }

    if journey["next_task"] and plan["status"] == "saved":
        return {
            "kind": "task",
            "title": journey["next_task"]["title"],
            "description": "Your next step from your career plan. Check it off in the plan when it's done.",
            "cta": "Open my plan",
            "href": f"/plan/{plan['id']}",
        }

    if plan["status"] != "saved":
        return {
            "kind": "save_plan",
            "title": "Save your career plan",
            "description": "Saving turns your milestones into steps you can check off.",
            "cta": "Open my plan",
            "href": f"/plan/{plan['id']}",
        }

    if pending_facts:
        return {
            "kind": "review_facts",
            "title": f"Check {pending_facts} thing{'s' if pending_facts != 1 else ''} your counselor noticed",
            "description": "Confirm what's right so future advice fits you better.",
            "cta": "Review",
            "href": "/profile#memory",
        }

    return {
        "kind": "explore",
        "title": "Discover something new",
        "description": "Browse careers and save the ones that spark your curiosity.",
        "cta": "Explore careers",
        "href": "/explore",
    }


async def _documents(student_id: str) -> dict:
    """The newest resume and transcript, so Home can show what's on file."""

    latest: dict[str, dict | None] = {"resume": None, "transcript": None}

    for document in await list_documents(student_id):
        kind = document["doc_type"]

        if kind in latest and latest[kind] is None:
            latest[kind] = {
                "id": document["id"],
                "filename": document["original_filename"],
                "status": document["status"],
                "uploaded_at": document["uploaded_at"],
            }

    return latest


# A new visit starts after this long away, so "Since last time" survives refreshes.
NEW_VISIT_AFTER = timedelta(hours=6)


def _parse(moment: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(moment)
    except (TypeError, ValueError):
        return None

    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


async def _visit(student_id: str, profile: dict) -> datetime | None:
    """Record this visit; return when the previous visit started."""

    now = datetime.now(timezone.utc)
    seen = _parse(profile.get("home_seen_at", ""))

    if seen is None or now - seen > NEW_VISIT_AFTER:
        await save_profile_dict(student_id, {"home_seen_at": now.isoformat(), "home_prev_seen_at": seen.isoformat() if seen else ""})
        return seen

    return _parse(profile.get("home_prev_seen_at", ""))


def since_items(since: datetime, done: list[str], plans: int, documents: list[dict], roadmaps: list[dict], quiz_at: str) -> list[str]:
    """Plain sentences about what the student did after `since`."""

    items = []

    if done:
        items.append(f"You finished {len(done)} step{'s' if len(done) != 1 else ''}: " + "; ".join(done[:2]) + ("…" if len(done) > 2 else ""))

    new_documents = [item for item in documents if (_parse(item.get("uploaded_at") or "") or since) > since]

    if new_documents:
        items.append("You added your " + " and ".join(sorted({item["doc_type"] for item in new_documents})))

    if plans:
        items.append(f"You made {'a new plan' if plans == 1 else f'{plans} new plans'}")

    new_roadmaps = [item for item in roadmaps if (_parse(item.get("updated_at") or "") or since) > since]

    if new_roadmaps:
        items.append("You built a roadmap for " + ", ".join(item["title"] for item in new_roadmaps[:2]))

    if (_parse(quiz_at) or since) > since:
        items.append("You took the interest quiz")

    return items


async def _since_last_time(student_id: str, profile: dict, since: datetime | None, documents: list[dict], roadmaps: list[dict]) -> dict | None:
    """What the student did since their last visit, from their own records."""

    if since is None:
        return None

    naive = since.replace(tzinfo=None)

    async with AsyncSessionLocal() as db:
        done = (
            await db.execute(
                select(ProgressTask.title)
                .where(ProgressTask.student_id == student_id, ProgressTask.status == "done", ProgressTask.updated_at > naive)
                .order_by(ProgressTask.updated_at.desc())
            )
        ).scalars().all()
        plans = (
            await db.execute(
                select(func.count()).select_from(CareerPlan).where(CareerPlan.student_id == student_id, CareerPlan.created_at > naive)
            )
        ).scalar_one()

    items = since_items(since, list(done), plans, documents, roadmaps, profile.get("interest_quiz_at", ""))

    return {"since": since.isoformat(), "items": items}


def _record_summary(record: dict) -> dict:
    academics = record.get("academics") or {}
    options = (record.get("major_minor") or {}).get("options") or []
    bright = record.get("bright_futures") or {}
    checklist = record.get("resume_checklist") or []

    return {
        "gpa_unweighted": academics.get("gpa_unweighted"),
        "gpa_weighted": academics.get("gpa_weighted"),
        "advanced_courses": sum((academics.get("rigor") or {}).values()),
        "strong_areas": academics.get("strong_areas") or [],
        "tests": record.get("tests") or {},
        "service_hours": record.get("service_hours"),
        "riasec": (record.get("riasec") or {}).get("code"),
        "major": options[0]["major"]["title"] if options else "",
        "minor": options[0]["minor"]["title"] if options else "",
        "bright_futures": {"summary": bright.get("summary", ""), "levels": [{"name": level["name"], "status": level["status"]} for level in bright.get("levels") or []]},
        "resume_done": sum(item["done"] for item in checklist),
        "resume_total": len(checklist),
        "missing": record.get("missing") or [],
    }


async def home_summary(student_id: str) -> dict:
    profile = await get_profile_dict(student_id)
    record = await student_record.build_record(student_id, profile)
    previous_visit = await _visit(student_id, profile)
    conversations = await list_conversations(student_id, limit=5)
    facts = await list_facts(student_id)
    plan = await latest_plan(student_id)
    journey = await _journey(student_id)
    roadmaps = await list_roadmaps(student_id)

    pending = len([fact for fact in facts if fact["status"] == "suggested"])

    latest_conversation = next(
        (item for item in conversations if not item["is_legacy"]),
        conversations[0] if conversations else None,
    )

    plan_preview = None

    if plan is not None:
        content = plan.get("content") or {}
        plan_preview = {
            "id": plan["id"],
            "title": plan["title"],
            "status": plan["status"],
            "career_direction": content.get("career_direction", ""),
            "next_three_actions": content.get("next_three_actions", []),
            "updated_at": plan["updated_at"],
        }

    return {
        "name": display_name(profile),
        "grade_level": profile.get("grade_level", ""),
        "onboarding_completed": bool(profile.get("onboarding_completed")),
        "next_step": _next_step(
            profile, conversations, pending, plan, journey, roadmaps, await _saved_slugs(student_id), record
        ),
        "record": _record_summary(record),
        "roadmaps": roadmaps,
        "latest_conversation": latest_conversation,
        "careers": await _careers_worth_exploring(student_id, profile),
        "documents": await _documents(student_id),
        "plan": plan_preview,
        "pending_facts": pending,
        # One step at a time, checkable from Home.
        "this_week": journey["next_task"],
        "since_last_time": await _since_last_time(student_id, profile, previous_visit, await list_documents(student_id), roadmaps),
    }
