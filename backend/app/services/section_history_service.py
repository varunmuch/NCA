from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.db.models import SectionResponse


async def save_section_response(
    student_id: str,
    section: str,
    prompt: str,
    backend_prompt: str,
    response_json: dict,
) -> None:
    async with AsyncSessionLocal() as db:
        db.add(
            SectionResponse(
                student_id=student_id,
                section=section,
                prompt=prompt,
                backend_prompt=backend_prompt,
                response_json=response_json,
            )
        )

        await db.commit()


async def get_section_responses(
    student_id: str,
    section: str,
    limit: int = 50,
) -> list[dict]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SectionResponse)
            .where(
                SectionResponse.student_id == student_id,
                SectionResponse.section == section,
            )
            .order_by(SectionResponse.id.asc())
            .limit(limit)
        )

        rows = result.scalars().all()

        return [
            {
                "id": row.id,
                "student_id": row.student_id,
                "section": row.section,
                "prompt": row.prompt,
                "backend_prompt": row.backend_prompt,
                "response": row.response_json,
                "created_at": row.created_at.isoformat()
                if row.created_at
                else None,
            }
            for row in rows
        ]

