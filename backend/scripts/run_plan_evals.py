"""
Generate a plan for a test student in each grade and check it.

Each student is a throwaway account, deleted afterwards. Checks per plan:
  format     schema 2, exactly 3 next steps, at most 3 careers
  facts      every career's pay and education come from the BLS data
  grounded   no figure or name in the plan text that no source supports
  stage      the steps and this year fit the grade (keywords per stage)

Usage (from backend/, services running):
  .venv/bin/python -m scripts.run_plan_evals --label phase5-plans
"""

import argparse
import asyncio
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import delete

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.db.models import Student  # noqa: E402
from app.services import career_catalog, grounding, plan_service  # noqa: E402
from app.services.memory_service import ensure_student  # noqa: E402
from app.services.student_service import save_profile_dict  # noqa: E402


RESULTS = Path(__file__).resolve().parents[1] / "tests" / "evals" / "results"

STUDENTS = [
    {"grade_level": "9th grade", "favorite_subjects": ["Art"], "interests": ["drawing"],
     "stage": re.compile(r"club|elective|try|explore", re.I)},
    {"grade_level": "10th grade", "favorite_subjects": ["Biology"], "interests": ["animals"],
     "stage": re.compile(r"class|volunteer|project|shadow", re.I)},
    {"grade_level": "11th grade", "favorite_subjects": ["Math", "Physics"], "interests": ["robotics"],
     "stage": re.compile(r"\bAP\b|dual enrollment|PSAT|SAT|ACT|summer|shortlist", re.I)},
    {"grade_level": "12th grade", "favorite_subjects": ["Biology", "Chemistry"], "interests": ["helping people"],
     "career_aspiration": "nurse", "career_status": "have_goal",
     "stage": re.compile(r"appl(?:y|ication)|FAFSA|scholarship|deadline|backup", re.I)},
]


def plan_text(content: dict) -> str:
    parts = [content.get("summary", ""), content.get("based_on", "")]
    parts += [f"{step['title']} {step['why']}" for step in content.get("next_steps", [])]
    parts += [career["why"] for career in content.get("careers", [])]
    parts += [" ".join(period["steps"]) for period in content.get("this_year", [])]
    parts += [item["focus"] for item in content.get("high_school", [])]
    parts += [item["description"] for item in content.get("after_high_school", [])]
    parts += [item["how"] for item in content.get("skills", [])]
    return "\n".join(parts)


async def run_one(student: dict) -> dict:
    student_id = f"plan-eval-{uuid4().hex[:12]}"
    profile = {key: value for key, value in student.items() if key != "stage"}
    await ensure_student(student_id)
    await save_profile_dict(student_id, {**profile, "onboarding_completed": True})

    try:
        started = time.monotonic()
        plan = await plan_service.generate_plan(student_id)
        seconds = time.monotonic() - started
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(Student).where(Student.id == student_id))
            await db.commit()

    content = plan["content"]
    scopes = list(career_catalog.career_scopes())
    corpus = "\n".join(text for _, text in scopes) + "\n" + json.dumps(profile)
    ungrounded = grounding.ungrounded_claims(plan_text(content), corpus, scopes)
    early = " ".join(f"{step['title']} {step['why']}" for step in content.get("next_steps", []))
    early += " " + " ".join(" ".join(period["steps"]) for period in content.get("this_year", []))

    facts_ok = all(
        card["pay_median"] == ((career_catalog.career_facts(card["slug"]) or {}).get("wages", {}).get("national") or {}).get("annual_median")
        for card in content.get("careers", [])
    )

    return {
        "grade": profile["grade_level"],
        "seconds": round(seconds, 1),
        "format_ok": content.get("schema") == 2 and len(content.get("next_steps", [])) == 3 and len(content.get("careers", [])) <= 3,
        "facts_ok": facts_ok,
        "grounded": not ungrounded,
        "stage_ok": bool(student["stage"].search(early)),
        "removed_by_app": len((content.get("grounding") or {}).get("removed") or []),
        "ungrounded": [claim["text"] for claim in ungrounded],
        "next_steps": [step["title"] for step in content.get("next_steps", [])],
        "careers": [card["title"] for card in content.get("careers", [])],
        "plan": content,
    }


async def main(args: argparse.Namespace) -> None:
    rows = []

    for student in STUDENTS:
        row = await run_one(student)
        rows.append(row)
        marks = "".join(label if row[key] else "." for key, label in (("format_ok", "F"), ("facts_ok", "D"), ("grounded", "G"), ("stage_ok", "S")))
        print(f"{row['grade']:<11} {marks}  {row['seconds']:5.1f}s  careers {row['careers']}")

        for step in row["next_steps"]:
            print(f"    - {step}")

    for key in ("format_ok", "facts_ok", "grounded", "stage_ok"):
        print(f"{key:<10} {sum(row[key] for row in rows)}/{len(rows)}")

    RESULTS.mkdir(exist_ok=True)
    out = RESULTS / f"{args.label}.json"
    out.write_text(json.dumps({"label": args.label, "ran_at": datetime.now(timezone.utc).isoformat(), "rows": rows}, indent=2))
    print(f"wrote {out.relative_to(RESULTS.parents[2])}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--label", default="plans")
    asyncio.run(main(parser.parse_args()))
