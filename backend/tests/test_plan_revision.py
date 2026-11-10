"""Revise with AI: preferences need the student's words; changes are listed by part."""

from app.services import plan_revision as pr


def test_diff_lists_added_and_removed_by_part():
    old = {"next_steps": [{"title": "A"}], "pathway": {"colleges": [{"name": "UCF"}, {"name": "UF"}], "courses": []}}
    new = {"next_steps": [{"title": "A"}], "pathway": {"colleges": [{"name": "UCF"}, {"name": "Valencia College"}], "courses": [{"course": "AP Physics 1", "grade": "11th grade"}]}}

    assert pr.diff(old, new) == [
        {"part": "Classes", "added": ["AP Physics 1 (11th grade)"], "removed": []},
        {"part": "Colleges", "added": ["Valencia College"], "removed": ["UF"]},
    ]


def test_untouched_parts_are_kept():
    old = {"next_steps": [{"title": "Old step"}], "skills": ["x"], "pathway": {"career_slug": "a", "colleges": [{"name": "UCF"}], "courses": [{"course": "AP Statistics", "grade": "11th grade"}]}}
    new = {"next_steps": [{"title": "New step"}], "skills": ["y"], "pathway": {"career_slug": "a", "colleges": [{"name": "USF"}], "courses": [{"course": "AP Biology", "grade": "11th grade"}]}}

    pr.keep_untouched(new, old, ["colleges"])

    assert new["next_steps"] == [{"title": "Old step"}]
    assert new["skills"] == ["x"]
    assert new["pathway"]["colleges"] == [{"name": "USF"}]
    assert new["pathway"]["courses"] == [{"course": "AP Statistics", "grade": "11th grade"}]


def test_college_names_match_acronyms_and_words():
    assert pr._matches("University of Central Florida", ["UCF"])
    assert pr._matches("Valencia College", ["valencia"])
    assert not pr._matches("University of Florida", ["USF"])


def test_cheaper_colleges_are_steered_in_code():
    found = {
        "colleges": [
            {"id": "1", "name": "Pricey U", "net_price": 30000, "ownership": "Private nonprofit", "kind": "4-year", "central_florida": False},
            {"id": "2", "name": "Mid U", "net_price": 12000, "ownership": "Public", "kind": "4-year", "central_florida": True},
            {"id": "3", "name": "Cheap U", "net_price": 6000, "ownership": "Public", "kind": "4-year", "central_florida": True},
            {"id": "4", "name": "State C", "net_price": 4000, "ownership": "Public", "kind": "2-year", "central_florida": True},
        ]
    }
    previous = [{"net_price": 30000}, {"net_price": 12000}]
    prefs = {"cost": "lower", "location": "", "selectivity": "", "kind": "", "add": [], "remove": []}

    notes = pr.steer_colleges(found, prefs, {}, previous, [])

    assert [college["name"] for college in found["colleges"]] == ["State C", "Cheap U", "Mid U"]
    assert notes == ["lower average cost after aid"]


def test_steps_link_to_the_opportunity_they_name():
    from app.services.plan_service import _attach_opportunities

    opportunities = [
        {"id": "hack-club", "title": "Hack Club", "url": "https://hackclub.com", "description": "", "section_label": "Programs"},
        {"id": "hack-club-hackathons", "title": "High school hackathons (Hack Club directory)", "url": "https://hackathons.hackclub.com", "description": "", "section_label": "Programs"},
    ]
    content = {
        "next_steps": [{"title": "Join Hack Club", "how": "", "resource": "hack-club"}],
        "this_year": [{"period": "Spring", "steps": [{"text": "Find one on the High school hackathons list", "how": "", "resource": ""}, {"text": "Read a book", "how": "", "resource": "made-up"}]}],
    }

    _attach_opportunities(content, opportunities)

    assert content["next_steps"][0]["resource"]["url"] == "https://hackclub.com"
    assert content["this_year"][0]["steps"][0]["resource"]["id"] == "hack-club-hackathons"
    assert content["this_year"][0]["steps"][1]["resource"] is None


def test_major_minor_sets_without_the_model():
    from app.services.major_agent import _sets_from_rankings

    cs = {"cip4": "1107", "title": "Computer Science"}
    data = {"cip4": "3070", "title": "Data Science"}
    math = {"cip4": "2701", "title": "Mathematics"}
    record = {"riasec": {"code": "IRA"}, "academics": {"strong_areas": ["Math"]}, "intended_major": "computer science"}

    result = _sets_from_rankings(record, [data, cs], [math, data, cs], preferred=cs)

    assert [option["major"] for option in result["options"]] == ["1107", "3070"]
    assert result["options"][0]["minor"] == "2701"
    assert result["options"][0]["why_major"] == "You told us you want to study computer science."
    # A minor never repeats its own major.
    assert all(option["major"] != option["minor"] for option in result["options"])
