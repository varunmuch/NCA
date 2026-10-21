"""
Create or delete a throwaway student account for UI tests and screenshots.

Never use a real student's account for testing. This makes a password
account on a reserved test domain, optionally seeded so pages look lived
in, and deletes it (with everything it owns) afterwards.

Usage (from backend/):
  .venv/bin/python -m scripts.ui_test_account create            # empty account
  .venv/bin/python -m scripts.ui_test_account create --seed     # profile, quiz, saved career, plan
  .venv/bin/python -m scripts.ui_test_account delete EMAIL
  .venv/bin/python -m scripts.ui_test_account delete-all        # every ui-test account

create prints JSON: {"email", "password", "student_id"}.
"""

import argparse
import asyncio
import json
import secrets
import sys
from pathlib import Path

from sqlalchemy import delete, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.db.models import SavedCareer, Student, StudentAuthIdentity  # noqa: E402
from app.services import interest_quiz, plan_service  # noqa: E402
from app.services.password_auth_service import signup_with_password  # noqa: E402
from app.services.student_service import save_profile_dict  # noqa: E402


DOMAIN = "ui-test.example.com"

PROFILE = {
    "preferred_name": "Sam",
    "name": "Sam Rivera",
    "grade_level": "10th grade",
    "favorite_subjects": ["Art", "Biology"],
    "interests": ["drawing", "video games", "animals"],
    "career_status": "exploring",
    "onboarding_completed": True,
}


def _quiz_answers() -> dict:
    """Artistic and Investigative lean, so results look realistic."""

    high = {"Artistic", "Investigative"}
    return {
        "activities": {qid: 5 if kind in high else 2 for qid, kind, _ in interest_quiz.ACTIVITIES},
        "tradeoffs": {
            qid: "b" if second in high and first not in high else "a"
            for qid, first, second, _, _ in interest_quiz.TRADEOFFS
        },
        "settings": ["arts", "science"],
        "subjects": ["Art & Design", "Biology"],
        "training": "four_year",
    }


async def create(seed: bool) -> dict:
    email = f"ui-test-{secrets.token_hex(4)}@{DOMAIN}"
    password = secrets.token_urlsafe(18)
    account = await signup_with_password(email, password, "Sam Rivera")
    student_id = account["student_id"]

    await save_profile_dict(student_id, PROFILE)

    if seed:
        scores, details = interest_quiz.score(_quiz_answers())
        await save_profile_dict(
            student_id,
            {"interest_scores": scores, "interest_quiz": details, "interest_quiz_at": interest_quiz.taken_now()},
        )

        async with AsyncSessionLocal() as db:
            db.add(SavedCareer(student_id=student_id, career_slug="graphic-designers"))
            await db.commit()

        plan = await plan_service.generate_plan(student_id)
        await plan_service.save_plan(student_id, plan["id"])

    return {"email": email, "password": password, "student_id": student_id}


async def delete_accounts(email: str | None) -> int:
    async with AsyncSessionLocal() as db:
        query = select(StudentAuthIdentity.student_id).where(StudentAuthIdentity.email.like(f"%@{DOMAIN}"))

        if email:
            if not email.endswith("@" + DOMAIN):
                sys.exit(f"Refusing to delete a non-test account: {email}")

            query = query.where(StudentAuthIdentity.email == email.lower())

        ids = list((await db.execute(query)).scalars().all())

        if ids:
            await db.execute(delete(Student).where(Student.id.in_(ids)))
            await db.commit()

        return len(ids)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    make = commands.add_parser("create")
    make.add_argument("--seed", action="store_true")
    remove = commands.add_parser("delete")
    remove.add_argument("email")
    commands.add_parser("delete-all")
    args = parser.parse_args()

    if args.command == "create":
        print(json.dumps(asyncio.run(create(args.seed))))
    elif args.command == "delete":
        print(f"deleted {asyncio.run(delete_accounts(args.email))}")
    else:
        print(f"deleted {asyncio.run(delete_accounts(None))}")


if __name__ == "__main__":
    main()
