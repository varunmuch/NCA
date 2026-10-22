"""
Give careers students name a page, from official data.

ensure_career("AI engineer") ends in one of these ways:
  existing  the catalog already has it (title, alias, or an earlier page)
  added     it's an official O*NET job title: if its occupation is new to
            the catalog, the occupation is added from CareerOneStop's O*NET
            details with BLS pay, outlook and education, Florida licenses,
            AP classes, courses and quiz activities; and if the title isn't
            the occupation's own name ("AI Engineer" within Computer and
            Information Research Scientists), it gets its own page built on
            that occupation's data, saying so. Shared with every student.
  alias     the daily cap was reached; the phrase points to the occupation
  rejected  not an official job title ("unicorn wrangler"); nothing is added

Validation is O*NET's own list of 54,000+ job titles (onet_job_titles.tsv).
Nothing is generated except the quiz activities, which keep their source
tasks. Additions are capped per day and deduplicated.
"""

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone

from app.services import career_catalog, careeronestop
from app.services.careeronestop import CareerOneStopError
from scripts.build_career_catalog import KNOWLEDGE_TO_SUBJECT


logger = logging.getLogger("cie.expansion")

MAX_ADDITIONS_PER_DAY = 30

# Most common catalog family for each SOC major group.
FAMILY_BY_SOC_GROUP = {
    "11": "business", "13": "business", "15": "technology", "17": "engineering",
    "19": "science", "21": "education", "23": "law", "25": "education",
    "27": "arts", "29": "health", "31": "health", "33": "law",
    "35": "hospitality", "37": "hospitality", "39": "hospitality",
    "41": "business", "43": "business", "45": "environment",
    "47": "trades", "49": "trades", "51": "trades", "53": "trades", "55": "law",
}

# BLS typical entry-level education -> O*NET job zone.
JOB_ZONE_BY_EDUCATION = {
    "No formal educational credential": 2,
    "High school diploma or equivalent": 2,
    "Postsecondary nondegree award": 3,
    "Some college, no degree": 3,
    "Associate's degree": 3,
    "Bachelor's degree": 4,
    "Master's degree": 5,
    "Doctoral or professional degree": 5,
}

_lock = asyncio.Lock()

# Words that make a phrase a request rather than a job title.
FILLER = re.compile(
    r"^(?:"
    r"(?:(?:i|id|im|i am)\s+)?(?:really\s+)?(?:want|wanna|would like|like|hope|plan|dream|going|think i want)\s+to\s+(?:be|become)"
    r"|(?:(?:i|im|i am)\s+)?(?:interested in|thinking about|curious about)\s+(?:being|becoming)"
    r"|my dream (?:job|career) is"
    r"|a|an|the|be|become|becoming|being|to be|to become"
    r")\s+",
    re.IGNORECASE,
)


def clean_phrase(text: str) -> str:
    # Apostrophes vary ("I'd", "Id", "I’d"), so drop them before matching.
    phrase = re.sub(r"[’']", "", text.lower())
    phrase = re.sub(r"[^a-z0-9 &/-]", " ", phrase)
    phrase = re.sub(r"\s+", " ", phrase).strip()

    while FILLER.match(phrase):
        phrase = FILLER.sub("", phrase, count=1)

    return phrase


GOAL_PATTERN = re.compile(
    r"(?:(?:want|wanna|would like|like|hope|plan|going|dream|thinking about|thinking of|interested in|curious about)\s+(?:to\s+)?(?:be|become|being|becoming)"
    r"|\bbecome|\bbecoming|career as|job as|work as|working as|career in being|study to be)"
    r"\s+(?:an?\s+)?(?P<job>[a-z][a-z0-9 &/-]{1,50})",
    re.IGNORECASE,
)

# Where a job title stops: "an AI engineer someday", "a nurse because...".
JOB_END = re.compile(
    r"\s+(?:when|because|but|and|or|so|since|someday|one day|in|at|for|after|before|like|maybe|too|later|if|who|that|with)\b.*$"
)


