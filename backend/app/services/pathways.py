"""
Official building blocks for a career pathway: education survey, college
majors, Florida colleges, certifications, and high school courses.

Code builds these lists from public data; the model may only pick from
them (enforced by JSON schema enums) and explain why. Details like net
price, graduation rate and earnings are attached by code, never written by
the model. Data files are built by scripts/build_pathways.py.
"""

import json
import logging
import re
from functools import lru_cache
from pathlib import Path

from app.services import career_catalog, careeronestop

logger = logging.getLogger(__name__)

DATA = Path(__file__).resolve().parents[1] / "data"
ADDED_VIDEOS_PATH = Path(__file__).resolve().parents[2] / "storage" / "catalog" / "added_videos.json"
ADDED_CERTS_PATH = Path(__file__).resolve().parents[2] / "storage" / "catalog" / "added_certifications.json"

# Cities within about an hour of NeoCity Academy (Kissimmee).
CENTRAL_FLORIDA = {
    "kissimmee", "orlando", "sanford", "winter park", "oviedo", "lake mary",
    "lakeland", "leesburg", "clermont", "daytona beach", "melbourne",
    "cocoa", "winter haven", "celebration", "deland", "altamonte springs",
}

# The Orlando area, within about 30 minutes of NeoCity.
NEAREST = {"kissimmee", "orlando", "celebration", "winter park", "oviedo", "sanford", "lake mary", "altamonte springs"}

# Core courses a Florida high school offers, by subject. AP courses come
# from the College Board list attached to each career.
CORE_COURSES = [
    "Algebra 1", "Geometry", "Algebra 2", "Precalculus", "Statistics",
    "Biology", "Chemistry", "Physics", "Anatomy and Physiology",
    "Environmental Science", "Marine Science", "Computer Science",
    "Digital Art and Design", "Engineering (CTE)", "Health Science (CTE)",
    "Business and Entrepreneurship (CTE)", "Journalism", "Spanish",
    "Dual enrollment at Valencia College", "Online course on Florida Virtual School (FLVS)",
]

TRANSFER_REASON = (
    "You can start here with an associate degree, often at a lower cost, "
    "then transfer to a university to finish a bachelor's degree."
)

# Bachelor's first: it's the degree most of these careers start with.
CREDENTIAL_ORDER = ["Bachelor's", "Associate's", "Certificate", "Master's"]

GRADES = ["9th grade", "10th grade", "11th grade", "12th grade"]

MAX_MAJORS = 10
MAX_COLLEGES = 14
MAX_TWO_YEAR = 4
MAX_CERTS = 15


def _load(name: str) -> dict:
    path = DATA / name

    if not path.exists():
        logger.warning("Pathway data file %s is missing; run scripts/build_pathways.py", name)
        return {"source": {}, "data": {}}

    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _education() -> dict:
    return _load("onet_education.json")


@lru_cache(maxsize=1)
def _majors() -> dict:
    return _load("soc_cip.json")


@lru_cache(maxsize=1)
def _colleges() -> dict:
    return _load("florida_colleges.json")


@lru_cache(maxsize=1)
def _certifications() -> dict:
    return _load("certifications.json")


@lru_cache(maxsize=1)
def _videos() -> dict:
    return _load("career_videos.json")


async def video(code: str) -> dict | None:
    """The official CareerOneStop video for an occupation, if there is one."""

    if code in _videos()["data"]:
        return _videos()["data"][code][0]

    added = json.loads(ADDED_VIDEOS_PATH.read_text(encoding="utf-8")) if ADDED_VIDEOS_PATH.exists() else {}

    if code not in added:
        try:
            added[code] = await careeronestop.videos(code)
        except careeronestop.CareerOneStopError as exc:
            logger.warning("Video for %s unavailable: %s", code, exc)
            return None

        ADDED_VIDEOS_PATH.parent.mkdir(parents=True, exist_ok=True)
        ADDED_VIDEOS_PATH.write_text(json.dumps(added), encoding="utf-8")

    return added[code][0] if added[code] else None


def sources() -> dict:
    return {
        "education_survey": _education()["source"],
        "majors": _majors()["source"],
        "colleges": _colleges()["source"],
        "certifications": _certifications()["source"],
    }


def onet_code(slug: str) -> str:
    career = career_catalog.get_career(slug) or {}
    return career.get("onet_code") or ""


