from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.db.models import ProgressTask, ProgressTimeline
from app.models.progress import (
    ProgressTaskCreate,
    ProgressTaskUpdate,
    ProgressTimelineCreate,
    ProgressTimelineUpdate,
)
from app.services.memory_service import ensure_student


def serialize_datetime(value):
    if value is None:
        return None

    return value.isoformat()


def task_to_dict(task: ProgressTask) -> dict:
    return {
        "id": task.id,
        "timeline_id": task.timeline_id,
        "student_id": task.student_id,
        "title": task.title,
        "notes": task.notes,
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date,
        "sort_order": task.sort_order,
        "created_at": serialize_datetime(task.created_at),
        "updated_at": serialize_datetime(task.updated_at),
    }


def timeline_to_dict(
    timeline: ProgressTimeline,
    tasks: list[ProgressTask],
) -> dict:
    timeline_tasks = [
        task_to_dict(task)
        for task in tasks
        if task.timeline_id == timeline.id
    ]

    timeline_tasks.sort(key=lambda item: (item["sort_order"], item["id"]))

    return {
        "id": timeline.id,
        "student_id": timeline.student_id,
        "title": timeline.title,
        "description": timeline.description,
        "start_date": timeline.start_date,
        "end_date": timeline.end_date,
        "status": timeline.status,
        "sort_order": timeline.sort_order,
        "created_at": serialize_datetime(timeline.created_at),
        "updated_at": serialize_datetime(timeline.updated_at),
        "tasks": timeline_tasks,
    }


async def get_progress_board(student_id: str) -> dict:
    await ensure_student(student_id)

    async with AsyncSessionLocal() as db:
        timeline_result = await db.execute(
            select(ProgressTimeline)
            .where(ProgressTimeline.student_id == student_id)
            .order_by(
                ProgressTimeline.sort_order.asc(),
                ProgressTimeline.id.asc(),
            )
        )

        timelines = timeline_result.scalars().all()

        task_result = await db.execute(
            select(ProgressTask)
            .where(ProgressTask.student_id == student_id)
            .order_by(
                ProgressTask.sort_order.asc(),
                ProgressTask.id.asc(),
            )
        )

        tasks = task_result.scalars().all()

        return {
            "status": "success",
            "student_id": student_id,
            "timelines": [
                timeline_to_dict(timeline, tasks)
                for timeline in timelines
            ],
        }


async def create_progress_timeline(
    student_id: str,
    payload: ProgressTimelineCreate,
) -> dict:
    await ensure_student(student_id)

    async with AsyncSessionLocal() as db:
        timeline = ProgressTimeline(
            student_id=student_id,
            title=payload.title,
            description=payload.description,
            start_date=payload.start_date,
            end_date=payload.end_date,
            status=payload.status,
            sort_order=payload.sort_order,
        )

        db.add(timeline)
        await db.commit()
        await db.refresh(timeline)

        return timeline_to_dict(timeline, [])


async def update_progress_timeline(
    student_id: str,
    timeline_id: int,
    payload: ProgressTimelineUpdate,
) -> dict:
    await ensure_student(student_id)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProgressTimeline).where(
                ProgressTimeline.id == timeline_id,
                ProgressTimeline.student_id == student_id,
            )
        )

        timeline = result.scalar_one_or_none()

        if timeline is None:
            raise HTTPException(
                status_code=404,
                detail="Progress timeline not found.",
            )

        updates = payload.model_dump(exclude_unset=True)

        for key, value in updates.items():
            setattr(timeline, key, value)

        timeline.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(timeline)

        task_result = await db.execute(
            select(ProgressTask).where(
                ProgressTask.timeline_id == timeline.id,
                ProgressTask.student_id == student_id,
            )
        )

        tasks = task_result.scalars().all()

        return timeline_to_dict(timeline, tasks)


async def delete_progress_timeline(
    student_id: str,
    timeline_id: int,
) -> dict:
    await ensure_student(student_id)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProgressTimeline).where(
                ProgressTimeline.id == timeline_id,
                ProgressTimeline.student_id == student_id,
            )
        )

        timeline = result.scalar_one_or_none()

        if timeline is None:
            raise HTTPException(
                status_code=404,
                detail="Progress timeline not found.",
            )

        await db.delete(timeline)
        await db.commit()

        return {
            "status": "success",
            "message": "Progress timeline deleted successfully.",
        }


async def create_progress_task(
    student_id: str,
    timeline_id: int,
    payload: ProgressTaskCreate,
) -> dict:
    await ensure_student(student_id)

    async with AsyncSessionLocal() as db:
        timeline_result = await db.execute(
            select(ProgressTimeline).where(
                ProgressTimeline.id == timeline_id,
                ProgressTimeline.student_id == student_id,
            )
        )

        timeline = timeline_result.scalar_one_or_none()

        if timeline is None:
            raise HTTPException(
                status_code=404,
                detail="Progress timeline not found.",
            )

        task = ProgressTask(
            timeline_id=timeline_id,
            student_id=student_id,
            title=payload.title,
            notes=payload.notes,
            status=payload.status,
            priority=payload.priority,
            due_date=payload.due_date,
            sort_order=payload.sort_order,
        )

        db.add(task)
        await db.commit()
        await db.refresh(task)

        return task_to_dict(task)


async def update_progress_task(
    student_id: str,
    task_id: int,
    payload: ProgressTaskUpdate,
) -> dict:
    await ensure_student(student_id)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProgressTask).where(
                ProgressTask.id == task_id,
                ProgressTask.student_id == student_id,
            )
        )

        task = result.scalar_one_or_none()

        if task is None:
            raise HTTPException(
                status_code=404,
                detail="Progress task not found.",
            )

        updates = payload.model_dump(exclude_unset=True)

        for key, value in updates.items():
            setattr(task, key, value)

        task.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(task)

        return task_to_dict(task)


async def delete_progress_task(
    student_id: str,
    task_id: int,
) -> dict:
    await ensure_student(student_id)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProgressTask).where(
                ProgressTask.id == task_id,
                ProgressTask.student_id == student_id,
            )
        )

        task = result.scalar_one_or_none()

        if task is None:
            raise HTTPException(
                status_code=404,
                detail="Progress task not found.",
            )

        await db.delete(task)
        await db.commit()

        return {
            "status": "success",
            "message": "Progress task deleted successfully.",
        }
