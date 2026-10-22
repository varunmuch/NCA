"""
Build the official data behind career plans: education survey, majors,
Florida colleges, and certifications.

Sources (all public, U.S. government):
  - O*NET 31.0 "Education.txt": share of workers reporting each required
    education level (Required Level of Education, scale RL).
  - NCES CIP 2020 to SOC 2018 crosswalk: which college majors (CIP codes)
    prepare for which occupations (SOC codes).
  - College Scorecard (U.S. Dept. of Education): Florida degree-granting
    colleges, their programs by 4-digit CIP code, net price, graduation
    rate, and early-career earnings by program.
  - CareerOneStop Certification Finder (U.S. Dept. of Labor):
    certifications for each catalog occupation.

Usage (from backend/):
  .venv/bin/python -m scripts.build_pathways \
      --onet-dir /path/to/db_31_0_text \
      --crosswalk /path/to/CIP2020_SOC2018_Crosswalk.xlsx \
      --scorecard fl_0.json fl_1.json \
      [--skip-certifications]

Scorecard files come from three requests that cover every Florida college.
Some Florida state colleges (Valencia, Seminole State, Miami Dade) mainly
award certificates, so a third request adds public and nonprofit schools
with predominant=1 and highest=2,3,4:
  https://api.data.gov/ed/collegescorecard/v1/schools?school.state=FL
    &school.degrees_awarded.predominant=2,3&school.operating=1
    &fields=<see SCORECARD_FIELDS>&per_page=100&page=0|1&api_key=KEY
"""

import argparse
import asyncio
import csv
import json
import sys
from datetime import date
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import careeronestop  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "app" / "data"

SCORECARD_FIELDS = (
    "id,school.name,school.city,school.ownership,school.school_url,"
    "school.degrees_awarded.predominant,latest.cost.avg_net_price.public,"
    "latest.cost.avg_net_price.private,latest.completion.rate_suppressed.overall,"
    "latest.student.size,latest.programs.cip_4_digit"
)

# O*NET Required Level of Education categories.
RL_LEVELS = {
    1: "Less than high school",
    2: "High school diploma",
    3: "Postsecondary certificate",
    4: "Some college",
    5: "Associate's degree",
    6: "Bachelor's degree",
    7: "Post-baccalaureate certificate",
    8: "Master's degree",
    9: "Post-master's certificate",
    10: "Professional degree",
    11: "Doctoral degree",
    12: "Post-doctoral training",
}

# Scorecard credential levels kept for high school students' planning.
CREDENTIALS = {1: "Certificate", 2: "Associate's", 3: "Bachelor's", 5: "Master's"}

OWNERSHIP = {1: "Public", 2: "Private nonprofit", 3: "Private for-profit"}

CERTS_PER_CAREER = 15


def build_education(onet_dir: Path) -> dict:
    survey: dict[str, dict] = {}

    with open(onet_dir / "Education.txt", encoding="utf-8") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            if row["Scale ID"] != "RL":
                continue

            code = row["O*NET-SOC Code"]
            entry = survey.setdefault(code, {"levels": {}, "respondents": 0, "small_sample": False, "date": row["Date"]})
            share = float(row["Data Value"])

            if share > 0:
                entry["levels"][RL_LEVELS[int(row["Category"])]] = round(share, 1)

            entry["respondents"] = max(entry["respondents"], int(row["N"] or 0))
            entry["small_sample"] = entry["small_sample"] or row["Recommend Suppress"] == "Y"

    return survey


def build_majors(crosswalk: Path) -> dict:
    workbook = openpyxl.load_workbook(crosswalk, read_only=True)
    majors: dict[str, list] = {}

    for row in workbook["SOC-CIP"].iter_rows(min_row=2, values_only=True):
        soc, _, cip, title = row[:4]

        if not cip or cip.startswith("99"):
            continue

        majors.setdefault(soc, []).append({"cip": cip, "title": title.rstrip(".")})

    return majors


def _earnings(program: dict) -> tuple[int | None, str]:
    earnings = program.get("earnings") or {}

    for years in ("4_yr", "1_yr"):
        median = (earnings.get(years) or {}).get("overall_median_earnings")

        if median:
            return int(median), years.split("_")[0]

    return None, ""