def education_survey(code: str) -> dict | None:
    """
    What workers in this occupation say the job requires (O*NET survey):
    levels with at least 10% of respondents, most common first.
    """

    entry = _education()["data"].get(code)

    if not entry:
        return None

    levels = sorted(entry["levels"].items(), key=lambda item: -item[1])

    return {
        "levels": [{"level": level, "percent": round(percent)} for level, percent in levels if percent >= 10],
        "respondents": entry["respondents"],
        "small_sample": entry["small_sample"],
        "source": _education()["source"].get("name", ""),
    }


def _cip4(cip: str) -> str:
    return cip.replace(".", "")[:4]


def _offered_cip4() -> dict[str, int]:
    """How many Florida colleges offer each 4-digit CIP field."""

    counts: dict[str, int] = {}

    for college in _colleges()["data"]:
        for cip4 in college["programs"]:
            counts[cip4] = counts.get(cip4, 0) + 1

    return counts


def _field_titles() -> dict[str, str]:
    """The name Florida colleges report for each 4-digit CIP field."""

    titles: dict[str, str] = {}

    for college in _colleges()["data"]:
        for cip4, programs in college["programs"].items():
            titles.setdefault(cip4, programs[0]["title"])

    return titles


def majors(code: str) -> list[dict]:
    """
    College majors that prepare for this occupation and that Florida
    colleges offer. College Scorecard reports programs by 4-digit field
    (11.01 covers general computer science and artificial intelligence), so
    majors are grouped by field and list the specialties they include.
    """

    soc = code.split(".")[0]
    offered = _offered_cip4()
    titles = _field_titles()
    fields: dict[str, dict] = {}

    for major in _majors()["data"].get(soc, []):
        cip4 = _cip4(major["cip"])

        if cip4 not in offered:
            continue

        field = fields.setdefault(
            cip4,
            {"cip": f"{cip4[:2]}.{cip4[2:]}", "title": titles.get(cip4, major["title"]), "includes": [], "florida_colleges": offered[cip4]},
        )

        if major["title"] != field["title"] and major["title"] not in field["includes"]:
            field["includes"].append(major["title"])

    result = sorted(fields.values(), key=lambda item: -item["florida_colleges"])

    return result[:MAX_MAJORS]


def colleges(code: str) -> list[dict]:
    """
    Florida public and nonprofit colleges with a program in one of this
    occupation's majors. Public, nearby, 4-year schools with the most
    matching programs come first; a few 2-year state colleges are kept for
    the start-at-a-state-college-then-transfer route.
    """

    wanted = {_cip4(major["cip"]) for major in majors(code)}

    if not wanted:
        return []

    found = []

    for college in _colleges()["data"]:
        programs = sorted(
            (
                {**program, "cip4": cip4}
                for cip4 in sorted(wanted & set(college["programs"]))
                for program in college["programs"][cip4]
            ),
            key=lambda program: CREDENTIAL_ORDER.index(program["credential"]) if program["credential"] in CREDENTIAL_ORDER else 9,
        )

        if not programs:
            continue

        found.append(
            {
                **{key: college[key] for key in ("id", "name", "city", "ownership", "kind", "url", "net_price", "graduation_rate", "students")},
                "central_florida": college["city"].lower() in CENTRAL_FLORIDA,
                "programs": programs[:4],
            }
        )

    def rank(college: dict) -> tuple:
        bachelor = sum(program["credential"] == "Bachelor's" for program in college["programs"])
        city = college["city"].lower()
        distance = 0 if city in NEAREST else 1 if college["central_florida"] else 2
        return (college["ownership"] != "Public", distance, -bachelor, -(college["students"] or 0))

    found.sort(key=rank)
    four_year = [college for college in found if college["kind"] == "4-year"]
    two_year = [college for college in found if college["kind"] == "2-year"]

    return four_year[: MAX_COLLEGES - MAX_TWO_YEAR] + two_year[:MAX_TWO_YEAR]


def _added_certs() -> dict:
    if ADDED_CERTS_PATH.exists():
        return json.loads(ADDED_CERTS_PATH.read_text(encoding="utf-8"))

    return {}


