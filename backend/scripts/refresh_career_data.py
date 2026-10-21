"""
Refresh career data from official sources into app/data/career_data.json.

For each catalog career (mapped to its SOC code from the O*NET code):
  wages      BLS OEWS via the BLS Public Data API v2: annual median, 10th and
             90th percentile, hourly median; national and Florida
  outlook    BLS Employment Projections (occupation.xlsx, Table 1.2):
             percent growth, annual openings, and the all-jobs average
  education  BLS Employment Projections (education.xlsx, Table 5.4):
             typical entry-level education, work experience, training
  classes    AP courses for the career's top school subjects, from
             app/data/curated_learning.json, each name checked against the
             College Board AP course index
  learning   free or low-cost courses from curated_learning.json; Khan
             Academy links checked against its sitemap, others by HTTP status
  licenses   Florida licenses for the occupation from CareerOneStop's
             License Finder (U.S. Department of Labor), active ones only

Every section records its source and the date it was retrieved. A value
that BLS does not publish is stored as null, never estimated. Anything
that can't be verified is dropped and listed in the report.

Needs CIE_BLS_API_KEY and CIE_DATA_CONTACT_EMAIL in backend/.env, and for
licenses CIE_CAREERONESTOP_USER_ID and CIE_CAREERONESTOP_TOKEN (skipped if
not set).

Usage (from backend/):
  .venv/bin/python -m scripts.refresh_career_data            # refresh and write
  .venv/bin/python -m scripts.refresh_career_data --dry-run  # report only
"""

import argparse
import html
import io
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
import openpyxl
from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services import career_catalog  # noqa: E402

DATA = BACKEND / "app" / "data"
OUTPUT = DATA / "career_data.json"
CURATED = DATA / "curated_learning.json"

BLS_API = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
PROJECTIONS_URL = "https://www.bls.gov/emp/ind-occ-matrix/occupation.xlsx"
EDUCATION_URL = "https://www.bls.gov/emp/ind-occ-matrix/education.xlsx"
KHAN_SITEMAP = "https://www.khanacademy.org/sitemap.xml"
LICENSE_API = "https://api.careeronestop.org/v1/license/{user}/{onet}/FL/0/0/0/10"
MAX_LICENSES = 3

# OEWS area type and code. Florida is state FIPS 12.
AREAS = {"national": ("N", "0000000"), "florida": ("S", "1200000")}

# OEWS data type codes.
DATATYPES = {
    "13": "annual_median",
    "11": "annual_p10",
    "15": "annual_p90",
    "08": "hourly_median",
}

SERIES_PER_REQUEST = 50


def soc_of(onet_code: str) -> str:
    """O*NET 29-1141.00 -> SOC 29-1141."""

    return onet_code[:7]


def series_id(area: str, soc: str, datatype: str) -> str:
    area_type, area_code = AREAS[area]
    return f"OEU{area_type}{area_code}000000{soc.replace('-', '')}{datatype}"


def number(value) -> float | None:
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def fetch_wages(client: httpx.Client, socs: list[str], key: str) -> tuple[dict, str | None]:
    """{soc: {area: {field: value}}}, plus the OEWS period ('May 2025')."""

    wanted = {
        series_id(area, soc, datatype): (soc, area, field)
        for soc in socs
        for area in AREAS
        for datatype, field in DATATYPES.items()
    }
    ids = list(wanted)
    wages: dict = {}
    period = None

    for start in range(0, len(ids), SERIES_PER_REQUEST):
        batch = ids[start : start + SERIES_PER_REQUEST]
        response = client.post(
            BLS_API,
            json={"seriesid": batch, "latest": True, "registrationkey": key},
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()

        if payload.get("status") != "REQUEST_SUCCEEDED":
            raise RuntimeError(f"BLS API: {payload.get('status')} {payload.get('message')}")

        for series in payload["Results"]["series"]:
            soc, area, field = wanted[series["seriesID"]]
            entry = wages.setdefault(soc, {}).setdefault(area, {})

            if not series["data"]:
                continue

            point = series["data"][0]
            notes = " ".join(note.get("text", "") for note in point.get("footnotes") or [] if note)
            entry[field] = number(point["value"])

            # BLS top-codes the highest wages: the value is a floor, not a median.
            if "greater than or equal" in notes.lower() or "≥" in notes:
                entry.setdefault("at_least", []).append(field)

            if point.get("period") == "A01":
                period = f"May {point['year']}"

    return wages, period


def read_sheet(content: bytes, title_prefix: str) -> list[tuple]:
    workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)

    for sheet in workbook.worksheets:
        if sheet.title.startswith(title_prefix):
            return list(sheet.iter_rows(values_only=True))

    raise RuntimeError(f"Sheet {title_prefix} not found")


