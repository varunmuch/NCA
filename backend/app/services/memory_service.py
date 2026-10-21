from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.db.models import Student, StudentMemory


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
