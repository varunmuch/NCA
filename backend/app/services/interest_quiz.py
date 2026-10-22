"""
A five-part career interest assessment built on the six RIASEC interest
types that O*NET uses to describe every career in the catalog.

Parts:
  1. Activities - rate 24 everyday activities (4 per type) from 1 to 5.
  2. Trade-offs - 15 forced choices, one for every pair of types. Forced
     choice separates types even for students who "like everything".
  3. Work setting - pick up to 3 places you'd like to work (career families).
  4. Subjects - pick up to 4 favorite school subjects.
  5. Training - how long you'd like to train after high school (job zone).

Scoring:
  - Each type's score (0-100) blends its activity ratings (60%) with how
    often it won its trade-offs (40%).
  - The profile is summarized the way Holland's theory does: a three-letter
    code, differentiation (how distinct the top type is), and consistency
    (whether the top two types sit next to each other on the hexagon).
  - Careers are ranked by a fit score (0-100): interests 60%, work setting
    15%, subjects 15%, training 10%. Every match lists what it's based on.

The statements are written for this app (they are not O*NET's Interest
Profiler items).
"""

import math
from datetime import datetime, timezone
from itertools import combinations

from fastapi import HTTPException

from app.services import career_catalog


TYPES = ["Realistic", "Investigative", "Artistic", "Social", "Enterprising", "Conventional"]
LETTERS = {kind: kind[0] for kind in TYPES}

ACTIVITIES = [
    ("r1", "Realistic", "Rebuild a bike, engine, or computer from parts"),
    ("r2", "Realistic", "Wire the lights and sound for a school play"),
    ("r3", "Realistic", "Care for animals or plants on a farm or in a park"),
    ("r4", "Realistic", "Use power tools to build furniture or a set"),
    ("i1", "Investigative", "Design an experiment to test which fertilizer works best"),
    ("i2", "Investigative", "Figure out what's causing a bug in someone's code"),
    ("i3", "Investigative", "Read a study about how a disease spreads"),
    ("i4", "Investigative", "Analyze sports or survey data to find a pattern"),
    ("a1", "Artistic", "Design a logo, poster, or app screen"),
    ("a2", "Artistic", "Write a short story, script, or song lyrics"),
    ("a3", "Artistic", "Edit a video so it tells a story"),
    ("a4", "Artistic", "Perform on stage in a play, band, or dance"),
    ("s1", "Social", "Tutor a younger student who's struggling"),
    ("s2", "Social", "Help a friend talk through a hard situation"),
    ("s3", "Social", "Run activities for kids at a summer camp"),
    ("s4", "Social", "Volunteer with patients at a hospital or care home"),
    ("e1", "Enterprising", "Pitch an idea to win funding for a club"),
    ("e2", "Enterprising", "Run a small business selling something you made"),
    ("e3", "Enterprising", "Lead a team and decide who does what"),
    ("e4", "Enterprising", "Argue one side in a debate or mock trial"),
    ("c1", "Conventional", "Keep a club's budget and receipts in order"),
    ("c2", "Conventional", "Build a spreadsheet that tracks a big project"),
    ("c3", "Conventional", "Check a report carefully for errors before it goes out"),
    ("c4", "Conventional", "Set up a system so a messy storeroom stays organized"),
]

ACTIVITY_SCALE = ["Strongly dislike", "Dislike", "Not sure", "Like", "Strongly like"]

# One short, concrete activity per type, reused across its trade-offs.
TRADEOFF_TEXT = {
    "Realistic": {
        "Investigative": ("Repair a broken drone", "Find out why it crashed"),
        "Artistic": ("Build a wooden bookshelf", "Paint a mural"),
        "Social": ("Fix a neighbor's fence", "Coach a kids' soccer team"),
        "Enterprising": ("Install solar panels", "Sell solar panels to homeowners"),
        "Conventional": ("Assemble new lab equipment", "Keep the lab's inventory records"),
    },
    "Investigative": {
        "Artistic": ("Research how colors affect mood", "Design a room using color"),
        "Social": ("Study how people learn", "Teach a class yourself"),
        "Enterprising": ("Test whether a product really works", "Convince stores to carry it"),
        "Conventional": ("Explore a new dataset for patterns", "Clean and format the dataset exactly"),
    },
    "Artistic": {
        "Social": ("Write songs", "Run music lessons for kids"),
        "Enterprising": ("Make the short film", "Pitch the film to a festival"),
        "Conventional": ("Design a magazine layout", "Proofread every page of it"),
    },
    "Social": {
        "Enterprising": ("Support a student through a tough year", "Run the student council"),
        "Conventional": ("Welcome new members to a club", "Keep the club's records up to date"),
    },
    "Enterprising": {
        "Conventional": ("Negotiate a sponsorship deal", "Track the money the deal brings in"),
    },
}