def goal_phrases(message: str) -> list[str]:
    """Career goals a student states: "I want to become an AI engineer" -> ["ai engineer"]."""

    text = re.sub(r"[’']", "", message.lower())
    found = []

    for match in GOAL_PATTERN.finditer(text):
        job = JOB_END.sub("", match.group("job")).strip(" -/&")

        if job and looks_like_a_job(job):
            found.append(job)

    return list(dict.fromkeys(found))[:2]


def looks_like_a_job(phrase: str) -> bool:
    words = phrase.split()
    return 1 <= len(words) <= 6 and len(phrase) >= 3 and not phrase.isdigit()


def build_entry(detail: dict, education_title: str | None) -> dict:
    """A catalog entry from CareerOneStop's O*NET details, built like careers.json."""

    code = detail["OnetCode"]
    title = detail["OnetTitle"].strip()
    by_importance = lambda items: sorted(items or [], key=lambda item: -float(item.get("Importance") or 0))  # noqa: E731

    knowledge = by_importance(detail.get("KnowledgeDataList"))
    subjects = []

    for item in knowledge:
        # O*NET importance 3.0 of 5, as in the original catalog build.
        subject = KNOWLEDGE_TO_SUBJECT.get(item["ElementName"])

        if float(item.get("Importance") or 0) >= 50 and subject and subject not in subjects:
            subjects.append(subject)

    interests = [
        item["ElementName"]
        for item in sorted(detail.get("InterestDataList") or [], key=lambda item: -float(item.get("DataValue") or 0))
        if item.get("ElementName") in career_catalog.INTEREST_LABELS
    ][:3]

    zone = JOB_ZONE_BY_EDUCATION.get(education_title or "")
    zone_text = _zone_text(zone)
    education = (detail.get("EducationTraining") or {}).get("EducationType") or []
    tasks = sorted(detail.get("Tasks") or [], key=lambda task: -float(task.get("DataValue") or 0))
    by_code = career_catalog.load_catalog()["by_code"]

    return {
        "slug": re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:80],
        "onet_code": code,
        "title": title,
        "family": FAMILY_BY_SOC_GROUP.get(code[:2], "science"),
        "description": detail.get("OnetDescription", "").strip(),
        "tasks": [task["TaskDescription"].strip() for task in tasks[:7]],
        "knowledge": [item["ElementName"] for item in knowledge[:6]],
        "subjects": subjects[:5],
        "skills": [item["ElementName"] for item in by_importance(detail.get("SkillsDataList"))[:8]],
        "interests": interests,
        "interest_labels": [career_catalog.INTEREST_LABELS[name] for name in interests],
        "job_zone": zone,
        "preparation": zone_text[0],
        "education_summary": zone_text[1],
        "common_education": [
            {"level": item["EducationLevel"], "percent": round(float(item["Value"]))}
            for item in sorted(education, key=lambda item: -float(item.get("Value") or 0))[:3]
            if float(item.get("Value") or 0) >= 5
        ],
        "sample_titles": [name.strip() for name in (detail.get("AlternateTitles") or [])[:6]],
        "related": [by_code[other]["slug"] for other in (detail.get("RelatedOnetTitles") or {}) if other in by_code][:6],
        "source_url": f"https://www.onetonline.org/link/summary/{code}",
        "added": {"via": "CareerOneStop (O*NET)", "added_at": datetime.now(timezone.utc).isoformat()},
    }


def _zone_text(zone: int | None) -> tuple[str, str]:
    """The official O*NET job zone wording, as already used in the catalog."""

    for career in career_catalog.load_catalog()["careers"]:
        if career.get("job_zone") == zone and career.get("preparation"):
            return career["preparation"], career.get("education_summary", "")

    return "", ""


def _load_store() -> dict:
    path = career_catalog.ADDED_PATH

    if not path.exists():
        return {"careers": [], "facts": {}, "aliases": {}, "rejected": {}, "added_on": {}}

    data = json.loads(path.read_text(encoding="utf-8"))
    data.setdefault("rejected", {})
    data.setdefault("added_on", {})
    return data


def _save_store(data: dict) -> None:
    path = career_catalog.ADDED_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    os.replace(temporary, path)


def _contact_headers() -> dict:
    return {"User-Agent": f"CareerExplorer data refresh (NeoCity Academy; {os.getenv('CIE_DATA_CONTACT_EMAIL', '')})"}


