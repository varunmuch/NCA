"""
Giving careers students name a page, from official data. No network: the
CareerOneStop response is a saved fixture and the store is temporary.
"""

import asyncio
import copy
import json
from pathlib import Path

import pytest

from app.services import career_catalog, career_expansion as expansion, field_quiz


DETAIL = json.loads((Path(__file__).parent / "fixtures" / "careeronestop_zoologists.json").read_text())["OccupationDetail"][0]
BASE = 87


@pytest.fixture
def store(tmp_path, monkeypatch):
    """A temporary added-careers store and a scripted CareerOneStop."""

    monkeypatch.setattr(career_catalog, "ADDED_PATH", tmp_path / "added.json")
    monkeypatch.setattr(field_quiz, "ADDED_ITEMS_PATH", tmp_path / "items.json")
    career_catalog.reload_catalog()
    looked_up = []

    async def details(code):
        looked_up.append(code)
        detail = copy.deepcopy(DETAIL)
        detail.update(OnetCode=code, OnetTitle="Dental Hygienists", AlternateTitles=["Dental Hygienist"])
        return detail

    async def items(entry):
        return None

    monkeypatch.setattr(expansion.careeronestop, "details", details)
    monkeypatch.setattr(field_quiz, "ensure_items", items)
    monkeypatch.setattr(expansion, "_bls_typical_education", lambda soc: "Associate's degree")
    monkeypatch.setattr(expansion, "_facts_for", lambda entry: {"soc": entry["onet_code"][:7], "wages": {"national": {"annual_median": 1.0}, "florida": None}, "outlook": None, "education": None, "ap_courses": [], "learning": [], "licenses": []})

    yield looked_up
    career_catalog.reload_catalog()


def run(phrase):
    return asyncio.run(expansion.ensure_career(phrase))


def test_phrases_are_cleaned_and_screened():
    assert expansion.clean_phrase("I want to be a Marine Biologist!") == "marine biologist"
    assert expansion.looks_like_a_job("ai engineer")
    assert not expansion.looks_like_a_job("i really really really want to do something with my whole life")


def test_validation_uses_official_onet_job_titles():
    assert career_catalog.official_titles("AI Engineer")[0]["code"] == "15-1221.00"
    assert career_catalog.official_titles("ai engineers")[0]["title"] == "AI Engineer"
    assert career_catalog.official_titles("unicorn wrangler") == []


def test_careers_we_have_need_no_lookup(store):
    assert run("pharmacists") == {"result": "existing", "slug": "pharmacists"}
    assert store == []


def test_an_official_title_gets_its_own_page_on_its_occupations_data(store):
    result = run("I want to become an AI Engineer")
    page = career_catalog.get_career(result["slug"])
    parent = career_catalog.get_career("computer-and-information-research-scientists")

    assert result["result"] == "added" and page["title"] == "AI Engineer"
    assert page["variant_of"] == parent["slug"] and page["onet_code"] == parent["onet_code"]
    assert "AI Engineer is a job title within Computer and Information Research Scientists" in page["official_note"]
    # Its facts, search, names in chat, and no duplicate on the next ask.
    assert career_catalog.career_facts(page["slug"]) == career_catalog.career_facts(parent["slug"])
    assert career_catalog.search_careers(query="ai engineer")["careers"][0]["slug"] == page["slug"]
    assert career_catalog.named_careers("could I be an AI engineer?") == [page["slug"]]
    assert run("ai engineer") == {"result": "existing", "slug": page["slug"]}
    # The occupation lookup isn't by the page, so the real occupation stays the code's career.
    assert career_catalog.load_catalog()["by_code"][parent["onet_code"]]["slug"] == parent["slug"]
    assert len(career_catalog.load_catalog()["careers"]) == BASE + 1 and store == []


def test_a_page_asks_its_occupations_quiz_questions(store):
    slug = run("AI engineer")["slug"]
    items = field_quiz.items_for(slug)

    assert items and all(item["id"].startswith(slug + ":") for item in items)
    field = [career["slug"] for career in field_quiz.field_for(slug)]
    assert field[0] == slug and "computer-and-information-research-scientists" not in field


def test_a_new_occupation_is_added_with_everything(store):
    result = run("dental hygienist")
    career = career_catalog.get_career(result["slug"])

    assert result == {"result": "added", "slug": "dental-hygienists"}
    assert store == ["29-1292.00"]
    assert career["family"] == "health" and career["job_zone"] == 3
    assert career["tasks"] and career["subjects"] and career["source_url"].endswith("29-1292.00")
    assert career_catalog.career_facts("dental-hygienists")["wages"]["national"]["annual_median"] == 1.0
    assert run("dental hygienists")["result"] == "existing"


def test_unofficial_titles_add_nothing(store):
    assert run("unicorn wrangler") == {"result": "rejected", "reason": "not an official job title"}
    assert len(career_catalog.load_catalog()["careers"]) == BASE and store == []


def test_additions_are_capped_per_day(store, monkeypatch):
    monkeypatch.setattr(expansion, "MAX_ADDITIONS_PER_DAY", 0)

    assert run("dental hygienist") == {"result": "rejected", "reason": "daily limit"}
    # A page within an occupation we have falls back to that occupation.
    assert run("AI engineer") == {"result": "alias", "slug": "computer-and-information-research-scientists"}
