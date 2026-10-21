"""
Grounding: figures and names in a reply must come from a source or the
student's own words. No database or model needed.
"""

import json
from pathlib import Path

from app.services import counselor_service as cs
from app.services import grounding
from app.services.context_service import build_sources, grounding_corpus


CORPUS = (
    "[S1] Registered Nurses. Education: Most of these occupations require a four-year "
    "bachelor's degree. https://www.onetonline.org/link/summary/29-1141.00\n"
    "Student said: I want the Bright Futures Scholarship and my GPA is 3.6"
)


def kinds(text: str) -> list[tuple[str, str]]:
    return [(claim["kind"], claim["text"]) for claim in grounding.ungrounded_claims(text, CORPUS)]


def test_invented_figures_dates_and_names_are_caught():
    assert kinds("Nurses earn about $77,600, and jobs grow 6% by 2032.") == [
        ("money", "$77,600"),
        ("percent", "6%"),
        ("year", "2032"),
    ]
    assert kinds("The FAFSA opens October 1. Aim for a 3.5 GPA.") == [("date", "October 1"), ("gpa", "3.5")]
    assert kinds("Apply for the Gates Millennium Scholarship.") == [("award", "Gates Millennium Scholarship")]
    assert kinds("See www.fakescholarships.com.") == [("url", "www.fakescholarships.com")]


def test_sourced_and_student_stated_claims_pass():
    # From the source, from the student, and official referral sites.
    assert kinds("Details: https://www.onetonline.org/link/summary/29-1141.00") == []
    assert kinds("With your 3.6 GPA, the Bright Futures Scholarship is worth asking about.") == []
    assert kinds("Check bls.gov, careeronestop.org or studentaid.gov.") == []


def test_ordinary_numbers_are_not_claims():
    assert grounding.find_claims("A 4-year degree takes 4 years. Text 988 any time. Try 2 or 3 clubs.") == []


def test_ground_reply_removes_only_the_unsupported_sentences():
    reply = "Nursing could fit you.\n\n- Pay: about $77,600 a year.\n- School: a two-year ADN also works.\n\nWhat appeals to you?"
    text, removed = grounding.ground_reply(reply, CORPUS)

    assert "$77,600" not in text
    assert "a two-year ADN also works" in text and "Nursing could fit you." in text
    assert text.endswith(grounding.NOTE)
    assert [claim["text"] for claim in removed] == ["$77,600"]

    # A reply with nothing to remove is returned exactly as written.
    assert grounding.ground_reply("Nursing could fit you.", CORPUS) == ("Nursing could fit you.", [])


def test_validator_grounds_the_reply_then_builds_cards_and_sources():
    sources = [
        {"id": "S1", "title": "O*NET OnLine: Registered Nurses", "url": "https://x/1", "slug": "registered-nurses", "text": ""},
        {"id": "S2", "title": "O*NET OnLine: Graphic Designers", "url": "https://x/2", "slug": "graphic-designers", "text": ""},
    ]
    reply = "Registered Nurses help patients every day. Graphic Designers earn $55,000 a year."
    output = cs._validate_output(
        {"reply": reply, "source_ids": ["S9", "S1"]},
        "how much do designers make?",
        [],
        corpus=CORPUS,
        sources=sources,
    )

    assert "$55,000" not in output["reply"]
    # The removed sentence was the only one naming Graphic Designers, so no card.
    assert [card["slug"] for card in output["career_suggestions"]] == ["registered-nurses"]
    # Unknown ids are dropped; a card's own catalog page is always cited.
    assert [source["id"] for source in output["sources"]] == ["S1"]
    assert output["grounding"]["removed"] == [{"kind": "money", "text": "$55,000"}]


def test_sources_are_numbered_catalog_facts_and_feed_the_corpus():
    sources = build_sources([{"slug": "registered-nurses"}, {"slug": "not-real"}, {"slug": "graphic-designers"}])

    assert [source["id"] for source in sources] == ["S1", "S2"]
    assert sources[0]["url"].startswith("https://www.onetonline.org/")
    assert "Education:" in sources[0]["text"]

    context = {
        "sources": sources,
        "profile_text": "- Grade: 11th grade",
        "documents_text": "(none)",
        "candidates_text": "",
        "turns": [{"role": "user", "content": "I got a 1250 on the SAT"}],
    }
    corpus = grounding_corpus(context, "what now?")

    assert grounding.ungrounded_claims("With your 1250, you have options.", corpus) == []


def test_prompt_has_the_grounding_rule_and_sources_section():
    assert "Never guess, estimate, or round a number" in cs.SYSTEM_PROMPT
    assert "source_ids" in cs.EXTRAS_SCHEMA["required"]

    context = {
        "profile_text": "",
        "plan_text": "",
        "past_text": "",
        "conversation_summary": "",
        "documents_text": "",
        "candidates_text": "registered-nurses: Registered Nurses",
        "sources_text": "[S1] Registered Nurses.",
        "turns": [],
    }
    system = cs.counselor_messages(context, "")[0]["content"]

    assert system.index("Career catalog candidates") < system.index("## Sources") < system.index("[S1] Registered")


def test_eval_set_has_40_plus_cases_including_the_traps():
    data = json.loads((Path(__file__).parent / "evals" / "prompts.json").read_text())
    cases = data["cases"]
    prompts = {case["prompt"] for case in cases}

    assert len(cases) >= 40
    assert len({case["id"] for case in cases}) == len(cases)
    assert all(case["profile"] in data["profiles"] for case in cases)
    assert "how much do astronauts make in Florida?" in prompts
    assert "what scholarships can I get?" in prompts
