"""
The focused interest quiz: for a student with a career goal, find which
kind of work *within that field* fits them, without leaving the field.

The field is the goal career plus the most similar careers in its family
(at most FIELD_SIZE). Questions are each career's real O*NET tasks,
rewritten once into short activities a teenager can picture
(app/data/field_quiz_items.json, each kept with its source task; added
careers get theirs in storage/catalog/field_quiz_items.json). Results only
ever rank careers in the field.

Parts: rate activities (3 per career), trade-offs between careers, and how
long the student wants to train.
"""

import json
import re
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path

from fastapi import HTTPException

from app.core.llm import chat_json
from app.services import career_catalog, interest_quiz


FIELD_SIZE = 8
RATED_PER_CAREER = 3
MAX_TRADEOFFS = 10

ITEMS_PATH = Path(__file__).resolve().parents[1] / "data" / "field_quiz_items.json"
ADDED_ITEMS_PATH = career_catalog.ADDED_PATH.parent / "field_quiz_items.json"

ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "activities": {
            "type": "array",
            "minItems": 4,
            "maxItems": 4,
            "items": {
                "type": "object",
                "properties": {
                    "task": {"type": "integer"},
                    "text": {"type": "string", "maxLength": 90},
                },
                "required": ["task", "text"],
            },
        }
    },
    "required": ["activities"],
}

ITEM_PROMPT = """You turn real job tasks into short activities a high school student can picture and say whether they'd enjoy.

Pick the 4 tasks that best show what this job is like day to day, and rewrite each one:
- 12 words or fewer, starting with a verb, in plain words a 9th grader knows.
- Keep the meaning of the task; don't make it sound more exciting than it is.
- No job titles, company names, numbers, or jargon.
- task: the number of the task you rewrote.

Output JSON only."""


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"careers": {}}


def items_for(slug: str) -> list[dict]:
    for path in (ITEMS_PATH, ADDED_ITEMS_PATH):
        found = _load(path)["careers"].get(slug)

        if found:
            return found["items"]

    # A title page ("AI Engineer") asks about its occupation's tasks.
    career = career_catalog.get_career(slug)

    if career and career.get("variant_of"):
        return [{**item, "id": item["id"].replace(career["variant_of"], slug, 1)} for item in items_for(career["variant_of"])]

    return []


async def generate_items(career: dict) -> dict:
    """Four activities from the career's O*NET tasks, each linked to its task."""

    tasks = career["tasks"]
    numbered = "\n".join(f"{index}. {task}" for index, task in enumerate(tasks, start=1))
    raw = await chat_json(
        [
            {"role": "system", "content": ITEM_PROMPT},
            {"role": "user", "content": f"Job: {career['title']}\nTasks:\n{numbered}"},
        ],
        schema=ITEM_SCHEMA,
        schema_name="field_quiz_items",
        max_tokens=400,
        temperature=0.2,
    )

    items = []
    seen = set()

    for activity in raw.get("activities", []):
        text = re.sub(r"\s+", " ", activity.get("text", "")).strip().rstrip(".")
        index = activity.get("task")

        if not text or not isinstance(index, int) or not 1 <= index <= len(tasks) or text.lower() in seen:
            continue

        seen.add(text.lower())
        items.append({"id": f"{career['slug']}:{len(items)}", "text": text, "task": tasks[index - 1]})

    if len(items) < 4:
        raise ValueError(f"Only {len(items)} usable activities for {career['slug']}")

    return {"items": items[:4], "reviewed": False}


async def ensure_items(career: dict) -> None:
    """Give an added career its quiz activities (stored outside git)."""

    if items_for(career["slug"]):
        return

    data = _load(ADDED_ITEMS_PATH)
    data["careers"][career["slug"]] = await generate_items(career)
    ADDED_ITEMS_PATH.parent.mkdir(parents=True, exist_ok=True)
    ADDED_ITEMS_PATH.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")


# ------------------------------------------------------------------ field


