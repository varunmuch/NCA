"""
Community service hours: where a student can earn them near NeoCity
(app/data/service_places.json), how many they have, and how close they are
to the Bright Futures targets.

Students log each visit (place, hours, date). Logging adds to the total the
rest of the app uses (Bright Futures, plans, the counselor), and removing an
entry takes it away again.
"""

import json
import re
import uuid
from datetime import date
from functools import lru_cache
from pathlib import Path

from app.services import student_record
from app.services.student_service import get_profile_dict, save_profile_dict

PATH = Path(__file__).resolve().parents[1] / "data" / "service_places.json"
MAX_ENTRY_HOURS = 200
MAX_LOG = 300

# Words in a goal or interests that point to a kind of place.
TAG_WORDS = {
    "health": r"health|nurs|doctor|medic|physician|pharm|therap|dent|bio|hospital|patient",
    "animals": r"animal|vet|zoo|wildlife|marine",
    "education": r"teach|educat|tutor|school|coach|counsel",
    "tech": r"software|computer|coding|program|data|ai\b|artificial|machine learning|cyber|web|robot|tech",
    "engineering": r"engineer|robot|build|architect|design",
    "building": r"construct|engineer|architect|build|carpent|electric",
    "environment": r"environment|ecolog|climate|nature|garden|agri|plant|ocean",
    "arts": r"art|music|design|film|theat|draw|media|photo",
    "food": r"food|chef|culinary|nutrition|hunger",
    "business": r"business|market|financ|account|manag|entrepreneur",
}

TAG_REASONS = {
    "health": "fits your interest in health and helping people",
    "animals": "fits your interest in animals",
    "education": "good for teaching and mentoring",
    "tech": "you can use your tech skills here",
    "engineering": "hands-on building, close to engineering",
    "building": "hands-on building",
    "environment": "fits your interest in the environment",
    "arts": "room for your creative side",
    "food": "helps families get food",
    "business": "work experience close to business",
}


@lru_cache(maxsize=1)
def data() -> dict:
    return json.loads(PATH.read_text(encoding="utf-8"))


def _bright_futures_goals(hours: int) -> list[dict]:
    from app.services import college_match

    rules = college_match.scholarships_data()["state"]["bright_futures"]
    goals = [{"key": level["key"], "name": level["name"], "hours": level["volunteer_hours"]} for level in rules["levels"]]
    goals.append({"key": "GS", "name": "Gold Seal Vocational / CAPE", "hours": data()["district"]["gold_seal_hours"]})

    for goal in goals:
        goal["left"] = max(goal["hours"] - hours, 0)
        goal["met"] = hours >= goal["hours"]

    return sorted(goals, key=lambda goal: -goal["hours"])


def _interest_text(profile: dict, record: dict) -> str:
    parts = [
        profile.get("career_aspiration") or "",
        " ".join(profile.get("interests") or []) if isinstance(profile.get("interests"), list) else str(profile.get("interests") or ""),
        record.get("intended_major") or "",
        " ".join(((record.get("riasec") or {}).get("labels")) or []),
    ]
    return " ".join(parts).lower()


def ranked_places(profile: dict, record: dict) -> list[dict]:
    """Every place, the ones that fit the student's interests first, with why."""

    text = _interest_text(profile, record)
    wanted = [tag for tag, pattern in TAG_WORDS.items() if re.search(pattern, text)]
    places = []

    for index, place in enumerate(data()["places"]):
        matches = [tag for tag in wanted if tag in place["tags"]]
        places.append({**place, "fits": TAG_REASONS[matches[0]] if matches else "", "_score": (len(matches), -index)})

    places.sort(key=lambda place: place["_score"], reverse=True)

    for place in places:
        place.pop("_score")

    return places


async def summary(student_id: str) -> dict:
    profile = await get_profile_dict(student_id)
    record = await student_record.build_record(student_id, profile)
    told = profile.get("academic_profile") or {}
    hours = record.get("service_hours") or 0
    log = sorted(told.get("service_log") or [], key=lambda entry: entry.get("date", ""), reverse=True)
    logged = sum(entry.get("hours", 0) for entry in log)

    return {
        "total": hours,
        "source": record.get("service_hours_source") or "",
        "paid_hours": record.get("paid_work_hours"),
        "logged": logged,
        "log": log,
        "goals": _bright_futures_goals(hours),
        "district": data()["district"],
        "places": ranked_places(profile, record),
        "retrieved": data()["retrieved"],
    }


def place_name(text: str) -> str:
    """A known place's full name, if the text names one ("the library" -> Teen Ambassadors)."""

    lowered = text.lower().strip()

    if not lowered:
        return ""

    for place in data()["places"]:
        name = place["name"].lower()
        short = name.split(":")[0].split("(")[0].strip()

        if lowered in name or short in lowered or (len(lowered) >= 5 and lowered in short):
            return place["name"]

    if "librar" in lowered:
        return data()["places"][0]["name"]

    return text.strip()[:120]


async def add_entry(student_id: str, hours: float, place: str, when: str = "", note: str = "") -> dict:
    hours = round(float(hours), 1)

    if not 0 < hours <= MAX_ENTRY_HOURS:
        raise ValueError(f"Hours must be between 0 and {MAX_ENTRY_HOURS}.")

    profile = await get_profile_dict(student_id)
    record = await student_record.build_record(student_id, profile)
    told = dict(profile.get("academic_profile") or {})
    entry = {
        "id": uuid.uuid4().hex[:12],
        "place": place_name(place) or "Community service",
        "hours": hours,
        "date": when if re.fullmatch(r"\d{4}-\d{2}-\d{2}", when or "") else date.today().isoformat(),
        "note": note.strip()[:200],
    }
    told["service_log"] = ((told.get("service_log") or []) + [entry])[-MAX_LOG:]
    # The total starts from what we knew (their resume or what they told us).
    told["service_hours"] = int(round((record.get("service_hours") or 0) + hours))
    await save_profile_dict(student_id, {"academic_profile": told})

    return entry


async def remove_entry(student_id: str, entry_id: str) -> dict | None:
    profile = await get_profile_dict(student_id)
    record = await student_record.build_record(student_id, profile)
    told = dict(profile.get("academic_profile") or {})
    log = told.get("service_log") or []
    entry = next((item for item in log if item.get("id") == entry_id), None)

    if not entry:
        return None

    told["service_log"] = [item for item in log if item.get("id") != entry_id]
    told["service_hours"] = max(int(round((record.get("service_hours") or 0) - entry.get("hours", 0))), 0)
    await save_profile_dict(student_id, {"academic_profile": told})

    return entry


def parse_log_value(value: str) -> tuple[float, str] | None:
    """The counselor's "5 | Osceola Library" (hours | place) action value."""

    match = re.match(r"\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)?\s*[|:,-]?\s*(.*)$", value or "", re.IGNORECASE)

    if not match:
        return None

    hours = float(match.group(1))

    return (hours, match.group(2).strip()) if 0 < hours <= MAX_ENTRY_HOURS else None


def places_text() -> str:
    """The places as the counselor sees them."""

    return "\n".join(
        f"- {place['name']} ({place['city']}): {place['what']}" + (f" {place['ages']}" if place["ages"] else "") + f" {place['url']}"
        for place in data()["places"]
    ) + "\nTo count for Bright Futures, the district's proposal form must be approved at school before they start; the student logs hours in My Path, Community hours."