TRADEOFFS = [
    (f"t_{LETTERS[first].lower()}{LETTERS[second].lower()}", first, second, *TRADEOFF_TEXT[first][second])
    for first, second in combinations(TYPES, 2)
]

# One setting per career family.
SETTINGS = [
    ("technology", "At a computer, building software or systems"),
    ("health", "A hospital, clinic, or care home"),
    ("science", "A lab or research center"),
    ("engineering", "Designing things that get built"),
    ("arts", "A studio, stage, or newsroom"),
    ("business", "An office, running a business or its money"),
    ("education", "A school or community center"),
    ("law", "A courtroom, city hall, or emergency scene"),
    ("trades", "A workshop, job site, or on the road"),
    ("environment", "Outdoors, with land, water, plants, or animals"),
    ("hospitality", "A kitchen, gym, or event venue"),
]

TRAINING = [
    ("short", 2, "Start working soon", "On-the-job training or under a year of school"),
    ("two_year", 3, "A certificate or two-year program", "Trade school, apprenticeship, or community college"),
    ("four_year", 4, "A four-year degree", "College or university"),
    ("graduate", 5, "More than four years", "Graduate or professional school, like med or law school"),
    ("unsure", None, "Not sure yet", "Show careers at every level"),
]

MAX_SETTINGS = 3
MAX_SUBJECTS = 4

TYPE_DESCRIPTIONS = {
    "Realistic": "You like hands-on work: building, fixing, and working with tools, machines, plants, or animals.",
    "Investigative": "You like figuring things out: researching, experimenting, and solving problems with logic and data.",
    "Artistic": "You like creating: designing, writing, performing, and expressing ideas in your own way.",
    "Social": "You like helping people: teaching, caring, coaching, and working with others.",
    "Enterprising": "You like leading: persuading, organizing people, starting things, and taking charge.",
    "Conventional": "You like order: organizing information, following clear systems, and getting details right.",
}

WEIGHTS = {"interests": 0.60, "setting": 0.15, "subjects": 0.15, "training": 0.10}


def questions() -> dict:
    return {
        "activities": {
            "items": [{"id": qid, "text": text} for qid, _, text in ACTIVITIES],
            "scale": ACTIVITY_SCALE,
        },
        "tradeoffs": [
            {"id": qid, "a": {"key": "a", "text": a_text}, "b": {"key": "b", "text": b_text}}
            for qid, _, _, a_text, b_text in TRADEOFFS
        ],
        "settings": {
            "options": [{"key": key, "label": label} for key, label in SETTINGS],
            "max": MAX_SETTINGS,
        },
        "subjects": {"options": career_catalog.all_subjects(), "max": MAX_SUBJECTS},
        "training": [
            {"key": key, "label": label, "description": description}
            for key, _, label, description in TRAINING
        ],
    }


def _validate(answers: dict) -> dict:
    activities = answers.get("activities") or {}
    tradeoffs = answers.get("tradeoffs") or {}

    if set(activities) != {qid for qid, _, _ in ACTIVITIES}:
        raise HTTPException(status_code=400, detail="Please rate every activity.")

    if any(not isinstance(value, int) or not 1 <= value <= 5 for value in activities.values()):
        raise HTTPException(status_code=400, detail="Activity ratings must be 1 to 5.")

    if set(tradeoffs) != {qid for qid, *_ in TRADEOFFS}:
        raise HTTPException(status_code=400, detail="Please answer every trade-off.")

    if any(value not in ("a", "b") for value in tradeoffs.values()):
        raise HTTPException(status_code=400, detail="Each trade-off needs one choice.")

    setting_keys = {key for key, _ in SETTINGS}
    settings = [key for key in dict.fromkeys(answers.get("settings") or []) if key in setting_keys]

    subject_options = set(career_catalog.all_subjects())
    subjects = [item for item in dict.fromkeys(answers.get("subjects") or []) if item in subject_options]

    if len(settings) > MAX_SETTINGS or len(subjects) > MAX_SUBJECTS:
        raise HTTPException(status_code=400, detail="Too many choices.")

    training = answers.get("training") or "unsure"

    if training not in {key for key, *_ in TRAINING}:
        raise HTTPException(status_code=400, detail="Pick a training option.")

    return {
        "activities": activities,
        "tradeoffs": tradeoffs,
        "settings": settings,
        "subjects": subjects,
        "training": training,
    }


