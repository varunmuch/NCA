"""The counselor asks for what a question needs, once, and never for what it has."""

from app.services import info_needs as needs

EMPTY = {"tests": {"sat": None, "act": None, "plan": ""}, "service_hours": None, "academics": None, "riasec": None}
FULL = {"tests": {"sat": 1280, "act": None, "plan": ""}, "service_hours": 62, "academics": {"gpa_unweighted": 3.8}, "riasec": {"code": "RIA"}}


def test_chances_need_scores_and_grades():
    asked = needs.needs_for("What are my chances at UF?", EMPTY, set())
    assert asked["keys"] == ["tests", "transcript"]
    assert [field["id"] for field in asked["fields"]] == ["sat", "act"]
    assert asked["links"][0]["href"] == "/profile#documents"
    assert asked["question"].startswith("To estimate your chances, I need your SAT or ACT score")


def test_nothing_is_asked_when_the_record_has_it():
    assert needs.needs_for("What are my chances at UF?", FULL, set()) is None
    assert needs.needs_for("Can I get Bright Futures?", FULL, set()) is None


def test_each_thing_is_asked_once_per_conversation():
    assert needs.needs_for("Which colleges should I apply to?", EMPTY, {"tests", "transcript"}) is None
    assert needs.needs_for("Which colleges should I apply to?", EMPTY, {"tests"})["keys"] == ["transcript"]


def test_a_test_plan_counts_as_an_answer():
    planned = {**EMPTY, "tests": {"sat": None, "act": None, "plan": "SAT or ACT next year"}, "academics": {"gpa_unweighted": 3.5}}
    assert needs.needs_for("What are my chances at USF?", planned, set()) is None


def test_other_questions_ask_nothing():
    assert needs.needs_for("I like drawing and computers", EMPTY, set()) is None


def test_form_answers_become_a_message():
    assert needs.answer_text({"sat": "1310", "service_hours": "40"}) == "I got 1310 on the SAT and I have 40 volunteer hours."