def header_index(rows: list[tuple]) -> tuple[int, list[str]]:
    for index, row in enumerate(rows):
        cells = [str(cell or "") for cell in row]

        if any("Matrix code" in cell for cell in cells):
            return index, cells

    raise RuntimeError("Header row not found")


def column(headers: list[str], *words: str) -> int:
    for index, header in enumerate(headers):
        if all(word.lower() in header.lower() for word in words):
            return index

    raise RuntimeError(f"Column with {words} not found")


def parse_projections(content: bytes) -> tuple[dict, dict]:
    rows = read_sheet(content, "Table 1.2")
    start, headers = header_index(rows)
    code = column(headers, "Matrix code")
    growth = column(headers, "change, percent")
    openings = column(headers, "openings")
    period = re.search(r"(\d{4})[–-](\d{2,4})", headers[growth])
    span = f"{period.group(1)}–{period.group(2)}" if period else ""
    table = {}

    for row in rows[start + 1 :]:
        if not row or not row[code]:
            continue

        table[str(row[code]).strip()] = {
            "growth_percent": number(row[growth]),
            # Openings are published in thousands.
            "openings_per_year": round(number(row[openings]) * 1000) if number(row[openings]) is not None else None,
            "period": span,
        }

    total = table.get("00-0000", {})
    return table, {"all_jobs_growth_percent": total.get("growth_percent"), "period": span}


def parse_education(content: bytes) -> dict:
    rows = read_sheet(content, "Table 5.4")
    start, headers = header_index(rows)
    code = column(headers, "Matrix code")
    education = column(headers, "education needed")
    experience = column(headers, "work experience")
    training = column(headers, "on-the-job training")

    return {
        str(row[code]).strip(): {
            "typical_entry": str(row[education] or "").strip() or None,
            "work_experience": str(row[experience] or "").strip() or None,
            "training": str(row[training] or "").strip() or None,
        }
        for row in rows[start + 1 :]
        if row and row[code]
    }


def fetch_licenses(client: httpx.Client, careers: list[dict], user: str, token: str) -> dict:
    """{slug: [license]} for Florida, active licenses only."""

    licenses = {}

    for career in careers:
        response = client.get(
            LICENSE_API.format(user=user, onet=career["onet_code"]),
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            timeout=30,
        )

        if response.status_code == 404:
            licenses[career["slug"]] = []
            continue

        response.raise_for_status()
        found = []

        for item in response.json().get("LicenseList") or []:
            if item.get("ActiveStatusDesc") != "Active":
                continue

            agency = item.get("LicenseAgency") or {}
            url = (agency.get("Url") or "").strip()

            if url and not url.startswith("http"):
                url = "https://" + url

            found.append(
                {
                    "title": item["Title"].strip(),
                    "agency": (agency.get("Name") or "").replace("~", ", ").strip(),
                    "url": url,
                    "exam": item.get("LicExamIndDesc") or "",
                    "education": item.get("EducationIndDesc") or "",
                    "last_updated": item.get("LastUpdated") or "",
                }
            )

            if len(found) >= MAX_LICENSES:
                break

        licenses[career["slug"]] = found

    return licenses


def verify_learning(client: httpx.Client, curated: dict) -> tuple[dict, list[str]]:
    """Keep only AP names on the College Board index and links that resolve."""

    problems: list[str] = []

    ap_page = html.unescape(client.get(curated["ap_source"]["url"], timeout=30, follow_redirects=True).text)
    ap_courses = {}

    for subject, names in curated["ap_courses"].items():
        kept = [name for name in names if name in ap_page]
        problems += [f"AP name not on College Board index: {name}" for name in names if name not in kept]
        ap_courses[subject] = kept

    khan = client.get(KHAN_SITEMAP, timeout=60, follow_redirects=True).text
    khan_paths = set(re.findall(r"/sitemaps/([^<]+?)/sitemap\.xml", khan))
    checked: dict[str, bool] = {}

    def link_ok(url: str) -> bool:
        if url in checked:
            return checked[url]

        if url.startswith("https://www.khanacademy.org/"):
            # Khan answers 200 for any path, so check its sitemap instead.
            ok = url.removeprefix("https://www.khanacademy.org/").strip("/") in khan_paths
        else:
            try:
                ok = client.get(url, timeout=20, follow_redirects=True).status_code == 200
            except httpx.HTTPError:
                ok = False

        checked[url] = ok

        if not ok:
            problems.append(f"Link not verified: {url}")

        return ok

    resources = {
        subject: [item for item in items if link_ok(item["url"])]
        for subject, items in curated["resources"].items()
    }
    general = [item for item in curated["general"] if link_ok(item["url"])]

    return {"ap_courses": ap_courses, "resources": resources, "general": general}, problems


