import json

from sqlalchemy import select

from app.core.config import config
from app.core.database import AsyncSessionLocal
from app.db.models import (
    Message,
    Student,
    StudentMemory,
    StudentProfileMemory,
)


RECENT_MESSAGE_COUNT = config["memory"]["recent_message_count"]


async def ensure_student(student_id: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Student).where(Student.id == student_id)
        )

        student = result.scalar_one_or_none()

        if student is None:
            db.add(Student(id=student_id))
            db.add(
                StudentMemory(
                    student_id=student_id,
                    summary="",
                )
            )

            await db.commit()


async def save_profile(student_id: str, profile) -> None:
    if profile is None:
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(StudentProfileMemory).where(
                StudentProfileMemory.student_id == student_id
            )
        )

        existing = result.scalar_one_or_none()
        profile_data = profile.model_dump()

        if existing is None:
            db.add(
                StudentProfileMemory(
                    student_id=student_id,
                    profile_json=profile_data,
                )
            )
        else:
            existing.profile_json = profile_data

        await db.commit()


async def get_profile(student_id: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(StudentProfileMemory).where(
                StudentProfileMemory.student_id == student_id
            )
        )

        record = result.scalar_one_or_none()

        if record is None:
            return None

        return record.profile_json


async def save_message(
    student_id: str,
    role: str,
    content: str,
) -> None:
    async with AsyncSessionLocal() as db:
        db.add(
            Message(
                student_id=student_id,
                role=role,
                content=content,
            )
        )

        await db.commit()


async def get_memory_summary(student_id: str) -> str:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(StudentMemory).where(
                StudentMemory.student_id == student_id
            )
        )

        memory = result.scalar_one_or_none()

        if memory is None:
            return ""

        return memory.summary or ""


async def get_recent_messages(student_id: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Message)
            .where(Message.student_id == student_id)
            .order_by(Message.id.desc())
            .limit(RECENT_MESSAGE_COUNT)
        )

        messages = list(reversed(result.scalars().all()))

        return [
            {
                "role": message.role,
                "content": message.content,
            }
            for message in messages
        ]


async def build_student_context(student_id: str) -> dict:
    profile = await get_profile(student_id)
    summary = await get_memory_summary(student_id)
    recent_messages = await get_recent_messages(student_id)

    return {
        "latest_profile": profile,
        "long_term_memory": summary,
        "recent_messages": recent_messages,
    }


def memory_context_to_text(memory_context: dict) -> str:
    return json.dumps(
        memory_context,
        indent=2,
        default=str
    )
