"""
Student profile and remembered facts.

The profile holds what the student typed into forms. Facts hold smaller
pieces of information the counselor or a document surfaced; a fact is
"suggested" until the student confirms it, and only confirmed facts are
presented to the model as established.
"""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.db.models import StudentFact, StudentProfileMemory
from app.models.profile import StudentProfile


FACT_CATEGORIES = {
    "grade_level": "Grade",
    "favorite_subjects": "Favorite subjects",
    "interests": "Interests",
    "hobbies": "Hobbies",
    "skills": "Skills",
    "strengths": "Strengths",
    "career_interests": "Careers I'm curious about",
    "activities": "Activities & clubs",
    "experience": "Experience",
    "courses": "Courses",
    "achievements": "Awards & achievements",
    "academic_goals": "Academic goals",
    "preferences": "Preferences",
    "constraints": "Things to keep in mind",
    "location": "Location",
}

MAX_FACT_LENGTH = 300


async def get_profile_dict(student_id: str) -> dict:
    async with AsyncSessionLocal() as db:
        record = await db.get(StudentProfileMemory, student_id)

    data = dict(record.profile_json) if record else {}

    # Fill new fields with defaults without dropping legacy ones.
    shaped = StudentProfile.model_validate(
        {
            key: value
            for key, value in data.items()
            if key in StudentProfile.model_fields
        }
    ).model_dump()

    return {**data, **shaped}


async def save_profile_dict(student_id: str, updates: dict) -> dict:
    async with AsyncSessionLocal() as db:
        record = await db.get(StudentProfileMemory, student_id)

        current = dict(record.profile_json) if record else {}

        merged = {**current, **updates}

        # The login email belongs to the auth provider, not the form.
        if "email" in current:
            merged["email"] = current["email"]

        validated = StudentProfile.model_validate(
            {
                key: value
                for key, value in merged.items()
                if key in StudentProfile.model_fields
            }
        ).model_dump()

        merged = {**merged, **validated}

        if record is None:
            db.add(
                StudentProfileMemory(
                    student_id=student_id,
                    profile_json=merged,
                    updated_at=datetime.utcnow(),
                )
            )
        else:
            record.profile_json = merged
            record.updated_at = datetime.utcnow()

        await db.commit()

    return merged


def normalize_grade(value: str) -> str:
    """Turn a bare number like "11" (common on transcripts) into "11th grade"."""

    cleaned = value.strip()

    if cleaned.isdigit() and 1 <= int(cleaned) <= 12:
        number = int(cleaned)
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(number, "th")
        return f"{number}{suffix} grade"

    return cleaned


def display_name(profile: dict) -> str:
    preferred = str(profile.get("preferred_name") or "").strip()

    if preferred:
        return preferred

    name = str(profile.get("name") or "").strip()

    return name.split(" ")[0] if name else ""


def fact_to_dict(fact: StudentFact) -> dict:
    return {
        "id": fact.id,
        "category": fact.category,
        "category_label": FACT_CATEGORIES.get(fact.category, fact.category),
        "value": fact.value,
        "status": fact.status,
        "source_type": fact.source_type,
        "source_id": fact.source_id,
        "source_excerpt": fact.source_excerpt,
        "created_at": fact.created_at.isoformat() if fact.created_at else None,
        "updated_at": fact.updated_at.isoformat() if fact.updated_at else None,
    }


def _normalize(value: str) -> str:
    return " ".join(value.lower().split())


async def list_facts(
    student_id: str,
    *,
    include_dismissed: bool = False,
) -> list[dict]:
    async with AsyncSessionLocal() as db:
        query = select(StudentFact).where(StudentFact.student_id == student_id)

        if not include_dismissed:
            query = query.where(StudentFact.status != "dismissed")

        result = await db.execute(query.order_by(StudentFact.created_at.desc()))

        return [fact_to_dict(fact) for fact in result.scalars().all()]


async def add_facts(
    student_id: str,
    facts: list[dict],
    *,
    status: str,
    source_type: str,
    source_id: str | None,
) -> list[dict]:
    """
    Store new facts, skipping any the student already has (in any status,
    so a dismissed suggestion is not proposed again).
    """

    if not facts:
        return []

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(StudentFact.category, StudentFact.value).where(
                StudentFact.student_id == student_id
            )
        )

        existing = {
            (category, _normalize(value))
            for category, value in result.all()
        }

        created = []

        for item in facts:
            category = item.get("category", "")
            value = str(item.get("value") or "").strip()[:MAX_FACT_LENGTH]

            if category not in FACT_CATEGORIES or not value:
                continue

            key = (category, _normalize(value))

            if key in existing:
                continue

            existing.add(key)

            fact = StudentFact(
                student_id=student_id,
                category=category,
                value=value,
                status=status,
                source_type=source_type,
                source_id=source_id,
                source_excerpt=str(item.get("evidence") or "")[:500],
            )
            db.add(fact)
            created.append(fact)

        await db.commit()

        return [fact_to_dict(fact) for fact in created]


async def _owned_fact(db, student_id: str, fact_id: int) -> StudentFact:
    fact = await db.get(StudentFact, fact_id)

    if fact is None or fact.student_id != student_id:
        raise HTTPException(status_code=404, detail="Fact not found.")

    return fact


async def update_fact(
    student_id: str,
    fact_id: int,
    *,
    value: str | None = None,
    status: str | None = None,
    category: str | None = None,
) -> dict:
    async with AsyncSessionLocal() as db:
        fact = await _owned_fact(db, student_id, fact_id)

        if value is not None:
            cleaned = value.strip()[:MAX_FACT_LENGTH]

            if not cleaned:
                raise HTTPException(status_code=400, detail="Value is required.")

            if cleaned != fact.value:
                fact.value = cleaned
                # A student correction is confirmed by definition.
                fact.status = "confirmed"

        if category is not None:
            if category not in FACT_CATEGORIES:
                raise HTTPException(status_code=400, detail="Unknown category.")

            fact.category = category

        if status is not None:
            if status not in {"confirmed", "suggested", "dismissed"}:
                raise HTTPException(status_code=400, detail="Unknown status.")

            fact.status = status

        fact.updated_at = datetime.utcnow()

        await db.commit()

        result = fact_to_dict(fact)

    # A confirmed grade is the student's current grade.
    if result["status"] == "confirmed" and result["category"] == "grade_level":
        await save_profile_dict(student_id, {"grade_level": normalize_grade(result["value"])})

    return result


async def delete_fact(student_id: str, fact_id: int) -> None:
    async with AsyncSessionLocal() as db:
        fact = await _owned_fact(db, student_id, fact_id)
        await db.delete(fact)
        await db.commit()
