"""
Merge one student account into another (for duplicates created by signing
in different ways with the same email).

Every row owned by SOURCE moves to TARGET, sign-in methods included, so both
ways of signing in open TARGET afterwards. Profile fields TARGET left empty
are filled from SOURCE. SOURCE is then deleted.

Back up first:
  docker exec cie-postgres pg_dump -U cie -d cie -Fc > backups/cie_$(date +%Y%m%d_%H%M%S).dump

Usage (from backend/):
  .venv/bin/python -m scripts.merge_students SOURCE_ID TARGET_ID          # dry run
  .venv/bin/python -m scripts.merge_students SOURCE_ID TARGET_ID --apply
"""

import argparse
import asyncio
import json

from sqlalchemy import text

from app.core.database import AsyncSessionLocal


# Tables where (student_id, key) must stay unique: SOURCE rows that
# collide with TARGET rows are dropped instead of moved.
UNIQUE_PER_STUDENT = {
    "saved_careers": "career_slug",
    "career_roadmaps": "career_slug",
}

# Plain ownership; rows move as-is.
MOVE_TABLES = [
    "conversations",
    "messages",
    "resume_documents",
    "document_chunks",
    "student_facts",
    "career_plans",
    "progress_timelines",
    "progress_tasks",
    "section_responses",
    "student_auth_identities",
]


def _empty(value) -> bool:
    return value in (None, "", [], {}, 0, 0.0, False)


async def merge(source: str, target: str, apply: bool) -> None:
    async with AsyncSessionLocal() as db:
        for student_id in (source, target):
            found = await db.scalar(text("select id from students where id = :id"), {"id": student_id})

            if found is None:
                raise SystemExit(f"No student {student_id!r}.")

        if await db.scalar(
            text("select count(*) from student_password_credentials where student_id = :s"), {"s": source}
        ) and await db.scalar(
            text("select count(*) from student_password_credentials where student_id = :t"), {"t": target}
        ):
            raise SystemExit("Both accounts have a password; merge would drop one. Resolve manually.")

        for table in MOVE_TABLES:
            count = await db.scalar(text(f"select count(*) from {table} where student_id = :s"), {"s": source})
            print(f"{table}: {count} row(s) move")

            if apply and count:
                await db.execute(
                    text(f"update {table} set student_id = :t where student_id = :s"),
                    {"s": source, "t": target},
                )

        for table, key in UNIQUE_PER_STUDENT.items():
            params = {"s": source, "t": target}
            clash = f"{key} in (select {key} from {table} where student_id = :t)"
            dropped = await db.scalar(text(f"select count(*) from {table} where student_id = :s and {clash}"), params)
            moved = await db.scalar(text(f"select count(*) from {table} where student_id = :s and not {clash}"), params)
            print(f"{table}: {moved} row(s) move, {dropped} duplicate(s) dropped")

            if apply:
                await db.execute(text(f"delete from {table} where student_id = :s and {clash}"), params)
                await db.execute(text(f"update {table} set student_id = :t where student_id = :s"), params)

        password = await db.scalar(
            text("select count(*) from student_password_credentials where student_id = :s"), {"s": source}
        )
        print(f"student_password_credentials: {password} row(s) move")

        if apply and password:
            await db.execute(
                text("update student_password_credentials set student_id = :t where student_id = :s"),
                {"s": source, "t": target},
            )
            # Password identities use the student ID as their subject.
            await db.execute(
                text(
                    "update student_auth_identities set provider_subject = :t "
                    "where provider = 'password' and provider_subject = :s"
                ),
                {"s": source, "t": target},
            )

        profiles = dict(
            (
                await db.execute(
                    text("select student_id, profile_json from student_profile_memory where student_id in (:s, :t)"),
                    {"s": source, "t": target},
                )
            ).all()
        )
        merged = dict(profiles.get(target) or {})
        filled = []

        for key, value in (profiles.get(source) or {}).items():
            if key == "email":
                continue

            if _empty(merged.get(key)) and not _empty(value):
                merged[key] = value
                filled.append(key)

        print(f"profile fields filled from source: {', '.join(filled) or 'none'}")

        memories = dict(
            (
                await db.execute(
                    text("select student_id, summary from student_memory where student_id in (:s, :t)"),
                    {"s": source, "t": target},
                )
            ).all()
        )
        summary = "\n\n".join(part for part in (memories.get(target), memories.get(source)) if part)

        if not apply:
            print("Dry run: nothing changed. Re-run with --apply.")
            return

        await db.execute(
            text(
                "insert into student_profile_memory (student_id, profile_json, updated_at) "
                "values (:t, cast(:p as jsonb), now()) "
                "on conflict (student_id) do update set profile_json = excluded.profile_json, updated_at = now()"
            ),
            {"t": target, "p": json.dumps(merged)},
        )

        if target in memories:
            await db.execute(
                text("update student_memory set summary = :m where student_id = :t"),
                {"m": summary, "t": target},
            )

        await db.execute(text("delete from students where id = :s"), {"s": source})
        await db.commit()

    print(f"Merged {source} into {target}.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    if args.source == args.target:
        raise SystemExit("Source and target are the same.")

    asyncio.run(merge(args.source, args.target, args.apply))


if __name__ == "__main__":
    main()