def _similarity(anchor: dict, other: dict) -> float:
    shared_interests = sum(
        weight for weight, kind in zip((3, 2, 1), anchor["interests"][:3]) if kind in other["interests"][:3]
    )
    shared_subjects = len(set(anchor["subjects"]) & set(other["subjects"]))
    related = 3 if other["slug"] in anchor.get("related", []) or anchor["slug"] in other.get("related", []) else 0
    return shared_interests + shared_subjects + related


def field_for(anchor_slug: str) -> list[dict]:
    """The goal career first, then the most similar careers in its family."""

    catalog = career_catalog.load_catalog()
    anchor = catalog["by_slug"][anchor_slug]
    # Title pages share their occupation's questions, so leave them out (and
    # leave out the anchor's own occupation when the anchor is a title page).
    skip = {anchor_slug, anchor.get("variant_of")}
    others = [
        career
        for career in catalog["careers"]
        if career["family"] == anchor["family"]
        and career["slug"] not in skip
        and not career.get("variant_of")
        and items_for(career["slug"])
    ]
    others.sort(key=lambda career: (-_similarity(anchor, career), career["title"]))
    return [anchor, *others[: FIELD_SIZE - 1]]


def goal_field_slugs(slug: str) -> set[str]:
    """
    The careers that count as "in the field" of a goal: the goal itself, the
    occupation it belongs to (for a title page like AI Engineer), and the
    most similar careers in its family.
    """

    career = career_catalog.get_career(slug)

    if career is None:
        return set()

    slugs = {slug, *(item["slug"] for item in field_for(slug))}

    if career.get("variant_of"):
        slugs.add(career["variant_of"])

    return slugs


def goal_of(profile: dict) -> str:
    return (profile.get("career_aspiration") or "").strip()


def anchor_for(profile: dict) -> str | None:
    """The catalog career the student's goal names, if we have it."""

    goal = goal_of(profile)

    if not goal:
        return None

    phrase = goal.lower()
    aliases = career_catalog.load_catalog()["aliases"]

    if phrase in aliases:
        return aliases[phrase]

    named = career_catalog.named_careers(goal)

    if named:
        return named[0]

    found = career_catalog.search_careers(query=goal)["careers"]
    return found[0]["slug"] if found else None


# -------------------------------------------------------------- questions


def _pairs(count: int) -> list[tuple[int, int]]:
    """Trade-off pairs spread so every career shows up, the goal career most."""

    ordered = sorted(combinations(range(count), 2), key=lambda pair: (pair[1] - pair[0], pair))
    chosen, seen = [], {index: 0 for index in range(count)}

    for pair in ordered:
        if len(chosen) >= MAX_TRADEOFFS:
            break

        if seen[pair[0]] < 3 and seen[pair[1]] < 3:
            chosen.append(pair)
            seen[pair[0]] += 1
            seen[pair[1]] += 1

    return chosen


def questions(profile: dict, anchor_slug: str) -> dict:
    field = field_for(anchor_slug)
    rated = []

    # Interleave careers so the same job doesn't come up three times in a row.
    for round_index in range(RATED_PER_CAREER):
        for career in field:
            items = items_for(career["slug"])

            if len(items) > round_index:
                rated.append({"id": items[round_index]["id"], "text": items[round_index]["text"]})

    tradeoffs = []

    for first, second in _pairs(len(field)):
        a = items_for(field[first]["slug"])[-1]
        b = items_for(field[second]["slug"])[-1]
        tradeoffs.append(
            {
                "id": f"t:{field[first]['slug']}:{field[second]['slug']}",
                "a": {"key": "a", "text": a["text"]},
                "b": {"key": "b", "text": b["text"]},
            }
        )

    return {
        "mode": "field",
        "field": {
            "goal": goal_of(profile),
            "anchor": {"slug": anchor_slug, "title": field[0]["title"]},
            "family_label": career_catalog.family_label(field[0]["family"]),
            "careers": [career["title"] for career in field],
        },
        "activities": {"items": rated, "scale": interest_quiz.ACTIVITY_SCALE},
        "tradeoffs": tradeoffs,
        "training": [
            {"key": key, "label": label, "description": description}
            for key, _, label, description in interest_quiz.TRAINING
        ],
    }


