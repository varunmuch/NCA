"""
Fast tests for logic that has bitten us before. No database or model
needed: run with `.venv/bin/python -m pytest` from backend/.
"""

import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core import llm
from app.services import career_catalog, interest_quiz, roadmap_service
from app.services.account_service import _hash, session_revoked
from app.services.document_service import _clean_text


# ------------------------------------------------------------- documents


def test_pdf_tabs_and_control_characters_are_cleaned():
    assert _clean_text("L\tinux\x00 and\x0c  Slurm") == "L inux and Slurm"


def test_model_json_with_raw_tab_parses(monkeypatch):
    # The resume bug: the model copied a raw tab into a JSON string.
    async def fake_completion(*args, **kwargs):
        return '{"skills": ["Git, \tLinux"]}'

    monkeypatch.setattr(llm, "chat_completion", fake_completion)

    import asyncio

    result = asyncio.run(llm.chat_json([], schema={}, schema_name="t", max_tokens=10))
    assert result == {"skills": ["Git, \tLinux"]}


# ---------------------------------------------------------- interest quiz


def _answers(high: set[str], **extra) -> dict:
    """Love every activity of the `high` types and pick them in trade-offs."""

    tradeoffs = {}

    for qid, first, second, _, _ in interest_quiz.TRADEOFFS:
        tradeoffs[qid] = "b" if second in high and first not in high else "a"

    return {
        "activities": {qid: 5 if kind in high else 1 for qid, kind, _ in interest_quiz.ACTIVITIES},
        "tradeoffs": tradeoffs,
        **extra,
    }


def test_quiz_covers_every_type_evenly():
    counts: dict[str, int] = {}

    for _, kind, _ in interest_quiz.ACTIVITIES:
        counts[kind] = counts.get(kind, 0) + 1

    assert counts == {kind: 4 for kind in interest_quiz.TYPES}

    # Every pair of types is traded off exactly once.
    pairs = {frozenset((first, second)) for _, first, second, _, _ in interest_quiz.TRADEOFFS}
    assert len(interest_quiz.TRADEOFFS) == len(pairs) == 15


def test_quiz_scores_range_and_top_types():
    scores, details = interest_quiz.score(_answers({"Social", "Artistic"}))

    assert all(0 <= value <= 100 for value in scores.values())
    assert scores["Realistic"] < 30
    assert set(interest_quiz.top_types(scores, 2)) == {"Social", "Artistic"}
    assert details["training"] == "unsure"


def test_quiz_rejects_missing_or_out_of_range_answers():
    answers = _answers(set())
    answers["activities"].pop("r1")

    with pytest.raises(HTTPException):
        interest_quiz.score(answers)

    answers = _answers(set())
    answers["activities"]["r1"] = 9

    with pytest.raises(HTTPException):
        interest_quiz.score(answers)

    answers = _answers(set())
    answers["tradeoffs"]["t_ri"] = "both"

    with pytest.raises(HTTPException):
        interest_quiz.score(answers)


def test_quiz_matches_follow_interests():
    scores, details = interest_quiz.score(_answers({"Investigative", "Realistic"}))
    top = interest_quiz.match_careers(scores, details, limit=5)

    assert top
    assert all(set(career["interests"][:2]) & {"Investigative", "Realistic"} for career in top)


def test_quiz_preferences_lift_matching_careers():
    answers = _answers({"Investigative", "Social"}, settings=["health"], training="graduate")
    scores, details = interest_quiz.score(answers)
    top = interest_quiz.match_careers(scores, details, limit=5)

    assert top[0]["family"] == "health"
    assert top[0]["match_parts"]["setting"] == 100


def test_quiz_profile_shape_flags_opposite_top_types():
    scores = {"Realistic": 90, "Social": 85, "Investigative": 20, "Artistic": 20, "Enterprising": 20, "Conventional": 20}
    keys = {note["key"]: note["title"] for note in interest_quiz.profile_shape(scores)}

    assert keys["consistency"] == "An unusual mix"


# --------------------------------------------------------------- search


def test_search_ranks_title_matches_first():
    results = career_catalog.search_careers(query="nurse")["careers"]

    assert results[0]["title"] == "Registered Nurses"


def test_search_corrects_typos_and_understands_everyday_words():
    found = career_catalog.search_careers(query="vetrinarian")

    assert found["suggestion"] == "veterinarian"
    assert found["careers"][0]["slug"] == "veterinarians"

    animals = [career["slug"] for career in career_catalog.search_careers(query="animals")["careers"][:3]]
    assert "veterinarians" in animals


def test_search_respects_filters_and_explains_matches():
    found = career_catalog.search_careers(query="design", family="arts")["careers"]

    assert found and all(career["family"] == "arts" for career in found)
    assert all("match_hint" in career for career in found)


# ------------------------------------------------------------- roadmaps


def test_roadmap_ladder_is_ordered_and_links_are_built():
    resources = roadmap_service.curated_resources("technology")
    raw = {
        "ladder": {
            "five_years_out": {"goal": "Work as a developer", "steps": ["Apply"]},
            "next_2_weeks": {"goal": "Start", "steps": [" Try CS50 ", ""]},
        },
        "online_learning": [{"topic": "Python", "provider": "Khan Academy", "search": "intro python", "why": ""}],
        "picked_resources": [{"id": "cs50", "why": "a"}, {"id": "cs50", "why": "dup"}, {"id": "made-up", "why": "x"}],
    }

    content = roadmap_service._clean(raw, resources)

    assert [rung["horizon"] for rung in content["ladder"]] == ["Next 2 weeks", "5+ years out"]
    assert content["ladder"][0]["steps"] == ["Try CS50"]
    assert content["online_learning"][0]["url"].startswith("https://www.khanacademy.org/search?")
    assert [item["id"] for item in content["picked_resources"]] == ["cs50"]


def test_curated_resource_ids_are_unique_and_https():
    data = json.loads(roadmap_service.RESOURCES_PATH.read_text())
    items = data["general"] + [item for family in data["families"].values() for item in family]
    ids = [item["id"] for item in items]

    assert len(ids) == len(set(ids))
    assert all(item["url"].startswith("https://") for item in items)


# --------------------------------------------------------------- accounts


def test_session_revoked_only_for_sessions_before_password_change():
    changed = datetime.now(timezone.utc)
    credential = SimpleNamespace(password_changed_at=changed)

    assert session_revoked(SimpleNamespace(password_changed_at=None), None) is False
    assert session_revoked(credential, None) is True
    assert session_revoked(credential, int((changed - timedelta(hours=1)).timestamp())) is True
    assert session_revoked(credential, int((changed + timedelta(seconds=10)).timestamp())) is False


def test_tokens_are_stored_hashed():
    assert _hash("abc") != "abc" and len(_hash("abc")) == 64
