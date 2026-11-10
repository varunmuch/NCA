"""
The classes NeoCity Academy offers, from app/data/neocity_courses.json.

The app is the student's counselor, so plans never say "ask your counselor
about classes": they name a real class from this catalog. Plans, the
Classes tab and the counselor pick only from it. Dual enrollment and
Florida Virtual School are added as the ways to take a class the school
doesn't teach.
"""

import json
import logging
import re
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

PATH = Path(__file__).resolve().parents[1] / "data" / "neocity_courses.json"

# Other ways NeoCity students take classes the school doesn't teach.
EXTRA_OPTIONS = [
    {
        "name": "Dual enrollment at Valencia College",
        "level": "Dual enrollment",
        "area": "",
        "grades": [],
        "follows": [],
        "certifications": [],
        "description": "Take a free college class for both high school and college credit through NeoCity's dual enrollment program.",
    },
    {
        "name": "Online course on Florida Virtual School (FLVS)",
        "level": "Online",
        "area": "",
        "grades": [],
        "follows": [],
        "certifications": [],
        "description": "A free online class from Florida Virtual School, for a subject NeoCity doesn't offer.",
    },
]

ADVANCED = {"AP", "AICE", "Honors", "Dual enrollment"}
STOP = {"and", "the", "of", "in", "&"}


@lru_cache(maxsize=1)
def _data() -> dict:
    if not PATH.exists():
        logger.warning("School course catalog %s is missing", PATH)
        return {"courses": []}

    return json.loads(PATH.read_text(encoding="utf-8"))


def courses() -> list[dict]:
    """The school's classes, then the extra ways to take one."""

    return list(_data().get("courses") or []) + EXTRA_OPTIONS


def offered() -> bool:
    return bool(_data().get("courses"))


def _tokens(name: str) -> set[str]:
    text = name.lower().replace("united states", "us").replace("u.s.", "us")
    return {word for word in re.findall(r"[a-z0-9]+", text) if word not in STOP}


def find(name: str) -> dict | None:
    """The catalog class a name refers to ("AP Calculus AB" is "AP Calculus AB & BC")."""

    if not name:
        return None

    wanted = _tokens(name)
    best, best_gap = None, None

    for course in courses():
        have = _tokens(course["name"])

        if have == wanted:
            return course

        if have and wanted and (have <= wanted or wanted <= have):
            # "AP" alone or a single shared word isn't the same class.
            if len(have & wanted) < 2:
                continue

            gap = len(have ^ wanted)

            if best_gap is None or gap < best_gap:
                best, best_gap = course, gap

    return best


def name_for(name: str) -> str | None:
    course = find(name)
    return course["name"] if course else None


def kind(name: str) -> str | None:
    course = find(name)
    return course["level"] if course else None


def for_career(suggested: list[str]) -> list[str]:
    """
    Every class, the ones that fit this career first: the school's version
    of the AP classes the College Board suggests for it, then the other
    classes in those subjects, then the rest.
    """

    picked = [found["name"] for found in (find(name) for name in suggested) if found]
    picked = list(dict.fromkeys(picked))
    areas = {find(name)["area"] for name in picked}

    same_area = [course["name"] for course in courses() if course["area"] in areas and course["name"] not in picked]
    rest = [course["name"] for course in courses() if course["name"] not in picked and course["name"] not in same_area]

    return picked + same_area + rest


def mentioned_in(text: str) -> dict | None:
    """The school class a sentence is about: one it names, else an advanced one in the subject it names."""

    lowered = text.lower()
    named = [course for course in courses() if course["name"].lower() in lowered]

    if named:
        return max(named, key=lambda course: len(course["name"]))

    subject = next((course["area"] for course in courses() if course["area"] and course["area"].lower() in lowered), None)
    in_subject = [course for course in courses() if course["area"] == subject]

    return next((course for course in in_subject if course["level"] in ADVANCED), None) or next(iter(in_subject), None)


def is_offered(name: str) -> bool:
    return find(name) is not None


def advanced_in(areas: list[str]) -> list[str]:
    """AP, AICE and honors classes the school offers in these subjects."""

    return [course["name"] for area in areas for course in courses() if course["area"] == area and course["level"] in ADVANCED]


def line(course: dict, with_description: bool = True) -> str:
    details = [course["level"]]

    if course.get("area"):
        details.append(course["area"])

    if course.get("grades"):
        details.append("grade " + ", ".join(grade.replace(" grade", "") for grade in course["grades"]))

    follows = [_by_id().get(item, item) for item in course.get("follows") or []]

    if follows:
        details.append("after " + " or ".join(follows))

    if course.get("certifications"):
        details.append("earns " + " and ".join(course["certifications"]) + " certification")

    text = f"- {course['name']} ({'; '.join(details)})"

    return text + (f": {course['description']}" if with_description and course.get("description") else "")


@lru_cache(maxsize=1)
def _by_id() -> dict[str, str]:
    return {course["id"]: course["name"] for course in _data().get("courses") or []}


def catalog_text(names: list[str] | None = None, with_description: bool = False) -> str:
    """The classes as the model sees them (all of them, or just these names)."""

    chosen = courses() if names is None else [course for course in courses() if course["name"] in set(names)]

    if names is not None:
        order = {name: index for index, name in enumerate(names)}
        chosen.sort(key=lambda course: order.get(course["name"], len(order)))

    return "\n".join(line(course, with_description) for course in chosen)


def describe(pathway_courses: list[dict]) -> list[dict]:
    """Add the school's description and certifications to each class in a plan."""

    for item in pathway_courses or []:
        course = find(item.get("course", ""))

        if course:
            item["course"] = course["name"]
            item["description"] = course.get("description", "")
            item["certifications"] = course.get("certifications") or []

    return pathway_courses


# Steps that send the student to a counselor about classes: the app IS the counselor.
ASK_COUNSELOR = re.compile(
    r"\b(ask|talk to|talk with|meet with|check with|see|speak (to|with)|email)\s+(your|a|the)\s+(school\s+|guidance\s+)?counsel+or\b",
    re.IGNORECASE,
)


def sends_to_counselor(text: str) -> bool:
    return bool(ASK_COUNSELOR.search(text or ""))
