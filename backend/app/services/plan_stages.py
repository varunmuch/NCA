"""
What a plan or roadmap should focus on in each high school grade.

The stage comes from the student's grade in their profile. With no grade
set, the prompt says so and asks for a plan that works for any grade.
"""

import re
from datetime import date


STAGES = {
    9: {
        "name": "Explore",
        "goal": "Try things and notice what you enjoy.",
        "priorities": [
            "join a club or two and try an elective you're curious about",
            "discover 2 to 3 interests by trying them, not just reading about them",
            "build good study habits and keep your grades steady",
        ],
    },
    10: {
        "name": "Narrow down",
        "goal": "Start choosing on purpose.",
        "priorities": [
            "pick next year's classes on purpose, toward what you enjoy",
            "try a project, volunteering, or a job shadow in a field that interests you",
            "sample a few careers up close and cross some off",
        ],
    },
    11: {
        "name": "Prepare",
        "goal": "Build what you'll need for the path you're leaning toward.",
        "priorities": [
            "take AP or dual enrollment classes where they fit your path",
            "prepare for and take the PSAT, SAT, or ACT if college is a possibility",
            "look for a summer program, internship, or part-time job in your field",
            "make a shortlist of colleges or training programs",
        ],
    },
    12: {
        "name": "Decide and apply",
        "goal": "Choose your next step and apply.",
        "priorities": [
            "finish college, program, or apprenticeship applications",
            "complete the FAFSA and look for scholarships with your school counselor",
            "keep a calendar of deadlines and meet each one",
            "have a backup path you'd also be happy with",
        ],
    },
}

WORDS = {"freshman": 9, "sophomore": 10, "junior": 11, "senior": 12}


def grade_number(grade_level: str | None) -> int | None:
    """'10th grade', 'Grade 11', 'junior' -> the grade; anything else -> None."""

    text = (grade_level or "").lower()

    for word, number in WORDS.items():
        if word in text:
            return number

    match = re.search(r"\b(9|10|11|12)(?:th)?\b", text)
    return int(match.group(1)) if match else None


def remaining_grades(grade: int | None) -> list[int]:
    return list(range(grade, 13)) if grade else [9, 10, 11, 12]


def stage_for(grade_level: str | None) -> dict | None:
    grade = grade_number(grade_level)
    return {"grade": grade, **STAGES[grade]} if grade else None


def stage_text(grade_level: str | None, today: date | None = None) -> str:
    """The stage guidance for a prompt, including the current month."""

    # Month and year, so the model never guesses an old year.
    month = (today or date.today()).strftime("%B %Y")
    stage = stage_for(grade_level)

    if stage is None:
        return (
            f"It is {month}. The student's grade is unknown: make steps that work in any "
            "high school grade, and include finding out their grade's priorities with "
            "their school counselor."
        )

    priorities = "; ".join(stage["priorities"])
    return (
        f"It is {month}, and the student is in grade {stage['grade']}: the "
        f"\"{stage['name']}\" stage. {stage['goal']} Focus on: {priorities}. "
        "Steps must fit this grade and this time of year; don't push later-grade tasks early."
    )