def _bls_typical_education(soc: str) -> str | None:
    """BLS's typical entry-level education for an occupation (sets the job zone)."""

    import httpx

    from scripts import refresh_career_data as refresh

    content = httpx.get(refresh.EDUCATION_URL, headers=_contact_headers(), timeout=60).content
    return (refresh.parse_education(content).get(soc) or {}).get("typical_entry")


def _facts_for(entry: dict) -> dict:
    """Pay, outlook, education, licenses, classes and courses, as refresh_career_data does."""

    import httpx

    from scripts import refresh_career_data as refresh

    headers = _contact_headers()
    soc = refresh.soc_of(entry["onet_code"])
    curated = json.loads(refresh.CURATED.read_text())

    with httpx.Client(headers=headers) as client:
        wages, _ = refresh.fetch_wages(client, [soc], os.getenv("CIE_BLS_API_KEY", ""))
        projections, _ = refresh.parse_projections(client.get(refresh.PROJECTIONS_URL, timeout=60).content)
        education = refresh.parse_education(client.get(refresh.EDUCATION_URL, timeout=60).content)
        learning, _ = refresh.verify_learning(client, curated)
        licenses = refresh.fetch_licenses(
            client,
            [entry],
            os.getenv("CIE_CAREERONESTOP_USER_ID", ""),
            os.getenv("CIE_CAREERONESTOP_TOKEN", ""),
        )

    subjects = entry["subjects"][:3]

    return {
        "soc": soc,
        "wages": {area: wages.get(soc, {}).get(area) or None for area in refresh.AREAS},
        "outlook": projections.get(soc),
        "education": education.get(soc),
        "ap_courses": list(dict.fromkeys(name for subject in subjects for name in learning["ap_courses"].get(subject, [])[:2]))[:4],
        "learning": list({item["url"]: item for subject in subjects for item in learning["resources"].get(subject, [])}.values())[:3]
        or learning["general"][:2],
        "licenses": licenses.get(entry["slug"], []),
    }


def build_variant(parent: dict, title: str) -> dict:
    """
    A page for an official job title that belongs to an occupation we have:
    "AI Engineer" within Computer and Information Research Scientists. Its
    data is the occupation's, and the page says so.
    """

    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:80]

    if slug in career_catalog.load_catalog()["by_slug"]:
        slug = f"{slug}-{parent['onet_code'][:7]}"

    return {
        **{key: value for key, value in parent.items() if key not in ("added",)},
        "slug": slug,
        "title": title,
        "variant_of": parent["slug"],
        # Other names for it: the occupation's, not this page's own title.
        "sample_titles": [name for name in dict.fromkeys([parent["title"], *parent.get("sample_titles", [])]) if name.lower() != title.lower()][:6],
        "related": list(dict.fromkeys([parent["slug"], *parent.get("related", [])]))[:6],
        "official_note": (
            f"In U.S. Department of Labor job data, {title} is a job title within "
            f"{parent['title']}. Pay, job outlook, tasks and education here are for that occupation."
        ),
        "added": {"via": "O*NET job titles", "added_at": datetime.now(timezone.utc).isoformat()},
    }


async def _add_occupation(code: str, store: dict) -> dict | None:
    """A whole new O*NET occupation from CareerOneStop, with all its facts."""

    detail = await careeronestop.details(code)

    if not detail:
        return None

    from scripts import refresh_career_data as refresh

    bls_education = await asyncio.to_thread(_bls_typical_education, refresh.soc_of(code))
    entry = build_entry(detail, bls_education)
    facts = await asyncio.to_thread(_facts_for, entry)

    store["careers"].append(entry)
    store["facts"][entry["slug"]] = facts
    _save_store(store)
    career_catalog.reload_catalog()
    logger.info("Career added: %s (%s)", entry["title"], code)

    # Quiz activities too, so a goal of this career gets the focused quiz.
    from app.services import field_quiz

    try:
        await field_quiz.ensure_items(entry)
    except Exception:
        logger.exception("Quiz activities for %s failed; the quiz will retry", entry["slug"])

    return entry


def _count_today(store: dict) -> bool:
    """Count one addition; False when today's cap is already reached."""

    today = datetime.now(timezone.utc).date().isoformat()

    if store["added_on"].get(today, 0) >= MAX_ADDITIONS_PER_DAY:
        return False

    store["added_on"][today] = store["added_on"].get(today, 0) + 1
    return True