def build(args: argparse.Namespace) -> None:
    load_dotenv(BACKEND / ".env")
    key = os.getenv("CIE_BLS_API_KEY", "")
    contact = os.getenv("CIE_DATA_CONTACT_EMAIL", "")

    if not key or not contact:
        sys.exit("Set CIE_BLS_API_KEY and CIE_DATA_CONTACT_EMAIL in backend/.env first.")

    retrieved = datetime.now(timezone.utc).date().isoformat()
    careers = career_catalog.load_catalog()["careers"]
    curated = json.loads(CURATED.read_text())
    headers = {"User-Agent": f"CareerExplorer data refresh (NeoCity Academy; {contact})"}

    with httpx.Client(headers=headers) as client:
        print("BLS wages (API)…", flush=True)
        socs = sorted({soc_of(career["onet_code"]) for career in careers})
        wages, wage_period = fetch_wages(client, socs, key)

        print("BLS projections and education (files)…", flush=True)
        projections_file = client.get(PROJECTIONS_URL, timeout=60)
        education_file = client.get(EDUCATION_URL, timeout=60)
        projections_file.raise_for_status()
        education_file.raise_for_status()
        projections, all_jobs = parse_projections(projections_file.content)
        education = parse_education(education_file.content)

        print("Curated classes and courses (verifying)…", flush=True)
        learning, problems = verify_learning(client, curated)

        cos_user = os.getenv("CIE_CAREERONESTOP_USER_ID", "")
        cos_token = os.getenv("CIE_CAREERONESTOP_TOKEN", "")
        licenses: dict = {}

        if cos_user and cos_token:
            print("Florida licenses (CareerOneStop)…", flush=True)
            licenses = fetch_licenses(client, careers, cos_user, cos_token)

    out = {}
    missing = {"wages": [], "outlook": [], "education": []}

    for career in careers:
        soc = soc_of(career["onet_code"])
        subjects = career["subjects"][:3]
        ap = list(dict.fromkeys(name for subject in subjects for name in learning["ap_courses"].get(subject, [])[:2]))[:4]
        courses = list(
            {item["url"]: item for subject in subjects for item in learning["resources"].get(subject, [])}.values()
        )[:3] or learning["general"][:2]

        entry = {
            "soc": soc,
            "wages": {area: wages.get(soc, {}).get(area) or None for area in AREAS},
            "outlook": projections.get(soc),
            "education": education.get(soc),
            "ap_courses": ap,
            "learning": courses,
            "licenses": licenses.get(career["slug"], []),
        }

        national = wages.get(soc, {}).get("national") or {}

        for name, value in (("wages", national.get("annual_median")), ("outlook", entry["outlook"]), ("education", entry["education"])):
            if not value:
                missing[name].append(f"{career['title']} ({soc})")

        out[career["slug"]] = entry

    result = {
        "retrieved": retrieved,
        "sources": {
            "wages": {
                "name": f"BLS Occupational Employment and Wage Statistics, {wage_period or 'latest'}",
                "url": "https://www.bls.gov/oes/",
                "period": wage_period,
                "areas": {"national": "United States", "florida": "Florida"},
                "retrieved": retrieved,
            },
            "outlook": {
                "name": f"BLS Employment Projections, {all_jobs['period']}",
                "url": "https://www.bls.gov/emp/",
                "period": all_jobs["period"],
                "all_jobs_growth_percent": all_jobs["all_jobs_growth_percent"],
                "retrieved": retrieved,
            },
            "education": {
                "name": "BLS Employment Projections: education and training assignments",
                "url": "https://www.bls.gov/emp/tables/education-and-training-by-occupation.htm",
                "retrieved": retrieved,
            },
            "ap_courses": {**curated["ap_source"], "retrieved": retrieved},
            "licenses": {
                "name": "CareerOneStop License Finder, U.S. Department of Labor",
                "url": "https://www.careeronestop.org/Toolkit/Training/find-licenses.aspx",
                "state": "Florida",
                "retrieved": retrieved,
            },
            "learning": {
                "name": "Curated by NeoCity Academy; links verified",
                "reviewed": curated.get("reviewed", False),
                "retrieved": retrieved,
            },
        },
        "careers": out,
    }

    print(f"\n{len(out)} careers. Wages period: {wage_period}. Outlook: {all_jobs['period']} (all jobs {all_jobs['all_jobs_growth_percent']}%).")

    for name, items in missing.items():
        print(f"No BLS {name} for {len(items)}: {', '.join(items) or '-'}")

    print(f"Careers with Florida licenses: {sum(bool(items) for items in licenses.values())} of {len(out)}")
    print(f"Unverified curated items dropped: {len(problems)}")

    for problem in problems:
        print("  " + problem)

    if args.dry_run:
        print("\n(dry run: nothing written)")
        return

    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(f"\nwrote {OUTPUT.relative_to(BACKEND)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="fetch and report without writing")
    build(parser.parse_args())