async def certifications(code: str) -> list[dict]:
    """Certifications for an occupation: from the built file, else fetched once and kept."""

    if code in _certifications()["data"]:
        return _certifications()["data"][code][:MAX_CERTS]

    added = _added_certs()

    if code in added:
        return added[code]

    # Imported here so the build script's helper stays the single parser.
    from scripts.build_pathways import fetch_certifications

    try:
        certs = await fetch_certifications(code, MAX_CERTS)
    except careeronestop.CareerOneStopError as exc:
        logger.warning("Certifications for %s unavailable: %s", code, exc)
        return []

    added[code] = certs
    ADDED_CERTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    ADDED_CERTS_PATH.write_text(json.dumps(added, ensure_ascii=False), encoding="utf-8")

    return certs


def course_options(slug: str) -> list[str]:
    """AP courses the College Board lists for this career, then core courses."""

    facts = career_catalog.career_facts(slug) or {}
    ap = list(facts.get("ap_courses") or [])

    return ap + [course for course in CORE_COURSES if course not in ap]


def course_kind(course: str) -> str:
    if course.startswith("AP "):
        return "AP"

    if course.startswith("Dual enrollment"):
        return "Dual enrollment"

    if "FLVS" in course:
        return "Online"

    if "(CTE)" in course:
        return "Career & technical"

    return "Core"


async def candidates(slug: str) -> dict:
    """Everything the model may pick from for one career's pathway."""

    code = onet_code(slug)

    return {
        "slug": slug,
        "code": code,
        "courses": course_options(slug),
        "majors": majors(code),
        "colleges": colleges(code),
        "certifications": await certifications(code),
    }


def candidates_text(found: dict) -> str:
    """The candidate lists as the model sees them (ids and names only)."""

    lines = ["## Courses (pick by exact name)"]
    lines += [f"- {course}" for course in found["courses"]]

    lines.append("\n## College majors (cip: title)")
    lines += [
        f"- {major['cip']}: {major['title']}" + (f" (includes {', '.join(major['includes'][:4])})" if major["includes"] else "")
        for major in found["majors"]
    ]

    lines.append("\n## Florida colleges (id: name, city, type)")
    lines += [
        f"- {college['id']}: {college['name']}, {college['city']} ({college['ownership']} {college['kind']}"
        f"{', near NeoCity' if college['central_florida'] else ''}); programs: "
        + "; ".join(f"{program['credential']} in {program['title']}" for program in college["programs"])
        for college in found["colleges"]
    ]

    lines.append("\n## Certifications (id: name, organization)")
    lines += [
        f"- {cert['id']}: {cert['name']}, {cert['organization']}"
        f"{' (no degree or long work experience required)' if cert['beginner_friendly'] else ''}"
        for cert in found["certifications"]
    ]

    return "\n".join(lines)


def schema(found: dict) -> dict:
    """JSON schema whose enums are the candidate lists, so nothing else can be picked."""

    def picks(key_name: str, values: list[str], max_items: int, extra: dict | None = None) -> dict:
        properties = {key_name: {"type": "string", "enum": values}, "why": {"type": "string", "maxLength": 260}}
        properties.update(extra or {})

        return {
            "type": "array",
            "maxItems": max_items,
            "items": {"type": "object", "properties": properties, "required": list(properties)},
        }

    properties = {"summary": {"type": "string", "maxLength": 400}}
    required = ["summary"]

    if found["courses"]:
        properties["courses"] = picks("course", found["courses"], 8, {"grade": {"type": "string", "enum": GRADES}})
        required.append("courses")

    if found["majors"]:
        properties["majors"] = picks("cip", [major["cip"] for major in found["majors"]], 3)
        required.append("majors")

    if found["colleges"]:
        properties["colleges"] = picks("id", [college["id"] for college in found["colleges"]], 6)
        required.append("colleges")

    if found["certifications"]:
        properties["certifications"] = picks("id", [cert["id"] for cert in found["certifications"]], 4)
        required.append("certifications")

    return {"type": "object", "properties": properties, "required": required}


# Praise no official data backs up.
UNBACKED_PRAISE = re.compile(
    r"\b(top[- ]tier|top[- ]ranked|highly ranked|prestigious|elite|renowned|world[- ]class|"
    r"best|excellent|outstanding|competitive|robust|strong|leading|cutting[- ]edge|well[- ]regarded|"
    r"well[- ]known|reputable|respected|acclaimed|premier|notable)\b",
    re.IGNORECASE,
)


def _without_praise(text: str) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return " ".join(sentence for sentence in sentences if not UNBACKED_PRAISE.search(sentence)).strip()


