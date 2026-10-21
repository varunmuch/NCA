"""
School counselor (staff) dashboard.

Staff are listed by email in CIE_STAFF_EMAILS (comma-separated). A staff
member's sign-in email must be verified: by Google, or by the email link
for password accounts.

Staff see each student's profile, interest quiz, plan, progress,
roadmaps, saved careers, and document list. They do not see counselor
chat messages, which stay private to the student. Every detail view is
logged.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.core.security import current_student_id
from app.db.models import (
    CareerPlan,
    CareerRoadmap,
    Conversation,
    Message,
    ProgressTask,
    ResumeDocument,
    SavedCareer,
    Student,
    StudentAuthIdentity,
    StudentPasswordCredential,
    StudentProfileMemory,
)
from app.services import career_catalog, interest_quiz
from app.services.plan_service import latest_plan
from app.services.progress_service import get_progress_board
from app.services.roadmap_service import list_roadmaps
from app.services.student_service import display_name, get_profile_dict, list_facts


logger = logging.getLogger("cie.staff")

INACTIVE_AFTER = timedelta(days=14)


def staff_emails() -> set[str]:
    return {
        email.strip().lower()
        for email in os.getenv("CIE_STAFF_EMAILS", "").split(",")
        if email.strip()
    }


async def verified_emails(student_id: str) -> set[str]:
    async with AsyncSessionLocal() as db:
        google = (
            await db.execute(
                select(StudentAuthIdentity.email).where(
                    StudentAuthIdentity.student_id == student_id,
                    StudentAuthIdentity.provider == "google",
                )
            )
        ).scalars().all()

        password = (
            await db.execute(
                select(StudentPasswordCredential.email).where(
                    StudentPasswordCredential.student_id == student_id,
                    StudentPasswordCredential.email_verified_at.is_not(None),
                )
            )
        ).scalars().all()

    return {email.lower() for email in [*google, *password] if email}


async def is_staff(student_id: str) -> bool:
    allowed = staff_emails()

    return bool(allowed) and bool(allowed & await verified_emails(student_id))


async def current_staff_id(student_id: str = Depends(current_student_id)) -> str:
    if not await is_staff(student_id):
        raise HTTPException(status_code=403, detail="This page is for school counselors.")

    return student_id


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


async def list_students() -> list[dict]:
    async with AsyncSessionLocal() as db:
        # Students who can sign in (legacy records without a login are skipped).
        rows = (
            await db.execute(
                select(
                    Student.id,
                    StudentProfileMemory.profile_json,
                    func.min(StudentAuthIdentity.email),
                    func.max(StudentAuthIdentity.last_login_at),
                )
                .join(StudentAuthIdentity, StudentAuthIdentity.student_id == Student.id)
                .outerjoin(StudentProfileMemory, StudentProfileMemory.student_id == Student.id)
                .group_by(Student.id, StudentProfileMemory.profile_json)
            )
        ).all()

        async def grouped(statement) -> dict:
            return {row[0]: row[1:] for row in (await db.execute(statement)).all()}

        messages = await grouped(
            select(Message.student_id, func.count(), func.max(Message.created_at))
            .where(Message.role == "user")
            .group_by(Message.student_id)
        )
        conversations = await grouped(
            select(Conversation.student_id, func.count())
            .where(Conversation.deleted_at.is_(None))
            .group_by(Conversation.student_id)
        )
        tasks = await grouped(
            select(
                ProgressTask.student_id,
                func.count(),
                func.count().filter(ProgressTask.status == "done"),
                func.max(ProgressTask.updated_at),
            ).group_by(ProgressTask.student_id)
        )
        plans = await grouped(
            select(
                CareerPlan.student_id,
                func.count(),
                func.count().filter(CareerPlan.status == "saved"),
            )
            .where(CareerPlan.deleted_at.is_(None))
            .group_by(CareerPlan.student_id)
        )
        roadmaps = await grouped(
            select(CareerRoadmap.student_id, func.count()).group_by(CareerRoadmap.student_id)
        )
        saved = await grouped(
            select(SavedCareer.student_id, func.count()).group_by(SavedCareer.student_id)
        )
        documents = await grouped(
            select(
                ResumeDocument.student_id,
                func.count(),
                func.count().filter(ResumeDocument.status == "failed"),
            )
            .where(ResumeDocument.deleted_at.is_(None))
            .group_by(ResumeDocument.student_id)
        )

    now = datetime.now(timezone.utc)
    students = []

    for student_id, profile, email, last_login in rows:
        profile = profile or {}
        message_count, last_message = messages.get(student_id, (0, None))
        task_total, task_done, last_task = tasks.get(student_id, (0, 0, None))
        plan_total, plan_saved = plans.get(student_id, (0, 0))
        doc_total, doc_failed = documents.get(student_id, (0, 0))

        last_active = max((stamp for stamp in (last_message, last_task, last_login) if stamp), default=None)
        quiz = profile.get("interest_scores") or {}

        flags = []

        if not last_active or now - last_active > INACTIVE_AFTER:
            flags.append("inactive")

        if not quiz and not saved.get(student_id) and not plan_total:
            flags.append("no_direction")

        if plan_total and not plan_saved:
            flags.append("plan_not_saved")

        if doc_failed:
            flags.append("document_failed")

        students.append(
            {
                "id": student_id,
                "name": display_name(profile) or (email or "").split("@")[0],
                "email": email,
                "grade_level": profile.get("grade_level", ""),
                "career_status": profile.get("career_status", ""),
                "career_aspiration": profile.get("career_aspiration", ""),
                "top_interests": [
                    career_catalog.INTEREST_LABELS[kind]
                    for kind in interest_quiz.top_types(quiz, 2)
                ]
                if quiz
                else [],
                "last_active": _iso(last_active),
                "active_this_week": bool(last_active and now - last_active <= timedelta(days=7)),
                "messages": message_count,
                "conversations": conversations.get(student_id, (0,))[0],
                "plan": "saved" if plan_saved else ("draft" if plan_total else "none"),
                "tasks_total": task_total,
                "tasks_done": task_done,
                "roadmaps": roadmaps.get(student_id, (0,))[0],
                "saved_careers": saved.get(student_id, (0,))[0],
                "documents": doc_total,
                "flags": flags,
            }
        )

    students.sort(key=lambda item: item["last_active"] or "", reverse=True)

    return students


async def student_detail(staff_id: str, student_id: str) -> dict:
    async with AsyncSessionLocal() as db:
        exists = await db.scalar(
            select(StudentAuthIdentity.student_id).where(StudentAuthIdentity.student_id == student_id).limit(1)
        )

        doc_rows = (
            await db.execute(
                select(ResumeDocument)
                .where(ResumeDocument.student_id == student_id, ResumeDocument.deleted_at.is_(None))
                .order_by(ResumeDocument.uploaded_at.desc())
            )
        ).scalars().all()

        saved_slugs = (
            await db.execute(
                select(SavedCareer.career_slug)
                .where(SavedCareer.student_id == student_id)
                .order_by(SavedCareer.created_at.desc())
            )
        ).scalars().all()

    if exists is None:
        raise HTTPException(status_code=404, detail="Student not found.")

    logger.info("staff %s viewed student %s", staff_id, student_id)

    profile = await get_profile_dict(student_id)
    plan = await latest_plan(student_id)
    board = await get_progress_board(student_id)

    return {
        "id": student_id,
        "name": display_name(profile),
        "profile": {
            key: profile.get(key)
            for key in (
                "grade_level",
                "school",
                "career_status",
                "career_aspiration",
                "academic_goals",
                "favorite_subjects",
                "interests",
                "strengths",
                "activities",
                "skills",
            )
        },
        "quiz": interest_quiz.result_payload(profile),
        "facts": [
            {"category": fact["category"], "value": fact["value"]}
            for fact in await list_facts(student_id)
            if fact["status"] == "confirmed"
        ],
        "plan": plan,
        "progress": board.get("timelines", []),
        "roadmaps": await list_roadmaps(student_id, limit=20),
        "saved_careers": [
            career_catalog.summary(career)
            for slug in saved_slugs
            if (career := career_catalog.get_career(slug))
        ],
        "documents": [
            {
                "id": record.id,
                "filename": record.original_filename,
                "doc_type": record.doc_type,
                "status": record.status,
                "uploaded_at": _iso(record.uploaded_at),
            }
            for record in doc_rows
        ],
    }
