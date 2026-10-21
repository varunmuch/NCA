"""
The data behind the Home page. Everything shown is read from the
student's real records; nothing is generated here.
"""

from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.db.models import Message, ProgressTask, SavedCareer
from app.services import career_catalog
from app.services.conversation_service import list_conversations
from app.services.document_service import list_documents
from app.services.plan_service import latest_plan
from app.services.roadmap_service import list_roadmaps
from app.services.student_service import display_name, get_profile_dict, list_facts


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

        next_task = (
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
                .limit(1)
            )
        ).scalar_one_or_none()

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
) -> dict:
    if not profile.get("onboarding_completed"):
        return {
            "kind": "onboarding",
            "title": "Tell us a little about you",
            "description": "Five quick questions so your counselor can personalize everything. You can skip any of them.",
            "cta": "Get started",
            "href": "/welcome",
        }

    if not profile.get("interest_scores") and not saved_slugs and not roadmaps:
        return {
            "kind": "quiz",
            "title": "Not sure what you want to be? Take the interest quiz",
            "description": "Five short parts, about 8 minutes. You'll get your interest code and careers ranked by how well they fit.",
            "cta": "Start the quiz",
            "href": "/discover",
        }

    if not [item for item in conversations if not item["is_legacy"]]:
        return {
            "kind": "counselor",
            "title": "Have your first conversation",
            "description": "Your counselor can help whether you already have a career in mind or have no idea yet.",
            "cta": "Talk to my counselor",
            "href": "/counselor",
        }

    if pending_facts:
        return {
            "kind": "review_facts",
            "title": f"Check {pending_facts} thing{'s' if pending_facts != 1 else ''} your counselor noticed",
            "description": "Confirm what's right so future advice fits you better.",
            "cta": "Review",
            "href": "/profile#memory",
        }

    saved_career = next(
        (career for slug in saved_slugs if (career := career_catalog.get_career(slug))),
        None,
    )

    if not roadmaps and saved_career is not None:
        return {
            "kind": "roadmap",
            "title": f"Map your path to {saved_career['title']}",
            "description": "Get goals from this week to five years out, plus courses, programs, and scholarships that fit you.",
            "cta": "Build my roadmap",
            "href": f"/explore/{saved_career['slug']}#roadmap",
        }

    if plan is None:
        return {
            "kind": "plan",
            "title": "Build your first career plan",
            "description": "Turn what you've talked about into clear steps for this year.",
            "cta": "Create my plan",
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


async def home_summary(student_id: str) -> dict:
    profile = await get_profile_dict(student_id)
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
            profile, conversations, pending, plan, journey, roadmaps, await _saved_slugs(student_id)
        ),
        "roadmaps": roadmaps,
        "latest_conversation": latest_conversation,
        "careers": await _careers_worth_exploring(student_id, profile),
        "documents": await _documents(student_id),
        "plan": plan_preview,
        "pending_facts": pending,
    }
