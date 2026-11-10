from app.services import pathways, school_courses
from app.services.plan_service import replace_counselor_referrals


def test_college_board_names_map_to_the_school_class():
    assert school_courses.name_for("AP Calculus AB") == "AP Calculus AB & BC"
    assert school_courses.name_for("AP English Language and Composition") == "AP English Language"
    assert school_courses.name_for("AP United States Government and Politics") == "AP US Government and Politics"


def test_classes_the_school_does_not_teach_are_not_offered():
    assert school_courses.name_for("AP Computer Science A") is None
    options = pathways.course_options("software-developers")
    assert "AP Computer Science A" not in options
    assert options[0] == "AP Computer Science Principles"


def test_pathway_classes_get_the_school_description():
    courses = school_courses.describe([{"course": "Applied Engineering Technology 1", "grade": "10th grade"}])
    assert courses[0]["description"]
    assert courses[0]["certifications"] == ["AutoCAD", "Fusion 360"]


def test_ask_your_counselor_becomes_a_named_class():
    content = {
        "pathway": {"courses": [
            {"course": "AP Precalculus", "grade": "10th grade", "description": "Functions."},
            {"course": "AP Computer Science Principles", "grade": "10th grade", "description": "Computing."},
        ]},
        "this_year": [{"period": "This fall", "steps": [
            {"text": "Ask your counselor about advanced computer science courses", "how": ""},
            {"text": "Ask your counselor for a letter", "how": ""},
            {"text": "Join Hack Club", "how": ""},
        ]}],
        "next_steps": [],
    }
    replace_counselor_referrals(content)
    texts = [step["text"] for step in content["this_year"][0]["steps"]]
    assert texts == ["Request AP Computer Science Principles in 10th grade when you pick classes", "Join Hack Club"]
