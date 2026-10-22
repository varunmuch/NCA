from app.services import document_review as review


def test_course_matching_handles_names_and_levels():
    taken = ["AP Comp Sci Principles", "Algebra II Honors", "Biology 1", "Pre-Calculus"]

    assert review.course_taken("AP Computer Science Principles", taken) == "AP Comp Sci Principles"
    assert review.course_taken("Algebra 2", taken) == "Algebra II Honors"
    assert review.course_taken("Precalculus", taken) == "Pre-Calculus"
    assert review.course_taken("AP Calculus AB", taken) is None


def test_ap_course_needs_an_ap_course_on_the_transcript():
    assert review.course_taken("AP Biology", ["Biology 1"]) is None
    assert review.course_taken("AP Biology", ["AP Biology"]) == "AP Biology"


def test_transcript_comparison_for_software_developers():
    extraction = {
        "courses_completed": [{"name": "AP Computer Science Principles", "term": "2025", "grade": "A"}, {"name": "Algebra 2", "term": "2025", "grade": "B"}],
        "courses_in_progress": ["AP Precalculus"],
    }
    compared = review.compare_transcript("software-developers", extraction)

    assert "AP Computer Science Principles" in [item["course"] for item in compared["done"]]
    assert "AP Precalculus" in [item["course"] for item in compared["in_progress"]]
    assert "AP Computer Science A" in compared["next_up"]
    assert "AP Computer Science Principles" not in compared["next_up"]


def test_resume_comparison_finds_strengths_and_gaps():
    extraction = {"skills": ["Programming in Python", "Critical thinking"], "projects": ["Built a weather app"], "activities": [], "work_experience": [], "volunteering": [], "awards": []}
    compared = review.compare_resume("software-developers", extraction)

    assert compared["has_projects"] is True
    assert any(item["skill"] == "Programming" for item in compared["strengths"])
    assert compared["gaps"], "some career skills should be missing"


def test_goal_comes_from_profile_before_quiz():
    assert review.goal_slug({"career_aspiration": "software developer"}) == "software-developers"
    assert review.goal_slug({}) is None


def test_course_numbers_matter():
    assert review.course_taken("Algebra 2", ["Algebra 1 Honors"]) is None
    assert review.course_taken("Algebra 2", ["Algebra II"]) == "Algebra II"


def test_unrelated_core_courses_are_not_recommended():
    compared = review.compare_transcript("software-developers", {"courses_completed": [], "courses_in_progress": []})

    assert "Marine Science" not in compared["next_up"]
    assert "Environmental Science" not in compared["next_up"]
    assert "Computer Science" in compared["next_up"]
