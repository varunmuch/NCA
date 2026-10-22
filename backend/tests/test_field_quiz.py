"""
The focused quiz: a student with a goal is only asked about, and only
matched to, careers in that goal's field. No database or model needed.
"""

import pytest
from fastapi import HTTPException

from app.services import career_catalog, field_quiz


@pytest.fixture
def activities(monkeypatch):
    """Four stand-in activities per career, so tests don't need the model."""

    def items_for(slug):
        return [{"id": f"{slug}:{index}", "text": f"{slug} activity {index}", "task": "t"} for index in range(4)]

    monkeypatch.setattr(field_quiz, "items_for", items_for)


PROFILE = {"career_aspiration": "software developer", "career_status": "have_goal"}


def test_the_field_is_the_goal_and_its_closest_careers_in_the_same_family(activities):
    field = field_quiz.field_for("software-developers")

    assert field[0]["slug"] == "software-developers"
    assert 2 <= len(field) <= field_quiz.FIELD_SIZE
    assert {career["family"] for career in field} == {"technology"}


def test_the_goal_is_found_by_title_alias_or_search():
    assert field_quiz.anchor_for(PROFILE) == "software-developers"
    assert field_quiz.anchor_for({"career_aspiration": "nurse"}) == "registered-nurses"
    assert field_quiz.anchor_for({}) is None


def test_every_question_is_about_a_career_in_the_field(activities):
    asked = field_quiz.questions(PROFILE, "software-developers")
    in_field = {career["slug"] for career in field_quiz.field_for("software-developers")}

    assert asked["mode"] == "field"
    assert {item["id"].rsplit(":", 1)[0] for item in asked["activities"]["items"]} <= in_field
    assert len(asked["activities"]["items"]) == field_quiz.RATED_PER_CAREER * len(in_field)
    assert all({part for part in item["id"].split(":")[1:]} <= in_field for item in asked["tradeoffs"])
    assert len(asked["tradeoffs"]) <= field_quiz.MAX_TRADEOFFS


def answers_liking(target: str, asked: dict) -> dict:
    return {
        "activities": {item["id"]: 5 if item["id"].startswith(target + ":") else 2 for item in asked["activities"]["items"]},
        "tradeoffs": {
            item["id"]: "a" if item["id"].split(":")[1] == target else "b" if item["id"].split(":")[2] == target else "a"
            for item in asked["tradeoffs"]
        },
        "training": "four_year",
    }


def test_results_rank_only_field_careers_and_follow_the_answers(activities):
    asked = field_quiz.questions(PROFILE, "software-developers")
    saved = field_quiz.score(PROFILE, "software-developers", answers_liking("data-scientists", asked))

    assert set(saved["scores"]) == set(saved["field"])
    assert max(saved["scores"], key=saved["scores"].get) == "data-scientists"
    assert saved["liked"]["data-scientists"]


def test_incomplete_answers_are_refused(activities):
    asked = field_quiz.questions(PROFILE, "software-developers")
    answers = answers_liking("data-scientists", asked)
    answers["activities"].popitem()

    with pytest.raises(HTTPException):
        field_quiz.score(PROFILE, "software-developers", answers)


def test_results_carry_official_pay_and_mark_the_goal(activities):
    asked = field_quiz.questions(PROFILE, "software-developers")
    saved = field_quiz.score(PROFILE, "software-developers", answers_liking("software-developers", asked))
    result = field_quiz.result_payload({**PROFILE, "field_quiz": saved})

    top = result["careers"][0]
    real = career_catalog.career_facts("software-developers")["wages"]["national"]["annual_median"]

    assert top["slug"] == "software-developers" and top["is_goal"]
    assert top["pay_median"] == real
    assert all(career["family_label"] == "Technology & Computing" for career in result["careers"])