def _own_reason(why: str, college: dict, colleges_list: list[dict]) -> str:
    """
    Drop a reason that talks about a different college: the model sometimes
    pairs one school's id with another school's description.
    """

    why = _without_praise(why)
    lowered = why.lower()

    if college["name"].lower() in lowered:
        return why

    for other in colleges_list:
        if other["id"] != college["id"] and other["name"].lower() in lowered:
            return ""

    return why


def attach(raw: dict, found: dict, clean) -> dict:
    """
    Turn the model's picks into the pathway shown to students: official
    details come from the candidate lists; unknown or repeated picks are
    dropped. `clean` tidies the model's own sentences.
    """

    by_major = {major["cip"]: major for major in found["majors"]}
    by_college = {college["id"]: college for college in found["colleges"]}
    by_cert = {cert["id"]: cert for cert in found["certifications"]}
    allowed_courses = set(found["courses"])

    def unique(items, key, lookup):
        seen = set()

        for item in items or []:
            value = item.get(key)

            if value in lookup and value not in seen:
                seen.add(value)
                yield item, value

    courses = [
        {"course": course, "grade": item.get("grade", ""), "kind": course_kind(course), "why": clean(item.get("why", ""))}
        for item, course in unique(raw.get("courses"), "course", allowed_courses)
    ]
    courses.sort(key=lambda item: GRADES.index(item["grade"]) if item["grade"] in GRADES else len(GRADES))

    picked_colleges = [
        {**by_college[college_id], "why": _own_reason(clean(item.get("why", "")), by_college[college_id], found["colleges"])}
        for item, college_id in unique(raw.get("colleges"), "id", by_college)
    ]

    # Always show the lower-cost route: start at a state college, then transfer.
    if not any(college["kind"] == "2-year" for college in picked_colleges):
        two_year = next((college for college in found["colleges"] if college["kind"] == "2-year"), None)

        if two_year:
            picked_colleges.append({**two_year, "why": TRANSFER_REASON})

    return {
        "career_slug": found["slug"],
        "career_title": (career_catalog.get_career(found["slug"]) or {}).get("title", ""),
        "summary": clean(raw.get("summary", "")),
        "courses": courses,
        "majors": [
            {**by_major[cip], "why": clean(item.get("why", ""))}
            for item, cip in unique(raw.get("majors"), "cip", by_major)
        ],
        "colleges": picked_colleges,
        "certifications": [
            {**by_cert[cert_id], "why": clean(item.get("why", ""))}
            for item, cert_id in unique(raw.get("certifications"), "id", by_cert)
        ],
        "education_survey": education_survey(found["code"]),
        "sources": sources(),
    }


async def quick_path(slug: str) -> dict | None:
    """
    A career in 30 seconds, built by code from official data with no model
    call, so it appears instantly: pay, schooling, what you'd do, three
    classes, a nearby university and state college, and a first
    certification.
    """

    from app.services import field_quiz  # imported here to avoid a cycle

    career = career_catalog.get_career(slug)

    if career is None:
        return None

    facts = career_catalog.career_facts(slug) or {}
    wages = facts.get("wages") or {}
    code = career.get("onet_code") or ""
    found_colleges = colleges(code)
    certs = await certifications(code)
    university = next((college for college in found_colleges if college["kind"] == "4-year"), None)
    state_college = next((college for college in found_colleges if college["kind"] == "2-year"), None)
    first_cert = next((cert for cert in certs if cert["beginner_friendly"]), certs[0] if certs else None)
    tasks = [item["text"] for item in field_quiz.items_for(slug)][:3]

    def college_card(college):
        if not college:
            return None

        return {key: college[key] for key in ("name", "city", "kind", "ownership", "url", "net_price", "graduation_rate", "central_florida")}

    return {
        "slug": slug,
        "title": career["title"],
        "pay_median": (wages.get("national") or {}).get("annual_median"),
        "pay_median_florida": (wages.get("florida") or {}).get("annual_median"),
        "education": (facts.get("education") or {}).get("typical_entry"),
        "education_survey": education_survey(code),
        "growth_percent": (facts.get("outlook") or {}).get("growth_percent"),
        "tasks": tasks,
        "courses": course_options(slug)[:3],
        "university": college_card(university),
        "state_college": college_card(state_college),
        "certification": {key: first_cert[key] for key in ("name", "organization", "url", "beginner_friendly")} if first_cert else None,
        "sources": sources(),
    }
