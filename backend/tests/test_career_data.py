"""
Career data from official sources: the refresh script's parsing, the
stored file, and how the counselor and grounding use it. No network.
"""

import io
import json

import openpyxl

from app.services import career_catalog, grounding
from app.services.context_service import build_sources
from scripts import refresh_career_data as refresh


def test_series_ids_follow_the_bls_oews_format():
    assert refresh.soc_of("29-1141.00") == "29-1141"
    # Florida RN annual median, checked against the live API.
    assert refresh.series_id("florida", "29-1141", "13") == "OEUS120000000000029114113"
    assert refresh.series_id("national", "29-1141", "13") == "OEUN000000000000029114113"
    assert all(len(refresh.series_id(area, "15-1252", "11")) == 25 for area in refresh.AREAS)


def _workbook(title: str, header: list[str], rows: list[list]) -> bytes:
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = title
    sheet.append([f"{title} heading"])
    sheet.append(header)

    for row in rows:
        sheet.append(row)

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_projections_and_education_tables_parse():
    projections = _workbook(
        "Table 1.2",
        ["2025 National Employment Matrix title", "2025 National Employment Matrix code", "Occupation type",
         "Employment change, percent, 2025–35", "Occupational openings, 2025–35 annual average"],
        [["Total, all occupations", "00-0000", "Summary", "3.5", "17461.8"],
         ["Registered nurses", "29-1141", "Line item", "5.6", "180.8"]],
    )
    table, total = refresh.parse_projections(projections)

    assert table["29-1141"] == {"growth_percent": 5.6, "openings_per_year": 180800, "period": "2025–35"}
    assert total == {"all_jobs_growth_percent": 3.5, "period": "2025–35"}

    education = _workbook(
        "Table 5.4",
        ["2025 National Employment Matrix title", "2025 National Employment Matrix code",
         "Typical education needed for entry", "Work experience in a related occupation",
         "Typical on-the-job training needed to attain competency"],
        [["Electricians", "47-2111", "High school diploma or equivalent", "None", "Apprenticeship"]],
    )

    assert refresh.parse_education(education)["47-2111"] == {
        "typical_entry": "High school diploma or equivalent",
        "work_experience": "None",
        "training": "Apprenticeship",
    }


def test_stored_career_data_covers_the_catalog_with_dated_sources():
    data = career_catalog.load_career_data()
    slugs = {career["slug"] for career in career_catalog.load_catalog()["careers"]}

    assert set(data["careers"]) == slugs
    assert data["retrieved"]

    for name in ("wages", "outlook", "education", "ap_courses", "learning"):
        assert data["sources"][name]["retrieved"] == data["retrieved"]

    for facts in data["careers"].values():
        for area in ("national", "florida"):
            for value in (facts["wages"][area] or {}).values():
                # Numbers or a list of top-coded fields; never text estimates.
                assert isinstance(value, (int, float, list)) or value is None

        assert all(item["url"].startswith("https://") for item in facts["learning"])


def test_ap_courses_only_come_from_the_curated_verified_list():
    curated = json.loads(refresh.CURATED.read_text())
    allowed = {name for names in curated["ap_courses"].values() for name in names}

    for facts in career_catalog.load_career_data()["careers"].values():
        assert set(facts["ap_courses"]) <= allowed
        assert len(facts["ap_courses"]) <= 4


def test_counselor_sources_carry_exact_figures_that_grounding_accepts():
    source = build_sources([{"slug": "registered-nurses"}])[0]
    facts = career_catalog.career_facts("registered-nurses")
    median = facts["wages"]["national"]["annual_median"]
    written = f"${median:,.0f}"

    assert written in source["text"] and "median" in source["text"]
    assert source["title"] == "Registered Nurses (O*NET, BLS)"

    corpus = source["text"]
    assert grounding.ungrounded_claims(f"Nurses earn a median of {written} a year.", corpus) == []
    # A rounded figure isn't what the source says, so it's removed.
    rounded = f"${round(median, -4):,.0f}"
    assert rounded != written
    assert grounding.ungrounded_claims(f"Nurses earn about {rounded}.", corpus)


def test_hourly_only_jobs_still_get_a_pay_line():
    text = career_catalog.facts_text("musicians-and-singers")

    assert "an hour" in text and "a year in the U.S." not in text


def test_florida_licenses_are_sourced_and_reach_the_counselor():
    data = career_catalog.load_career_data()
    nurses = data["careers"]["registered-nurses"]["licenses"]

    assert data["sources"]["licenses"]["state"] == "Florida"
    assert any("Registered Nurse" in item["title"] for item in nurses)
    assert all(item["url"].startswith("https://") for item in nurses if item["url"])
    assert "Florida licenses" in career_catalog.facts_text("registered-nurses")
    # Careers Florida doesn't license have none, not a guess.
    assert data["careers"]["graphic-designers"]["licenses"] == []
