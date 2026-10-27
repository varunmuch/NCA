"""
Add College Scorecard admissions data (admit rate, SAT/ACT middle 50%,
test policy, net price calculator) to app/data/florida_colleges.json.

Usage (from backend/):
  curl "https://api.data.gov/ed/collegescorecard/v1/schools.json?id=<ids>&fields=<FIELDS>&per_page=100&api_key=KEY" \
      -o data_raw/scorecard_fl_admissions.json
  .venv/bin/python -m scripts.add_admissions data_raw/scorecard_fl_admissions.json
"""

import json
import sys
from datetime import date
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "app" / "data" / "florida_colleges.json"

FIELDS = (
    "id,school.name,school.price_calculator_url,latest.admissions.admission_rate.overall,"
    "latest.admissions.sat_scores.25th_percentile.critical_reading,latest.admissions.sat_scores.75th_percentile.critical_reading,"
    "latest.admissions.sat_scores.25th_percentile.math,latest.admissions.sat_scores.75th_percentile.math,"
    "latest.admissions.act_scores.25th_percentile.cumulative,latest.admissions.act_scores.75th_percentile.cumulative,"
    "latest.admissions.test_requirements"
)

# Scorecard's ADMCON7 codes.
TEST_POLICY = {1: "Required", 2: "Recommended", 3: "Neither required nor recommended", 4: "Do not know", 5: "Considered but not required"}


def _sat(row: dict, pct: str) -> int | None:
    reading = row.get(f"latest.admissions.sat_scores.{pct}_percentile.critical_reading")
    math = row.get(f"latest.admissions.sat_scores.{pct}_percentile.math")
    return int(reading + math) if reading and math else None


def admissions(row: dict) -> dict:
    rate = row.get("latest.admissions.admission_rate.overall")
    return {
        "admit_rate": round(rate * 100) if rate is not None else None,
        "sat_25": _sat(row, "25th"),
        "sat_75": _sat(row, "75th"),
        "act_25": row.get("latest.admissions.act_scores.25th_percentile.cumulative"),
        "act_75": row.get("latest.admissions.act_scores.75th_percentile.cumulative"),
        "test_policy": TEST_POLICY.get(row.get("latest.admissions.test_requirements"), ""),
        "price_calculator_url": row.get("school.price_calculator_url") or "",
    }


def main(path: str) -> None:
    rows = {str(row["id"]): row for row in json.loads(Path(path).read_text())["results"]}
    data = json.loads(DATA.read_text())

    for college in data["data"]:
        row = rows.get(college["id"])
        college["admissions"] = admissions(row) if row else {}

    data["source"]["admissions_retrieved"] = date.today().isoformat()
    DATA.write_text(json.dumps(data, ensure_ascii=False))
    print(f"Added admissions to {sum(bool(c['admissions']) for c in data['data'])} colleges")


if __name__ == "__main__":
    main(sys.argv[1])
