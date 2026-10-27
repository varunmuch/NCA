"""
Majors, colleges and scholarships fitted to one student, from official data.

- Majors: the 4-digit fields (CIP) Florida colleges report to College
  Scorecard. Each gets an interest profile (RIASEC) from the careers it
  leads to, through the NCES CIP-SOC crosswalk and O*NET interests.
- Colleges: a reach, match or likely label from the student's SAT/ACT
  against the college's middle 50%, its admit rate, and GPA. It's an
  estimate and says so.
- Scholarships: Bright Futures (state rules, checked against the record)
  and each college's own awards, collected from its website.

Labels set realistic targets; they never tell a student not to apply.
"""

import json
import math
import re
from functools import lru_cache
from pathlib import Path

from app.services import career_catalog

DATA = Path(__file__).resolve().parents[1] / "data"

RIASEC = ["Realistic", "Investigative", "Artistic", "Social", "Enterprising", "Conventional"]

# Fields that are not majors a high school student would pick.
SKIP_CIP2 = {"32", "33", "34", "35", "36", "37", "53"}
GRADUATE_ONLY = re.compile(r"Advanced/Graduate|Residency|Residencies|Medicine \(MD\)|Dentistry \(DDS|Law\.?$", re.IGNORECASE)


@lru_cache(maxsize=1)
def _colleges() -> dict:
    return json.loads((DATA / "florida_colleges.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _crosswalk() -> dict:
    return json.loads((DATA / "soc_cip.json").read_text(encoding="utf-8"))["data"]


@lru_cache(maxsize=1)
def scholarships_data() -> dict:
    return json.loads((DATA / "college_scholarships.json").read_text(encoding="utf-8"))


def colleges() -> list[dict]:
    return _colleges()["data"]


def college(college_id: str) -> dict | None:
    return next((item for item in colleges() if item["id"] == college_id), None)


@lru_cache(maxsize=1)
def majors_catalog() -> dict[str, dict]:
    """Every field Florida colleges offer: title, careers, interest profile, colleges."""

    titles: dict[str, str] = {}
    offered: dict[str, dict] = {}

    for item in colleges():
        for cip4, programs in item["programs"].items():
            titles.setdefault(cip4, programs[0]["title"])
            entry = offered.setdefault(cip4, {"colleges": 0, "bachelors": 0})
            entry["colleges"] += 1
            entry["bachelors"] += any(program["credential"] == "Bachelor's" for program in programs)

    careers_by_soc: dict[str, list[dict]] = {}

    for career in career_catalog.load_catalog()["careers"]:
        careers_by_soc.setdefault(career["onet_code"].split(".")[0], []).append(career)

    profiles: dict[str, dict[str, float]] = {}
    career_links: dict[str, list[str]] = {}
    subjects: dict[str, dict[str, int]] = {}

    for soc, majors in _crosswalk().items():
        for career in careers_by_soc.get(soc, []):
            for major in majors:
                cip4 = major["cip"].replace(".", "")[:4]

                if cip4 not in offered:
                    continue

                vector = profiles.setdefault(cip4, {kind: 0.0 for kind in RIASEC})

                for weight, kind in zip((3, 2, 1), career.get("interests") or []):
                    if kind in vector:
                        vector[kind] += weight

                links = career_links.setdefault(cip4, [])

                if career["slug"] not in links:
                    links.append(career["slug"])

                counts = subjects.setdefault(cip4, {})

                for subject in career.get("subjects") or []:
                    counts[subject] = counts.get(subject, 0) + 1

    catalog = {}

    for cip4, title in titles.items():
        if cip4[:2] in SKIP_CIP2 or not offered[cip4]["bachelors"] or GRADUATE_ONLY.search(title):
            continue

        vector = profiles.get(cip4)
        total = sum(vector.values()) if vector else 0
        catalog[cip4] = {
            "cip": f"{cip4[:2]}.{cip4[2:]}",
            "cip4": cip4,
            "title": title,
            "riasec": {kind: round(value / total, 3) for kind, value in vector.items()} if total else {},
            "careers": career_links.get(cip4, [])[:8],
            "subjects": [name for name, _ in sorted(subjects.get(cip4, {}).items(), key=lambda item: -item[1])][:5],
            "florida_colleges": offered[cip4]["colleges"],
            "florida_bachelors": offered[cip4]["bachelors"],
        }

    return catalog


def _words(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z]{3,}", text.lower()) if word not in {"and", "the", "general", "other", "studies", "science", "sciences"}}


def find_major(text: str) -> dict | None:
    """The catalog field closest to what the student typed ('nursing', 'computer science')."""

    wanted = _words(text)

    if not wanted:
        return None

    best = None
    best_score = 0.0

    for major in majors_catalog().values():
        title_words = _words(major["title"])

        if not title_words:
            continue

        overlap = len(wanted & title_words)
        # Also match the careers a major leads to ("engineer" -> engineering).
        stems = {word[:6] for word in title_words}
        overlap += 0.5 * len({word[:6] for word in wanted} & stems - {word[:6] for word in wanted & title_words})
        score = overlap / math.sqrt(len(title_words)) + 0.001 * major["florida_bachelors"]

        if score > best_score:
            best, best_score = major, score

    return best if best_score >= 0.5 else None


def interest_fit(scores: dict[str, int], major: dict) -> float:
    """0-1: how close the student's RIASEC scores are to the major's profile."""

    profile = major.get("riasec") or {}

    if not scores or not profile:
        return 0.0

    student = [scores.get(kind, 0) / 100 for kind in RIASEC]
    target = [profile.get(kind, 0) for kind in RIASEC]
    mean_s = sum(student) / 6
    mean_t = sum(target) / 6
    numerator = sum((a - mean_s) * (b - mean_t) for a, b in zip(student, target))
    denominator = math.sqrt(sum((a - mean_s) ** 2 for a in student) * sum((b - mean_t) ** 2 for b in target))

    return (numerator / denominator + 1) / 2 if denominator else 0.5


AREA_TO_SUBJECTS = {
    "Math": {"Math"},
    "Science": {"Biology", "Chemistry", "Physics", "Health Science", "Agriculture"},
    "Computer science": {"Computer Science", "Technical Education"},
    "Engineering": {"Engineering & Technology", "Physics", "Technical Education"},
    "English": {"English", "Journalism & Media"},
    "Social studies": {"Psychology", "Government & Civics", "Economics", "Social Studies", "Geography", "History"},
    "World language": set(),
    "Arts": {"Art & Design", "Art & Music"},
    "Business": {"Business", "Economics"},
    "Health & PE": {"Health Science"},
}


def rank_majors(record: dict, limit: int = 30) -> list[dict]:
    """Candidate majors for the model: interest fit, strong subjects, and what the student said."""

    scores = (record.get("riasec") or {}).get("scores") or {}
    strong = set()

    for area in (record.get("academics") or {}).get("strong_areas") or []:
        strong |= AREA_TO_SUBJECTS.get(area, set())

    told = " ".join(
        [
            record.get("intended_major", ""),
            record.get("interests_told", ""),
            " ".join((record.get("resume") or {}).get("activities") or []),
            " ".join((record.get("resume") or {}).get("projects") or []),
        ]
    )
    told_words = _words(told)
    ranked = []

    for major in majors_catalog().values():
        fit = interest_fit(scores, major)
        subject_fit = len(strong & set(major["subjects"])) / max(1, min(3, len(major["subjects"]))) if strong else 0
        mention = 1.0 if told_words & _words(major["title"]) else 0.0
        score = 0.55 * fit + 0.25 * subject_fit + 0.2 * mention + 0.02 * math.log1p(major["florida_bachelors"])
        ranked.append({**major, "interest_fit": round(100 * fit), "score": score})

    ranked.sort(key=lambda item: -item["score"])

    return ranked[:limit]


def rank_minors(record: dict, exclude: set[str], limit: int = 20) -> list[dict]:
    """Minors come from the interest quiz: the fields closest to the student's RIASEC type."""

    scores = (record.get("riasec") or {}).get("scores") or {}
    ranked = [
        {**major, "interest_fit": round(100 * interest_fit(scores, major))}
        for major in majors_catalog().values()
        if major["cip4"] not in exclude and major["riasec"]
    ]
    ranked.sort(key=lambda item: (-item["interest_fit"], -item["florida_bachelors"]))

    return ranked[:limit]


# Reach / match / likely.

ACT_TO_SAT = {36: 1590, 35: 1540, 34: 1500, 33: 1460, 32: 1430, 31: 1400, 30: 1370, 29: 1340, 28: 1310, 27: 1280, 26: 1240, 25: 1210, 24: 1180, 23: 1140, 22: 1110, 21: 1080, 20: 1040, 19: 1010, 18: 970, 17: 930, 16: 890, 15: 850}


def _student_sat(tests: dict) -> int | None:
    """The student's best score on the SAT scale (ACT converted with the College Board concordance)."""

    sat = tests.get("sat")
    act = tests.get("act")
    converted = ACT_TO_SAT.get(int(act)) if act else None

    return max(score for score in (sat, converted) if score) if (sat or converted) else None


def _range(admissions: dict, percentile: str) -> int | None:
    """A college's SAT percentile, or its ACT percentile on the SAT scale."""

    if admissions.get(f"sat_{percentile}"):
        return admissions[f"sat_{percentile}"]

    act = admissions.get(f"act_{percentile}")

    return ACT_TO_SAT.get(int(act)) if act else None


# How strongly a score or GPA moves the odds. Kept modest on purpose: public
# data can't see essays, activities, intended major or the applicant pool.
SCORE_WEIGHT = 0.9
GPA_STEPS = [(3.9, 0.35), (3.7, 0.15), (3.4, 0.0), (3.0, -0.45), (0.0, -0.9)]


def _odds(p: float) -> float:
    return p / (1 - p)


def _probability(odds: float) -> float:
    return odds / (1 + odds)


def _gpa_shift(gpa: float) -> float:
    return next(shift for floor, shift in GPA_STEPS if gpa >= floor)


def fit_label(item: dict, record: dict) -> dict:
    """
    An estimated admission chance for one college, its reach/match/likely
    label, and how we got there, in plain words.

    Start from the college's admit rate. Move it by where the student's
    SAT (or ACT on the SAT scale) sits among admitted students: the middle
    50% range gives a center and spread. Then a small step for GPA. Clamp
    to 3-95%: no estimate from public data should sound certain.
    """

    name = item.get("name", "This college")
    admissions = item.get("admissions") or {}
    rate = admissions.get("admit_rate")
    gpa = (record.get("academics") or {}).get("gpa_unweighted")
    sat = _student_sat(record.get("tests") or {})
    low = _range(admissions, "25")
    high = _range(admissions, "75")

    if rate is None:
        return {
            "label": "Likely",
            "chance": None,
            "reason": "Open admission: students with a high school diploma can enroll.",
            "explanation": [f"{name} has open admission for most programs, so there's no admission percentage. Some programs (like nursing) have their own requirements."],
            "estimate": False,
            "confidence": "high",
        }

    explanation = [f"Starts from {name}'s admit rate: about {rate}% of applicants get in."]
    odds = _odds(min(max(rate, 1), 99) / 100)
    used = []

    if sat and low and high and high > low:
        center = (low + high) / 2
        spread = (high - low) / 1.349
        z = (sat - center) / spread
        odds *= math.exp(SCORE_WEIGHT * z)
        used.append("score")
        where = (
            "above the middle 50%" if sat > high else "below the middle 50%" if sat < low else "inside the middle 50%"
        )
        effect = "raises" if z > 0.15 else "lowers" if z < -0.15 else "barely changes"
        explanation.append(f"Your score ({sat} on the SAT scale) is {where} of admitted students ({low}-{high}), which {effect} the estimate.")
    elif low and high:
        explanation.append(f"No SAT or ACT score yet. Admitted students' middle 50% is {low}-{high}; adding yours makes this much more accurate.")

    if gpa is not None:
        shift = _gpa_shift(gpa)
        odds *= math.exp(shift)
        used.append("gpa")
        effect = "adds a little" if shift > 0 else "takes a little off" if shift < 0 else "keeps it about the same"
        explanation.append(f"Your unweighted GPA ({gpa:.2f}, calculated from your transcript) {effect}.")
    else:
        explanation.append("No transcript yet, so your GPA isn't counted.")

    chance = round(100 * _probability(odds))
    ceiling = min(95, round(rate * 2.2)) if rate < 25 else 95
    chance = max(3, min(chance, ceiling))

    if rate < 25:
        explanation.append(f"Capped at {ceiling}% because {name} turns away most applicants, even very strong ones.")

    label = "Likely" if chance >= 70 else "Match" if chance >= 35 else "Reach"
    confidence = "medium" if used == ["score", "gpa"] else "low"
    explanation.append(
        "A rough estimate from public College Scorecard data, not a prediction: essays, activities, your intended major and who else applies also matter."
    )

    reason = {
        "Reach": f"About {chance}% estimated chance: worth applying, but have matches too.",
        "Match": f"About {chance}% estimated chance: your record fits the students it admits.",
        "Likely": f"About {chance}% estimated chance: your record is above most admitted students.",
    }[label]

    return {
        "label": label,
        "chance": chance,
        "reason": reason,
        "explanation": explanation,
        "estimate": True,
        "confidence": confidence,
    }


def colleges_for_majors(cip4s: list[str], record: dict, limit: int = 12) -> list[dict]:
    """Florida colleges with a bachelor's program in the chosen majors, labeled and with scholarships."""

    wanted = [cip4 for cip4 in cip4s if cip4]
    found = _colleges_offering(wanted, record)

    # Colleges file the same major under sibling codes (UCF reports computer
    # science as 11.01, not 11.07), so include the field's close siblings.
    family = {cip4[:2] for cip4 in wanted}
    related = [code for code, major in majors_catalog().items() if code[:2] in family and code not in wanted and _related(major["title"], wanted)]
    names = {card["id"] for card in found}
    found += [card for card in _colleges_offering(related, record) if card["id"] not in names]

    order = {"Reach": 0, "Match": 1, "Likely": 2}

    def rank(card: dict) -> tuple:
        public = card["ownership"] == "Public"
        return (not public, not card["scholarships"], -(card["students"] or 0))

    found.sort(key=rank)
    # A balanced list: some of each label, public universities first.
    picked: list[dict] = []

    for label in ("Match", "Reach", "Likely"):
        picked += [card for card in found if card["fit"]["label"] == label][: limit // 3 + (1 if label == "Match" else 0)]

    picked += [card for card in found if card not in picked][: max(0, limit - len(picked))]
    picked.sort(key=lambda card: (order[card["fit"]["label"]], card["ownership"] != "Public"))

    return picked[:limit]


def _related(title: str, wanted: list[str]) -> bool:
    """A sibling field that shares a word with a wanted one (computer science ~ computer and information sciences)."""

    catalog = majors_catalog()
    words = set().union(*(_words(catalog[code]["title"]) for code in wanted if code in catalog)) if wanted else set()

    return bool(words & _words(title))


def _colleges_offering(wanted: list[str], record: dict) -> list[dict]:
    found = []

    for item in colleges():
        programs = [
            {**program, "cip4": cip4}
            for cip4 in wanted
            for program in item["programs"].get(cip4, [])
            if program["credential"] == "Bachelor's"
        ]

        if not programs:
            continue

        found.append(college_card(item, record, programs))

    return found


def college_card(item: dict, record: dict, programs: list[dict] | None = None) -> dict:
    return {
        **{key: item[key] for key in ("id", "name", "city", "ownership", "kind", "url", "net_price", "graduation_rate", "students")},
        "admissions": item.get("admissions") or {},
        "programs": (programs or [])[:3],
        "fit": fit_label(item, record),
        "scholarships": college_scholarships(item["id"]),
    }


def college_scholarships(college_id: str) -> dict | None:
    entry = scholarships_data()["colleges"].get(college_id)

    if not entry:
        return None

    return {**entry, "retrieved": scholarships_data()["retrieved"]}


def bright_futures(record: dict) -> dict:
    """Where the student stands on each Bright Futures level, as far as their records show."""

    rules = scholarships_data()["state"]["bright_futures"]
    academics = record.get("academics") or {}
    gpa = academics.get("gpa_bright_futures")
    tests = record.get("tests") or {}
    hours = record.get("service_hours")
    paid = record.get("paid_work_hours")
    levels = []

    for level in rules["levels"]:
        checks = []

        if gpa is None:
            checks.append({"item": f"Weighted GPA {level['weighted_gpa']:.2f}", "status": "unknown", "note": "Upload your transcript."})
        else:
            checks.append(
                {
                    "item": f"Weighted GPA {level['weighted_gpa']:.2f}",
                    "status": "met" if gpa >= level["weighted_gpa"] else "not_yet",
                    "note": f"Your estimate: {gpa:.2f}",
                }
            )

        sat = tests.get("sat")
        act = tests.get("act")

        if not sat and not act:
            checks.append({"item": f"SAT {level['sat']} or ACT {level['act']} (or CLT {level['clt']})", "status": "unknown", "note": "Add your scores."})
        else:
            met = bool((sat and sat >= level["sat"]) or (act and act >= level["act"]))
            yours = ", ".join(part for part in [f"SAT {sat}" if sat else "", f"ACT {act}" if act else ""] if part)
            checks.append({"item": f"SAT {level['sat']} or ACT {level['act']} (or CLT {level['clt']})", "status": "met" if met else "not_yet", "note": f"Yours: {yours}"})

        hours_needed = level["volunteer_hours"]

        if hours is None and paid is None:
            checks.append({"item": f"{hours_needed} volunteer hours (or 100 paid work hours)", "status": "unknown", "note": "Add your hours."})
        else:
            total = (hours or 0) + (paid or 0)
            met = (hours or 0) >= hours_needed or (paid or 0) >= level["paid_hours"] or total >= 100
            checks.append(
                {
                    "item": f"{hours_needed} volunteer hours (or 100 paid work hours)",
                    "status": "met" if met else "not_yet",
                    "note": f"Yours: {hours or 0} service hours" + (f", {paid} paid" if paid else ""),
                }
            )

        statuses = {check["status"] for check in checks}
        overall = "on_track" if statuses == {"met"} else "unknown" if "not_yet" not in statuses else "not_yet"
        levels.append({"key": level["key"], "name": level["name"], "status": overall, "checks": checks})

    best = next((level for level in levels if level["status"] == "on_track"), None)

    if best:
        summary = f"On track for {best['name']} by GPA, test score and hours (the 16 required courses still need checking with your school counselor)."
    elif all(level["status"] == "unknown" for level in levels):
        summary = "Not enough information yet to check."
    else:
        gaps = [check["item"] for check in levels[-1]["checks"] if check["status"] == "not_yet"]
        unknown = [check["item"].split(" (")[0] for check in levels[-1]["checks"] if check["status"] == "unknown"]
        summary = (f"Not yet meeting {', '.join(gaps)} for {levels[-1]['name']}." if gaps else "") + (
            f" Still needs checking: {', '.join(unknown)}." if unknown else ""
        )
        summary = summary.strip()

    return {
        "name": rules["name"],
        "url": rules["url"],
        "source": rules["source"],
        "common": rules["common"],
        "changes": rules["changes"],
        "levels": levels,
        "summary": summary,
    }


def sources_text(record: dict, cards: list[dict]) -> str:
    """Facts the model may cite about colleges and scholarships (for prompts and grounding)."""

    lines = []
    bright = record.get("bright_futures") or bright_futures(record)
    rules = scholarships_data()["state"]["bright_futures"]
    lines.append(
        f"{rules['name']} ({rules['source']}): "
        + "; ".join(
            f"{level['name']} needs a {level['weighted_gpa']:.2f} weighted GPA, SAT {level['sat']} or ACT {level['act']} or CLT {level['clt']}, "
            f"and {level['volunteer_hours']} volunteer hours or {level['paid_hours']} paid work hours"
            for level in rules["levels"]
        )
        + f". {rules['hours_rule']} Student's status: {bright['summary']}"
    )

    for card in cards:
        admissions = card.get("admissions") or {}
        parts = [f"{card['name']} ({card['city']}, {card['ownership']} {card['kind']})"]

        if admissions.get("admit_rate") is not None:
            parts.append(f"admits about {admissions['admit_rate']}%")

        if admissions.get("sat_25") and admissions.get("sat_75"):
            parts.append(f"middle 50% SAT {admissions['sat_25']}-{admissions['sat_75']}")

        if admissions.get("act_25") and admissions.get("act_75"):
            parts.append(f"middle 50% ACT {admissions['act_25']}-{admissions['act_75']}")

        fit = card["fit"]
        parts.append(
            f"fit for this student: {fit['label']}"
            + (f", estimated admission chance about {fit['chance']}% (a rough estimate)" if fit.get("chance") is not None else ", open admission")
        )

        if card.get("programs"):
            parts.append("programs: " + ", ".join(f"{program['credential']} in {program['title']}" for program in card["programs"]))

        scholarships = card.get("scholarships")

        if scholarships:
            parts.append(
                "scholarships: "
                + "; ".join(f"{award['name']} ({award['for']})" for award in scholarships["awards"])
                + f". How: {scholarships['how']} Official page: {scholarships['page']}"
            )

        lines.append(". ".join(parts) + ".")

    return "\n".join(lines)


PRAISE = re.compile(
    r"\b(top[- ]tier|top[- ]ranked|highly ranked|prestigious|elite|renowned|world[- ]class|best|excellent|outstanding|"
    r"robust|strong|leading|cutting[- ]edge|well[- ]regarded|well[- ]known|known for|reputable|respected|reputation|acclaimed|"
    r"premier|vibrant|innovative|great choice|ideal)\b",
    re.IGNORECASE,
)
COLLEGE_WORDS = re.compile(r"\b(university|college|campus|school|programs?)\b", re.IGNORECASE)


def strip_college_praise(text: str) -> str:
    """
    Drop sentences that praise a college or program with nothing official
    behind it ("known for its strong engineering program"). Praise of the
    student stays.
    """

    kept_lines = []

    for line in text.split("\n"):
        sentences = re.split(r"(?<=[.!?])\s+", line)
        kept = []

        for sentence in sentences:
            praise = PRAISE.search(sentence) and COLLEGE_WORDS.search(sentence) and not re.search(r"\byou(r)?\b", sentence, re.IGNORECASE)

            if not praise:
                kept.append(sentence)
                continue

            # "**University of Florida** - Known for..." keeps the name.
            head = re.split(r"\s[-\u2013\u2014:]\s|:\s", sentence, maxsplit=1)[0]

            if head != sentence and not PRAISE.search(head):
                kept.append(head.rstrip(" -:") + ".")

        kept_lines.append(" ".join(kept))

    return "\n".join(kept_lines)