def score(answers: dict) -> tuple[dict[str, int], dict]:
    """Return RIASEC scores (0-100) and the details stored with them."""

    answers = _validate(answers)

    rating_totals = {kind: 0 for kind in TYPES}
    rating_counts = {kind: 0 for kind in TYPES}

    for qid, kind, _ in ACTIVITIES:
        rating_totals[kind] += answers["activities"][qid] - 1
        rating_counts[kind] += 1

    wins = {kind: 0 for kind in TYPES}

    for qid, first, second, _, _ in TRADEOFFS:
        wins[first if answers["tradeoffs"][qid] == "a" else second] += 1

    # Every type appears in exactly five trade-offs.
    scores = {
        kind: round(
            100
            * (
                0.6 * rating_totals[kind] / (4 * rating_counts[kind])
                + 0.4 * wins[kind] / (len(TYPES) - 1)
            )
        )
        for kind in TYPES
    }

    ratings = list(answers["activities"].values())
    mean = sum(ratings) / len(ratings)
    spread = math.sqrt(sum((value - mean) ** 2 for value in ratings) / len(ratings))

    details = {
        "settings": answers["settings"],
        "subjects": answers["subjects"],
        "training": answers["training"],
        "rating_mean": round(mean, 2),
        "rating_spread": round(spread, 2),
    }

    return scores, details


def top_types(scores: dict[str, int], count: int = 3) -> list[str]:
    return sorted(scores, key=lambda kind: (-scores[kind], TYPES.index(kind) if kind in TYPES else 9))[:count]


def _hexagon_distance(first: str, second: str) -> int:
    gap = abs(TYPES.index(first) - TYPES.index(second))
    return min(gap, len(TYPES) - gap)


def profile_shape(scores: dict[str, int], details: dict | None = None) -> list[dict]:
    """Plain-language notes on the shape of the profile (Holland's terms)."""

    ordered = top_types(scores, len(scores))
    notes = []

    differentiation = scores[ordered[0]] - scores[ordered[-1]]

    if differentiation >= 45:
        notes.append(
            {
                "key": "differentiation",
                "title": "Clear preferences",
                "body": f"{ordered[0]} stands well above your other types, so your matches lean strongly that way.",
            }
        )
    elif differentiation < 25:
        notes.append(
            {
                "key": "differentiation",
                "title": "Broad interests",
                "body": "Your six scores are close together. That's common and useful: many different careers could suit you, so exploring widely makes sense.",
            }
        )
    else:
        notes.append(
            {
                "key": "differentiation",
                "title": "A few clear favorites",
                "body": f"{ordered[0]} and {ordered[1]} lead, with room to explore around them.",
            }
        )

    distance = _hexagon_distance(ordered[0], ordered[1])

    if distance == 1:
        notes.append(
            {
                "key": "consistency",
                "title": "Your top two fit together",
                "body": f"{ordered[0]} and {ordered[1]} sit next to each other on the interest hexagon, so many careers combine both.",
            }
        )
    elif distance == 3:
        notes.append(
            {
                "key": "consistency",
                "title": "An unusual mix",
                "body": f"{ordered[0]} and {ordered[1]} are opposite each other on the hexagon. Fewer careers blend both, so look for roles with variety, or hobbies that cover the other side.",
            }
        )
    else:
        notes.append(
            {
                "key": "consistency",
                "title": "A flexible combination",
                "body": f"{ordered[0]} and {ordered[1]} are related but different, so you'll find careers that mix them in different amounts.",
            }
        )

    if details and details.get("rating_mean", 0) >= 4 and details.get("rating_spread", 9) < 0.8:
        notes.append(
            {
                "key": "acquiescence",
                "title": "You liked almost everything",
                "body": "Most activities got a high rating, so the trade-off questions did most of the sorting.",
            }
        )

    return notes


def _interest_fit(scores: dict[str, int], career: dict) -> float:
    """0-1: Pearson correlation of shapes blended with level at the career's types."""

    career_types = career["interests"][:3]
    profile = [{0: 1.0, 1: 0.66, 2: 0.33}.get(career_types.index(kind), 0.0) if kind in career_types else 0.0 for kind in TYPES]
    student = [scores.get(kind, 0) for kind in TYPES]

    student_mean = sum(student) / len(student)
    profile_mean = sum(profile) / len(profile)
    covariance = sum((s - student_mean) * (p - profile_mean) for s, p in zip(student, profile))
    spread = math.sqrt(sum((s - student_mean) ** 2 for s in student)) * math.sqrt(
        sum((p - profile_mean) ** 2 for p in profile)
    )
    correlation = covariance / spread if spread else 0.0

    weights = [3, 2, 1][: len(career_types)]
    level = sum(weight * scores.get(kind, 0) for weight, kind in zip(weights, career_types)) / (100 * sum(weights))

    return 0.5 * (correlation + 1) / 2 + 0.5 * level


