import asyncio

from app.services import pathways, plan_service
from app.services.text_clean import clean_paragraph


def _found():
    return {
        "slug": "software-developers",
        "code": "15-1252.00",
        "courses": ["AP Computer Science A", "Algebra 2", "Dual enrollment at Valencia College"],
        "majors": [{"cip": "11.0701", "title": "Computer Science", "florida_colleges": 30}],
        "colleges": [
            {"id": "1", "name": "University of Central Florida", "city": "Orlando", "kind": "4-year", "ownership": "Public", "net_price": 11516, "graduation_rate": 78, "central_florida": True, "programs": []},
            {"id": "2", "name": "Florida Institute of Technology", "city": "Melbourne", "kind": "4-year", "ownership": "Private nonprofit", "net_price": 36511, "graduation_rate": 62, "central_florida": True, "programs": []},
            {"id": "3", "name": "Valencia College", "city": "Orlando", "kind": "2-year", "ownership": "Public", "net_price": 6000, "graduation_rate": 50, "central_florida": True, "programs": []},
        ],
        "certifications": [{"id": "C1", "name": "IT Specialist - Software Development", "organization": "Pearson", "url": "", "description": "", "beginner_friendly": True, "exam_required": True}],
    }


def test_schema_only_allows_listed_choices():
    schema = pathways.schema(_found())
    props = schema["properties"]

    assert props["courses"]["items"]["properties"]["course"]["enum"] == _found()["courses"]
    assert props["colleges"]["items"]["properties"]["id"]["enum"] == ["1", "2", "3"]
    assert props["certifications"]["items"]["properties"]["id"]["enum"] == ["C1"]
    assert props["majors"]["items"]["properties"]["cip"]["enum"] == ["11.0701"]


def test_unknown_and_repeated_picks_are_dropped_and_details_come_from_code():
    raw = {
        "summary": "Start with **math**.",
        "courses": [
            {"course": "AP Computer Science A", "grade": "11th grade", "why": "You like coding."},
            {"course": "Underwater Basket Weaving", "grade": "9th grade", "why": "x"},
        ],
        "majors": [{"cip": "11.0701", "why": "Direct path."}, {"cip": "11.0701", "why": "Again."}],
        "colleges": [{"id": "1", "why": "University of Central Florida is near NeoCity."}, {"id": "99", "why": "Fake."}],
        "certifications": [{"id": "C1", "why": "No degree needed."}],
    }
    path = pathways.attach(raw, _found(), clean_paragraph)

    assert path["summary"] == "Start with math."
    assert [course["course"] for course in path["courses"]] == ["AP Computer Science A"]
    assert path["courses"][0]["kind"] == "AP"
    assert len(path["majors"]) == 1
    assert path["colleges"][0]["net_price"] == 11516
    assert path["certifications"][0]["organization"] == "Pearson"


def test_state_college_route_is_always_included():
    raw = {"summary": "", "colleges": [{"id": "1", "why": "University of Central Florida is close."}]}
    path = pathways.attach(raw, _found(), clean_paragraph)

    assert [college["name"] for college in path["colleges"]] == ["University of Central Florida", "Valencia College"]
    assert path["colleges"][1]["why"] == pathways.TRANSFER_REASON


def test_reason_about_a_different_college_is_dropped():
    raw = {"summary": "", "colleges": [{"id": "1", "why": "Florida Institute of Technology is in Melbourne."}]}
    path = pathways.attach(raw, _found(), clean_paragraph)

    assert path["colleges"][0]["name"] == "University of Central Florida"
    assert path["colleges"][0]["why"] == ""


def test_unbacked_praise_is_removed():
    raw = {"summary": "", "colleges": [{"id": "1", "why": "University of Central Florida is a top-tier school. It is in Orlando."}]}
    path = pathways.attach(raw, _found(), clean_paragraph)

    assert path["colleges"][0]["why"] == "It is in Orlando."


def test_foreign_script_sentence_is_removed():
    assert clean_paragraph("You can start here. It prepares you for the职业.") == "You can start here."


def test_education_survey_shows_bachelors_route_for_ai_engineers():
    survey = pathways.education_survey("15-1221.00")

    levels = {item["level"]: item["percent"] for item in survey["levels"]}
    assert levels["Bachelor's degree"] == 36
    assert survey["small_sample"] is True


def test_colleges_are_florida_public_or_nonprofit_with_matching_programs():
    found = pathways.colleges("15-1252.00")

    assert found, "expected Florida colleges for software developers"
    assert all(college["ownership"] in {"Public", "Private nonprofit"} for college in found)
    assert all(college["programs"] for college in found)
    assert any(college["kind"] == "2-year" for college in found)
    # Public, nearby schools rank first.
    assert found[0]["ownership"] == "Public"


def test_certifications_come_from_the_built_file():
    certs = asyncio.run(pathways.certifications("15-1252.00"))

    assert certs and all(cert["name"] and cert["organization"] for cert in certs)
    assert certs[0]["beginner_friendly"] is True


def test_goal_career_is_the_pathway_focus():
    content = {"careers": [{"slug": "video-game-designers"}]}

    assert plan_service._focus_career(content, "I want to be a software developer") == "software-developers"
    assert plan_service._focus_career(content, "") == "video-game-designers"


def test_majors_are_grouped_by_the_field_colleges_report():
    found = pathways.majors("15-1221.00")
    general = next(major for major in found if major["cip"] == "11.01")

    # Artificial Intelligence is a specialty inside the general field, not a
    # separate major offered at every one of those colleges.
    assert general["title"] == "Computer and Information Sciences, General"
    assert "Artificial Intelligence" in general["includes"]
    assert len({major["cip"] for major in found}) == len(found)


def test_bachelors_programs_are_listed_first():
    for college in pathways.colleges("15-1252.00"):
        credentials = [program["credential"] for program in college["programs"]]
        order = [pathways.CREDENTIAL_ORDER.index(credential) for credential in credentials]
        assert order == sorted(order)


def test_plan_title_never_ends_mid_word():
    title = plan_service._whole_words("Your Personal Career Plan for 10th Grade: Exploring AI Engineering and Related Skills", 70)

    assert title == "Your Personal Career Plan for 10th Grade: Exploring AI Engineering"


def test_plan_careers_stay_in_the_goal_field_and_are_filled():
    from app.services import field_quiz

    field = field_quiz.goal_field_slugs("software-developers")

    assert "software-developers" in field
    assert "bioengineers-and-biomedical-engineers" not in field
    assert len(field_quiz.field_for("software-developers")) >= 3