# ---------------------------------------------------------------- scoring


def score(profile: dict, anchor_slug: str, answers: dict) -> dict:
    field = field_for(anchor_slug)
    slugs = {career["slug"] for career in field}
    asked = questions(profile, anchor_slug)
    activities = answers.get("activities") or {}
    tradeoffs = answers.get("tradeoffs") or {}

    if set(activities) != {item["id"] for item in asked["activities"]["items"]}:
        raise HTTPException(status_code=400, detail="Please rate every activity.")

    if any(not isinstance(value, int) or not 1 <= value <= 5 for value in activities.values()):
        raise HTTPException(status_code=400, detail="Ratings must be 1 to 5.")

    if set(tradeoffs) != {item["id"] for item in asked["tradeoffs"]} or any(value not in ("a", "b") for value in tradeoffs.values()):
        raise HTTPException(status_code=400, detail="Please answer every trade-off.")

    training = answers.get("training") or "unsure"
    zone = next((zone for key, zone, *_ in interest_quiz.TRAINING if key == training), None)
    text_by_id = {item["id"]: item["text"] for item in asked["activities"]["items"]}

    ratings: dict[str, list[int]] = {slug: [] for slug in slugs}
    liked: dict[str, list[str]] = {slug: [] for slug in slugs}

    for item_id, value in activities.items():
        slug = item_id.rsplit(":", 1)[0]
        ratings[slug].append(value)

        if value >= 4:
            liked[slug].append(text_by_id[item_id])

    wins = {slug: 0 for slug in slugs}
    shown = {slug: 0 for slug in slugs}

    for item_id, choice in tradeoffs.items():
        _, first, second = item_id.split(":")
        shown[first] += 1
        shown[second] += 1
        wins[first if choice == "a" else second] += 1

    scores = {}

    for career in field:
        slug = career["slug"]
        rating = sum(value - 1 for value in ratings[slug]) / (4 * len(ratings[slug])) if ratings[slug] else 0
        choice = wins[slug] / shown[slug] if shown[slug] else rating
        fit = 0.6 * rating + 0.4 * choice

        if zone and career.get("job_zone"):
            gap = abs(career["job_zone"] - zone)
            fit = 0.85 * fit + 0.15 * (1.0 if gap == 0 else 0.5 if gap == 1 else 0.0)

        scores[slug] = round(100 * fit)

    return {
        "goal": goal_of(profile),
        "anchor": anchor_slug,
        "field": [career["slug"] for career in field],
        "scores": scores,
        "liked": {slug: texts[:2] for slug, texts in liked.items()},
        "training": training,
        "taken_at": datetime.now(timezone.utc).isoformat(),
    }


def result_payload(profile: dict) -> dict | None:
    """The saved focused-quiz result, ranked, with official pay and education."""

    from app.services.plan_service import career_card

    saved = profile.get("field_quiz") or {}

    if not saved.get("scores"):
        return None

    ranked = sorted(saved["scores"].items(), key=lambda item: -item[1])
    careers = []

    for slug, fit in ranked:
        reasons = saved.get("liked", {}).get(slug) or []
        card = career_card(slug, "")

        if card:
            careers.append(
                {
                    **card,
                    "match_score": fit,
                    "match_reasons": [f"You'd enjoy: {text.lower()}" for text in reasons] or ["A part of this field worth a look"],
                    "is_goal": slug == saved.get("anchor"),
                }
            )

    anchor = career_catalog.get_career(saved.get("anchor", ""))

    return {
        "goal": saved.get("goal", ""),
        "anchor": {"slug": saved.get("anchor"), "title": anchor["title"] if anchor else ""},
        "careers": careers,
        "taken_at": saved.get("taken_at"),
    }