def match_careers(scores: dict[str, int], details: dict | None = None, limit: int | None = 12) -> list[dict]:
    details = details or {}
    settings = set(details.get("settings") or [])
    subjects = set(details.get("subjects") or [])
    zone = next((zone for key, zone, *_ in TRAINING if key == details.get("training")), None)
    top = top_types(scores, 3)

    ranked = []

    for career in career_catalog.load_catalog()["careers"]:
        if not career["interests"]:
            continue

        parts = {"interests": _interest_fit(scores, career)}

        if settings:
            parts["setting"] = 1.0 if career["family"] in settings else 0.0

        if subjects:
            shared = subjects & set(career["subjects"][:5])
            parts["subjects"] = min(1.0, len(shared) / 2)

        if zone and career.get("job_zone"):
            gap = abs(career["job_zone"] - zone)
            parts["training"] = 1.0 if gap == 0 else 0.5 if gap == 1 else 0.0

        # Parts the student skipped don't count against any career.
        total_weight = sum(WEIGHTS[name] for name in parts)
        fit = sum(WEIGHTS[name] * value for name, value in parts.items()) / total_weight

        reasons = []
        shared_types = [kind for kind in career["interests"][:2] if kind in top[:2]]

        if len(shared_types) == 2:
            reasons.append(f"Combines your top two interests, {shared_types[0]} and {shared_types[1]}")
        elif shared_types:
            reasons.append(f"Built around {career_catalog.INTEREST_LABELS[shared_types[0]].lower()}")

        if parts.get("setting"):
            reasons.append("Matches a work setting you picked")

        if parts.get("subjects"):
            shared = [item for item in career["subjects"][:5] if item in subjects]
            reasons.append("Uses " + ", ".join(shared[:2]))

        if parts.get("training") == 1.0:
            reasons.append("Fits the training time you want")

        ranked.append((fit, career, parts, reasons))

    ranked.sort(key=lambda item: (-item[0], item[1]["title"]))

    return [
        {
            **career_catalog.summary(career),
            "match_score": round(100 * fit),
            "match_parts": {name: round(100 * value) for name, value in parts.items()},
            "match_reasons": reasons or ["A good overall match for your answers"],
        }
        for fit, career, parts, reasons in (ranked[:limit] if limit else ranked)
    ]


def result_payload(profile: dict) -> dict | None:
    scores = profile.get("interest_scores") or {}

    if not scores:
        return None

    details = profile.get("interest_quiz") or {}
    top = top_types(scores)
    setting_labels = dict(SETTINGS)
    training = next((item for item in TRAINING if item[0] == details.get("training")), None)

    return {
        "scores": scores,
        "code": "".join(LETTERS.get(kind, kind[0]) for kind in top),
        "top": [
            {
                "type": kind,
                "label": career_catalog.INTEREST_LABELS[kind],
                "description": TYPE_DESCRIPTIONS[kind],
                "score": scores[kind],
            }
            for kind in top
        ],
        "shape": profile_shape(scores, details),
        "preferences": {
            "settings": [setting_labels[key] for key in details.get("settings") or [] if key in setting_labels],
            "subjects": details.get("subjects") or [],
            "training": training[2] if training and training[1] else "",
        },
        "taken_at": profile.get("interest_quiz_at") or None,
        **_matches_for_goal(profile, scores, details),
    }


def _matches_for_goal(profile: dict, scores: dict, details: dict) -> dict:
    """
    With a career goal, matches stay in that field: a student who wants to be
    a software engineer sees software careers first, ranked by fit, and other
    fields only in a separate, folded list.
    """

    from app.services import field_quiz  # imported here to avoid a cycle

    anchor = field_quiz.anchor_for(profile)

    if not anchor:
        return {"careers": match_careers(scores, details), "goal": None, "other_careers": []}

    field = field_quiz.goal_field_slugs(anchor)
    ranked = match_careers(scores, details, limit=None)
    in_field = [match for match in ranked if match["slug"] in field]
    anchor_career = career_catalog.get_career(anchor) or {}

    # The goal is always listed, first, even if its own page isn't in the ranking.
    if anchor not in {match["slug"] for match in in_field} and anchor_career:
        in_field.insert(0, {**career_catalog.summary(anchor_career), "match_score": None, "match_parts": {}, "match_reasons": ["Your career goal"]})
    else:
        in_field.sort(key=lambda match: match["slug"] != anchor)

    # A title page's own occupation (Software Developers for Software Engineer) comes next.
    parent = anchor_career.get("variant_of")

    if parent:
        in_field.sort(key=lambda match: (match["slug"] != anchor, match["slug"] != parent))

    return {
        "careers": in_field[:8],
        "goal": {"slug": anchor, "title": anchor_career.get("title", "")},
        "other_careers": [match for match in ranked if match["slug"] not in field][:6],
    }


def taken_now() -> str:
    return datetime.now(timezone.utc).isoformat()