async def ensure_career(text: str) -> dict:
    """Make sure the career a student named has a page. See module docstring."""

    phrase = clean_phrase(text)

    if not looks_like_a_job(phrase):
        return {"result": "rejected", "reason": "not a job title"}

    catalog = career_catalog.load_catalog()
    wanted = career_catalog.normalize_title(phrase)

    if phrase in catalog["aliases"]:
        return {"result": "existing", "slug": catalog["aliases"][phrase]}

    for career in catalog["careers"]:
        if career_catalog.normalize_title(career["title"]) == wanted:
            return {"result": "existing", "slug": career["slug"]}

    # Validation: only official O*NET job titles get a page.
    official = career_catalog.official_titles(phrase)

    if not official:
        named = career_catalog.named_careers(phrase)

        if named:
            # Not an official title, but it names a career we have ("biology teacher").
            return {"result": "existing", "slug": named[0]}

        return {"result": "rejected", "reason": "not an official job title"}

    async with _lock:
        store = _load_store()

        if phrase in store["aliases"]:
            return {"result": "existing", "slug": store["aliases"][phrase]}

        by_code = career_catalog.load_catalog()["by_code"]
        # Prefer an occupation we already have; otherwise the most reported.
        choice = next((item for item in official if item["code"] in by_code), official[0])
        parent = by_code.get(choice["code"])

        try:
            if parent is None:
                if not _count_today(store):
                    return {"result": "rejected", "reason": "daily limit"}

                parent = await _add_occupation(choice["code"], store)

                if parent is None:
                    return {"result": "rejected", "reason": "no official details"}

                store = _load_store()
        except CareerOneStopError as exc:
            logger.warning("Career lookup failed for %r: %s", phrase, exc)
            return {"result": "rejected", "reason": "lookup failed"}

        if career_catalog.normalize_title(parent["title"]) == wanted:
            store["aliases"][phrase] = parent["slug"]
            _save_store(store)
            career_catalog.reload_catalog()
            return {"result": "added", "slug": parent["slug"]}

        # Its own page, built on the occupation it officially belongs to.
        title = choice["title"]

        for career in career_catalog.load_catalog()["careers"]:
            if career.get("variant_of") and career_catalog.normalize_title(career["title"]) == career_catalog.normalize_title(title):
                store["aliases"][phrase] = career["slug"]
                _save_store(store)
                career_catalog.reload_catalog()
                return {"result": "existing", "slug": career["slug"]}

        if not _count_today(store):
            store["aliases"][phrase] = parent["slug"]
            _save_store(store)
            career_catalog.reload_catalog()
            return {"result": "alias", "slug": parent["slug"]}

        variant = build_variant(parent, title)
        store["careers"].append(variant)
        store["aliases"][phrase] = variant["slug"]
        _save_store(store)
        career_catalog.reload_catalog()
        logger.info("Career page added: %s (within %s)", title, parent["title"])

        return {"result": "added", "slug": variant["slug"], "variant_of": parent["slug"]}


# Background additions keep a reference so they aren't garbage-collected.
_pending: set[asyncio.Task] = set()


def ensure_in_background(phrases: list[str]) -> None:
    """Fire-and-forget: used after a reply or a profile save, never blocking them."""

    for phrase in dict.fromkeys(phrase for phrase in phrases if phrase and phrase.strip()):
        task = asyncio.create_task(_quietly(phrase))
        _pending.add(task)
        task.add_done_callback(_pending.discard)


async def ensure_within(text: str, seconds: float) -> dict:
    """Wait up to `seconds` for the answer; the lookup itself always finishes."""

    task = asyncio.create_task(_quietly(text))
    _pending.add(task)
    task.add_done_callback(_pending.discard)

    try:
        return await asyncio.wait_for(asyncio.shield(task), timeout=seconds) or {"result": "rejected"}
    except asyncio.TimeoutError:
        return {"result": "pending"}


async def _quietly(phrase: str) -> dict | None:
    try:
        return await ensure_career(phrase)
    except Exception:
        logger.exception("Adding career %r failed", phrase)
        return None