def build_colleges(files: list[Path]) -> list[dict]:
    colleges = []

    for path in files:
        for school in json.loads(path.read_text())["results"]:
            ownership = OWNERSHIP.get(school.get("school.ownership"), "")

            # For-profit colleges are left out of student plans.
            if ownership == "Private for-profit":
                continue

            programs: dict[str, list] = {}

            for program in school.get("latest.programs.cip_4_digit") or []:
                level = (program.get("credential") or {}).get("level")

                if level not in CREDENTIALS:
                    continue

                median, years = _earnings(program)
                programs.setdefault(program["code"], []).append(
                    {
                        "title": program["title"].rstrip("."),
                        "credential": CREDENTIALS[level],
                        "earnings_median": median,
                        "earnings_years": years,
                    }
                )

            net_price = school.get("latest.cost.avg_net_price.public") or school.get("latest.cost.avg_net_price.private")
            rate = school.get("latest.completion.rate_suppressed.overall")
            url = school.get("school.school_url") or ""

            colleges.append(
                {
                    "id": str(school["id"]),
                    "name": school["school.name"],
                    "city": school.get("school.city") or "",
                    "ownership": ownership,
                    "kind": "4-year" if school.get("school.degrees_awarded.predominant") == 3 else "2-year",
                    "url": url if url.startswith("http") else (f"https://{url}" if url else ""),
                    "net_price": int(net_price) if net_price else None,
                    "graduation_rate": round(rate * 100) if rate is not None else None,
                    "students": school.get("latest.student.size"),
                    "programs": programs,
                }
            )

    return sorted(colleges, key=lambda college: college["name"])


def _cert_summary(cert: dict) -> dict:
    details = {item.get("Name", ""): item.get("Value", "") for item in cert.get("CertDetailList") or []}
    more_school = details.get("More than two years of education or training after high school required?", "")
    more_work = details.get("More than two years of work experience required?", "")

    return {
        "id": cert["Id"],
        "name": cert["Name"].strip(),
        "organization": (cert.get("Organization") or "").strip(),
        "url": cert.get("Url") or cert.get("OrganizationUrl") or "",
        "description": (cert.get("Description") or "").strip()[:400],
        # Objective flags from the certifying body's own requirements.
        "beginner_friendly": more_school == "No" and more_work == "No",
        "exam_required": details.get("Oral or Written Exam Required?", "") == "Yes",
    }


async def fetch_certifications(onet_code: str, limit: int = CERTS_PER_CAREER) -> list[dict]:
    data = await careeronestop.certifications(onet_code, limit=limit * 2)
    certs = [_cert_summary(cert) for cert in data]

    # Beginner-friendly certifications first, then the rest.
    certs.sort(key=lambda cert: (not cert["beginner_friendly"], cert["name"]))

    return certs[:limit]


async def build_certifications() -> dict:
    catalog = json.loads((DATA / "careers.json").read_text())
    result: dict[str, list] = {}

    for career in catalog["careers"]:
        code = career["onet_code"]

        try:
            result[code] = await fetch_certifications(code)
        except careeronestop.CareerOneStopError as exc:
            print(f"  {code}: {exc}")
            result[code] = []

        print(f"  {career['title']}: {len(result[code])} certifications")

    return result


def write(name: str, payload: dict, source: dict) -> None:
    path = DATA / name
    path.write_text(json.dumps({"source": source, "data": payload}, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--onet-dir", type=Path, required=True)
    parser.add_argument("--crosswalk", type=Path, required=True)
    parser.add_argument("--scorecard", type=Path, nargs="+", required=True)
    parser.add_argument("--skip-certifications", action="store_true")
    args = parser.parse_args()
    today = date.today().isoformat()

    write(
        "onet_education.json",
        build_education(args.onet_dir),
        {"name": "O*NET 31.0 Education, Training, and Experience (USDOL/ETA)", "url": "https://www.onetcenter.org/database.html", "retrieved": today},
    )
    write(
        "soc_cip.json",
        build_majors(args.crosswalk),
        {"name": "NCES CIP 2020 to SOC 2018 Crosswalk", "url": "https://nces.ed.gov/ipeds/cipcode/resources.aspx?y=56", "retrieved": today},
    )
    write(
        "florida_colleges.json",
        build_colleges(args.scorecard),
        {"name": "College Scorecard, U.S. Department of Education", "url": "https://collegescorecard.ed.gov/data/", "retrieved": today},
    )

    if not args.skip_certifications:
        write(
            "certifications.json",
            asyncio.run(build_certifications()),
            {"name": "CareerOneStop Certification Finder, U.S. Department of Labor", "url": "https://www.careeronestop.org/Toolkit/Training/find-certifications.aspx", "retrieved": today},
        )


if __name__ == "__main__":
    main()
