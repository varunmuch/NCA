"""
Phase 5: grade-aware, simpler plans. No database or model needed.
"""

from datetime import date

from app.services import career_catalog, plan_service, plan_stages
from app.services.plan_pdf import render_plan_pdf


def test_grade_numbers_and_stages():
    assert plan_stages.grade_number("10th grade") == 10
    assert plan_stages.grade_number("Grade 9") == 9
    assert plan_stages.grade_number("junior") == 11
    assert plan_stages.grade_number("I'm a senior") == 12
    assert plan_stages.grade_number("") is None
    assert plan_stages.grade_number("8th grade") is None

    assert plan_stages.stage_for("9th grade")["name"] == "Explore"
    assert plan_stages.stage_for("12th grade")["name"] == "Decide and apply"
    assert plan_stages.remaining_grades(11) == [11, 12]


def test_stage_text_fits_grade_and_month():
    senior = plan_stages.stage_text("12th grade", date(2026, 10, 21))

    assert "It is October" in senior and "FAFSA" in senior and "backup path" in senior
    assert "club" in plan_stages.stage_text("9th grade", date(2026, 10, 21))
    assert "grade is unknown" in plan_stages.stage_text("", date(2026, 10, 21))


RAW = {
    "title": "Exploring healthcare",
    "career_goal": "nurse",
    "summary": "You like helping people and biology, so healthcare is worth exploring.",
    "next_steps": [
        {"title": "Ask your counselor about anatomy class", "why": "You like biology."},
        {"title": "Volunteer one Saturday at a care home", "why": "You like helping people."},
        {"title": "Watch a day-in-the-life video of a nurse", "why": "See the job up close."},
        {"title": "A fourth step", "why": "Too many."},
    ],
    "careers": [
        {"slug": "registered-nurses", "why": "You like helping people.", "pay_median": 1},
        {"slug": "not-a-career", "why": "Invented."},
        {"slug": "registered-nurses", "why": "Duplicate."},
        {"slug": "physical-therapists", "why": "You like movement."},
        {"slug": "pharmacists", "why": "You like chemistry."},
        {"slug": "dentists-general", "why": "One too many."},
    ],
    "this_year": [{"period": "This fall", "steps": ["Join a health club.", "Nurses earn $200,000 a year."]}],
    "high_school": [{"grade": "Grade 11", "focus": "Take biology and chemistry."}],
    "after_high_school": [{"route": "Community college", "description": "An associate degree in nursing is one way in."}],
    "skills": [{"skill": "Communication", "how": "Practice by volunteering."}],
    "based_on": "Your profile.",
}


def test_clean_content_enforces_limits_and_attaches_official_facts():
    content = plan_service._clean_content(RAW, "11th grade", "")

    assert content["schema"] == 2
    assert len(content["next_steps"]) == 3
    assert content["next_three_actions"] == [step["title"] for step in content["next_steps"]]

    slugs = [card["slug"] for card in content["careers"]]
    # Unknown and duplicate careers dropped; at most 3.
    assert slugs == ["registered-nurses", "physical-therapists", "pharmacists"]

    nurse = content["careers"][0]
    real = career_catalog.career_facts("registered-nurses")["wages"]["national"]["annual_median"]
    # Pay comes from BLS data, never from what the model wrote.
    assert nurse["pay_median"] == real
    assert nurse["education"] and nurse["pay_source"].startswith("BLS")

    assert content["stage"]["name"] == "Prepare"
    assert content["career_direction"] == content["summary"]


def test_plan_text_is_grounded():
    content = plan_service._clean_content(RAW, "11th grade", "")

    assert content["this_year"][0]["steps"] == ["Join a health club."]
    assert {"kind": "money", "text": "$200,000"} in content["grounding"]["removed"]


def test_both_plan_formats_render_to_pdf():
    simple = plan_service._clean_content(RAW, "11th grade", "")
    legacy = {
        "career_direction": "Explore.",
        "next_three_actions": ["One", "Two", "Three"],
        "careers_exploring": [{"slug": "", "title": "Nurse", "why": "x"}],
    }

    for content in (simple, legacy):
        pdf = render_plan_pdf({"title": "Plan", "content": content, "version": 1, "created_at": None}, "Sam", {})
        assert pdf.startswith(b"%PDF-")


def test_schema_asks_for_exactly_three_steps_and_at_most_three_careers():
    properties = plan_service.PLAN_SCHEMA["properties"]

    assert properties["next_steps"]["minItems"] == properties["next_steps"]["maxItems"] == 3
    assert properties["careers"]["maxItems"] == 3
    assert "never write pay" in plan_service.PLAN_PROMPT
