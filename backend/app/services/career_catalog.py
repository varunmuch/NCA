"""
Read-only career catalog built from O*NET (see scripts/build_career_catalog.py).

Matching is deterministic and explainable: every "for you" match lists the
profile details it is based on.
"""

import json
import math
import re
from functools import lru_cache
from pathlib import Path


CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "careers.json"
# Pay, outlook, education, classes and courses from official sources,
# written by scripts/refresh_career_data.py.
CAREER_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "career_data.json"

# Friendly labels for O*NET's six interest types (RIASEC).
INTEREST_LABELS = {
    "Realistic": "Hands-on building and fixing",
    "Investigative": "Solving problems and researching",
    "Artistic": "Creating and designing",
    "Social": "Helping and teaching people",
    "Enterprising": "Leading and persuading",
    "Conventional": "Organizing and working with details",
}


@lru_cache(maxsize=1)
def load_catalog() -> dict:
    data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    data["by_slug"] = {career["slug"]: career for career in data["careers"]}
    return data


@lru_cache(maxsize=1)
def load_career_data() -> dict:
    if not CAREER_DATA_PATH.exists():
        return {"retrieved": None, "sources": {}, "careers": {}}

    return json.loads(CAREER_DATA_PATH.read_text(encoding="utf-8"))


def career_facts(slug: str) -> dict | None:
    """One career's sourced data, with the sources and retrieval date."""

    data = load_career_data()
    facts = data["careers"].get(slug)

    if not facts:
        return None

    return {**facts, "sources": data["sources"], "retrieved": data["retrieved"]}


def _dollars(value: float | None, *, hourly: bool = False) -> str | None:
    if value is None:
        return None

    return f"${value:,.2f}" if hourly else f"${value:,.0f}"


def _years(period: str | None) -> str:
    """'2025–35' -> '2025 to 2035', so either year a reply mentions is sourced."""

    match = re.match(r"(\d{4})[–-](\d{2,4})", period or "")

    if not match:
        return period or ""

    end = match.group(2)
    return f"{match.group(1)} to {match.group(1)[:2] + end if len(end) == 2 else end}"


def facts_text(slug: str) -> str:
    """
    The sourced facts as plain sentences, numbers written exactly as the
    source has them, so the counselor can quote them and grounding can
    match them.
    """

    facts = career_facts(slug)

    if not facts:
        return ""

    sources = facts["sources"]
    lines = []
    national = (facts.get("wages") or {}).get("national") or {}
    florida = (facts.get("wages") or {}).get("florida") or {}

    if national.get("annual_median"):
        line = (
            f"Pay ({sources['wages']['name']}): median {_dollars(national['annual_median'])} a year in the U.S."
        )

        if florida.get("annual_median"):
            line += f", {_dollars(florida['annual_median'])} in Florida"

        if national.get("annual_p10") and national.get("annual_p90"):
            line += (
                f"; the middle 80% earn {_dollars(national['annual_p10'])} to "
                f"{_dollars(national['annual_p90'])}"
            )

        if national.get("hourly_median"):
            line += f"; median {_dollars(national['hourly_median'], hourly=True)} an hour"

        lines.append(line + ".")
    elif national.get("hourly_median"):
        # Some jobs (performers, for example) are published hourly only.
        lines.append(
            f"Pay ({sources['wages']['name']}): median "
            f"{_dollars(national['hourly_median'], hourly=True)} an hour in the U.S."
        )

    outlook = facts.get("outlook") or {}

    if outlook.get("growth_percent") is not None:
        lines.append(
            f"Job outlook ({sources['outlook']['name']}, {_years(outlook.get('period'))}): "
            f"{outlook['growth_percent']}% change in jobs "
            f"(all jobs: {sources['outlook']['all_jobs_growth_percent']}%), about "
            f"{outlook['openings_per_year']:,} openings a year."
        )

    education = facts.get("education") or {}

    if education.get("typical_entry"):
        line = f"Typical education to start (BLS): {education['typical_entry']}"

        if education.get("training") and education["training"] != "None":
            line += f"; training: {education['training']}"

        if education.get("work_experience") and education["work_experience"] != "None":
            line += f"; experience: {education['work_experience']}"

        lines.append(line + ".")

    if facts.get("ap_courses"):
        lines.append(f"High school AP classes to consider: {', '.join(facts['ap_courses'])}.")

    if facts.get("licenses"):
        names = "; ".join(
            f"{item['title']} ({item['agency']}{', ' + item['url'] if item['url'] else ''})"
            for item in facts["licenses"]
        )
        lines.append(f"Florida licenses ({sources['licenses']['name']}): {names}.")

    return " ".join(lines)


@lru_cache(maxsize=1)
def career_scopes() -> tuple[tuple[str, str], ...]:
    """
    (title, that career's own facts) for every career, so a figure a reply
    gives for a career is checked against that career's data even when it
    wasn't among the turn's sources.
    """

    return tuple(
        (career["title"], career["description"] + " " + facts_text(career["slug"]))
        for career in load_catalog()["careers"]
    )


def named_careers(text: str) -> list[str]:
    """Slugs of catalog careers named in text, in order ("graphic designer" counts)."""

    lowered = text.lower()
    found = []

    for career in load_catalog()["careers"]:
        title = career["title"].lower()
        match = re.search(rf"\b{re.escape(title[:-1] if title.endswith('s') else title)}", lowered)

        if match:
            found.append((match.start(), career["slug"]))

    return [slug for _, slug in sorted(found)]


def get_career(slug: str) -> dict | None:
    return load_catalog()["by_slug"].get(slug)


def family_label(key: str) -> str:
    for family in load_catalog()["families"]:
        if family["key"] == key:
            return family["label"]

    return key


def summary(career: dict) -> dict:
    return {
        "slug": career["slug"],
        "title": career["title"],
        "family": career["family"],
        "family_label": family_label(career["family"]),
        "description": career["description"],
        "subjects": career["subjects"],
        "interests": career["interests"],
        "interest_labels": career["interest_labels"],
        "job_zone": career["job_zone"],
    }


def _words(text: str) -> set[str]:
    return {
        word
        for word in re.findall(r"[a-z]+", text.lower())
        if len(word) > 2
    }


# Everyday words students use, mapped to catalog subjects and interests.
SUBJECT_SYNONYMS = {
    "math": "Math",
    "maths": "Math",
    "algebra": "Math",
    "calculus": "Math",
    "geometry": "Math",
    "statistics": "Math",
    "biology": "Biology",
    "bio": "Biology",
    "anatomy": "Biology",
    "chemistry": "Chemistry",
    "chem": "Chemistry",
    "physics": "Physics",
    "english": "English",
    "writing": "English",
    "reading": "English",
    "literature": "English",
    "art": "Art & Design",
    "arts": "Art & Design",
    "drawing": "Art & Design",
    "design": "Art & Design",
    "music": "Art & Music",
    "band": "Art & Music",
    "choir": "Art & Music",
    "computer": "Computer Science",
    "computers": "Computer Science",
    "coding": "Computer Science",
    "programming": "Computer Science",
    "technology": "Engineering & Technology",
    "engineering": "Engineering & Technology",
    "robotics": "Engineering & Technology",
    "psychology": "Psychology",
    "history": "History",
    "geography": "Geography",
    "government": "Government & Civics",
    "civics": "Government & Civics",
    "economics": "Economics",
    "spanish": "World Languages",
    "french": "World Languages",
    "language": "World Languages",
    "languages": "World Languages",
    "journalism": "Journalism & Media",
    "media": "Journalism & Media",
    "film": "Journalism & Media",
    "health": "Health Science",
    "medicine": "Health Science",
    "business": "Business",
    "marketing": "Business",
    "agriculture": "Agriculture",
    "science": "Biology",
    "animals": "Biology",
    "animal": "Biology",
    "nature": "Biology",
    "environment": "Biology",
}

INTEREST_SYNONYMS = {
    "building": "Realistic",
    "fixing": "Realistic",
    "hands": "Realistic",
    "outdoors": "Realistic",
    "sports": "Realistic",
    "cars": "Realistic",
    "research": "Investigative",
    "puzzles": "Investigative",
    "problem": "Investigative",
    "science": "Investigative",
    "experiments": "Investigative",
    "creative": "Artistic",
    "drawing": "Artistic",
    "music": "Artistic",
    "writing": "Artistic",
    "design": "Artistic",
    "art": "Artistic",
    "helping": "Social",
    "people": "Social",
    "teaching": "Social",
    "volunteering": "Social",
    "kids": "Social",
    "leading": "Enterprising",
    "leadership": "Enterprising",
    "business": "Enterprising",
    "debate": "Enterprising",
    "selling": "Enterprising",
    "organizing": "Conventional",
    "planning": "Conventional",
    "details": "Conventional",
}


STOPWORDS = {
    "about", "also", "and", "being", "doing", "every", "from", "have", "into",
    "just", "like", "love", "lots", "make", "making", "more", "most", "really",
    "some", "stuff", "that", "them", "then", "they", "things", "this", "want",
    "weekends", "with", "work", "working", "would", "your", "class", "classes",
    "school", "high", "grade", "enjoy", "favorite", "good", "people", "help",
    "helping", "volunteer", "volunteering", "career", "careers", "what", "know",
    "idea", "sure", "become", "where", "start", "should", "next",
}


# Everyday career words that O*NET phrases differently.
STUDENT_ALIASES = {
    "cybersecurity": {"security", "cyber"},
    "hacker": {"security"},
    "hacking": {"security"},
    "doctor": {"physician"},
    "doctors": {"physician"},
    "medicine": {"physician", "medical"},
    "vet": {"veterinarian"},
    "vets": {"veterinarian"},
    "coding": {"software", "programming"},
    "coder": {"software", "programming"},
    "programmer": {"software", "programming"},
    "gaming": {"game"},
    "games": {"game"},
    "animation": {"animator", "animation"},
    "lawyer": {"lawyer", "attorney"},
    "teacher": {"teacher", "teach"},
    "cooking": {"chef", "cook"},
    "baking": {"chef", "cook"},
    "space": {"space", "astronomer"},
    "planes": {"aircraft", "pilot"},
    "flying": {"aircraft", "pilot"},
    "robots": {"robotic", "robot"},
    "computers": {"computer", "software"},
    "fitness": {"fitness", "exercise"},
    "sports": {"athletic", "athlete", "sport"},
}


def _stems(text: str, *, expand: bool = False) -> set[str]:
    stems = set()

    for word in re.findall(r"[a-z]+", text.lower()):
        if expand and word in STUDENT_ALIASES:
            stems |= STUDENT_ALIASES[word]

        if len(word) < 4 or word in STOPWORDS:
            continue

        stems.add(word[:-1] if word.endswith("s") and len(word) > 4 else word)

    return stems


@lru_cache(maxsize=1)
def _career_stems() -> dict[str, set[str]]:
    return {
        career["slug"]: _stems(
            " ".join(
                [
                    career["title"],
                    career["description"],
                    " ".join(career["tasks"]),
                    " ".join(career["sample_titles"]),
                ]
            )
        )
        for career in load_catalog()["careers"]
    }


@lru_cache(maxsize=1)
def _title_stems() -> dict[str, set[str]]:
    return {
        career["slug"]: _stems(
            " ".join([career["title"], " ".join(career["sample_titles"])])
        )
        for career in load_catalog()["careers"]
    }


@lru_cache(maxsize=1)
def _idf() -> dict[str, float]:
    """Rarer words across the catalog say more about a specific career."""

    counts: dict[str, int] = {}
    documents = _career_stems()

    for stems in documents.values():
        for stem in stems:
            counts[stem] = counts.get(stem, 0) + 1

    total = len(documents)

    return {stem: math.log(total / count) for stem, count in counts.items()}


def profile_signals(profile: dict, extra_text: str = "") -> dict:
    """
    Collect subjects, interest types, and career words from a profile.

    Returns sets of catalog subjects and RIASEC types, each paired with the
    student's own phrasing so matches can be explained.
    """

    subjects: dict[str, str] = {}
    interests: dict[str, str] = {}

    def add_from(phrases: list[str]) -> None:
        for phrase in phrases:
            for word in _words(phrase):
                subject = SUBJECT_SYNONYMS.get(word)

                if subject and subject not in subjects:
                    subjects[subject] = phrase

                interest = INTEREST_SYNONYMS.get(word)

                if interest and interest not in interests:
                    interests[interest] = phrase

    add_from(list(profile.get("favorite_subjects") or []))
    add_from(list(profile.get("interests") or []))
    add_from(list(profile.get("hobbies") or []))
    add_from(list(profile.get("activities") or []))
    add_from(list(profile.get("strengths") or []))

    if extra_text:
        add_from([extra_text])

    # Topic phrases matched against O*NET career text ("animal shelter"
    # finds veterinarians through their task descriptions).
    topics: list[tuple[str, set[str]]] = []

    for key in ("interests", "hobbies", "activities", "favorite_subjects"):
        for phrase in profile.get(key) or []:
            stems = _stems(str(phrase), expand=True)

            if stems:
                topics.append((str(phrase), stems))

    aspiration = str(profile.get("career_aspiration") or "")

    for phrase, label in [(aspiration, aspiration), (extra_text, "your message")]:
        stems = _stems(phrase, expand=True)

        if stems:
            topics.append((label[:60], stems))

    return {
        "subjects": subjects,
        "interests": interests,
        "topics": topics,
    }


def match_careers(
    profile: dict,
    *,
    extra_text: str = "",
    limit: int = 12,
) -> list[dict]:
    signals = profile_signals(profile, extra_text)

    quiz = {
        kind: value
        for kind, value in (profile.get("interest_scores") or {}).items()
        if isinstance(value, (int, float))
    }

    if (
        not signals["subjects"]
        and not signals["interests"]
        and not signals["topics"]
        and not quiz
    ):
        return []

    career_stems = _career_stems()
    title_stems = _title_stems()
    idf = _idf()
    scored = []

    for career in load_catalog()["careers"]:
        score = 0.0
        reasons = []

        for phrase, stems in signals["topics"]:
            overlap = stems & career_stems[career["slug"]]
            weight = sum(idf.get(stem, 0) for stem in overlap)

            # Words that name the job itself count extra.
            weight += sum(
                idf.get(stem, 0)
                for stem in overlap & title_stems[career["slug"]]
            )

            if weight >= 1.5:
                score += min(5.0, weight * 0.8)
                reasons.append(
                    "Connects to your message"
                    if phrase == "your message"
                    else f"Connects to \u201c{phrase}\u201d"
                )

        for index, subject in enumerate(career["subjects"][:4]):
            if subject in signals["subjects"]:
                score += 2.5 - index * 0.4
                reasons.append(
                    f"Uses {subject}, which you said you like "
                    f"(“{signals['subjects'][subject]}”)"
                )

        for index, interest in enumerate(career["interests"][:2]):
            if interest in signals["interests"]:
                score += 1.5 - index * 0.5
                label = career["interest_labels"][index].lower()
                reasons.append(
                    f"Involves {label}, which fits "
                    f"“{signals['interests'][interest]}”"
                )

        # Interest quiz: up to 3 points for careers built around the
        # student's strongest interest types.
        if quiz:
            fit = sum(
                weight * quiz.get(kind, 0)
                for weight, kind in zip((3, 2, 1), career["interests"][:3])
            ) / 6

            if fit >= 50:
                score += 3.0 * fit / 100
                reasons.append(
                    f"Involves {career['interest_labels'][0].lower()}, "
                    "which your interest quiz rated high"
                )

        if score > 0:
            scored.append((score, career, reasons))

    scored.sort(key=lambda item: (-item[0], item[1]["title"]))

    return [
        {
            **summary(career),
            "match_reasons": reasons[:3],
            "match_score": round(score, 2),
        }
        for score, career, reasons in scored[:limit]
    ]


# Extra everyday words for search, beyond the ones matching uses.
SEARCH_ALIASES = {
    "money": {"financial", "finance", "accounting", "budget"},
    "finance": {"financial", "accounting"},
    "animals": {"animal", "veterinarian", "wildlife"},
    "kids": {"children", "child", "teacher"},
    "children": {"child", "teacher"},
    "art": {"artist", "design", "art"},
    "drawing": {"artist", "illustrat", "design"},
    "draw": {"artist", "illustrat", "design", "drafter"},
    "nurse": {"nurse", "nursing"},
    "nursing": {"nurse"},
    "police": {"police", "officer", "law"},
    "cop": {"police", "officer"},
    "firefighter": {"fire", "firefight"},
    "law": {"lawyer", "legal", "law"},
    "legal": {"lawyer", "law"},
    "building": {"construct", "build", "architect"},
    "houses": {"construct", "architect", "electrician", "plumb"},
    "cars": {"automotive", "vehicle", "mechanic"},
    "mechanic": {"automotive", "mechanic", "repair"},
    "ai": {"artificial", "machine", "data"},
    "data": {"data", "statistic", "database"},
    "writing": {"writer", "write", "editor"},
    "writer": {"writer", "write", "author"},
    "music": {"music", "musician", "sound"},
    "movies": {"film", "video", "producer"},
    "film": {"film", "video", "camera"},
    "teach": {"teacher", "teach", "instruct"},
    "therapy": {"therapist", "counsel", "therap"},
    "mental": {"counsel", "psycholog", "therap"},
    "brain": {"psycholog", "neuro"},
    "plants": {"plant", "agricultur", "farm"},
    "farm": {"farm", "agricultur"},
    "ocean": {"marine", "water", "ocean"},
    "weather": {"atmospher", "meteorolog", "climate"},
    "climate": {"environment", "climate", "conservation"},
    "food": {"chef", "cook", "food"},
    "business": {"business", "manag", "market"},
    "boss": {"manag", "executive"},
    "website": {"web", "developer"},
    "apps": {"software", "developer", "application"},
    "app": {"software", "developer", "application"},
    "hospital": {"patient", "medical", "nurse"},
    "dentist": {"dentist", "dental"},
    "teeth": {"dentist", "dental"},
    "pharmacy": {"pharmac"},
    "medicine": {"physician", "medical", "pharmac"},
    "space": {"aerospace", "astronom", "space"},
    "rockets": {"aerospace"},
    "math": {"mathemat", "statistic"},
    "science": {"scien", "research"},
    "fix": {"repair", "install", "maint"},
    "fixing": {"repair", "install", "maint"},
    "outdoors": {"outdoor", "environment", "conservation", "forest"},
    "travel": {"travel", "pilot", "aircraft"},
    "fashion": {"fashion", "design", "cloth"},
    "sports": {"athlet", "coach", "sport", "fitness"},
    "gym": {"fitness", "trainer", "exercise"},
}

SEARCH_STOPWORDS = {
    "a", "an", "and", "the", "of", "to", "in", "for", "with", "or", "on", "at",
    "i", "me", "my", "is", "be", "job", "jobs", "career", "careers", "work",
    "working", "like", "want", "something", "things", "who", "that",
}

# Field weights: a word in a job's title says much more than one in a task.
SEARCH_FIELDS = {
    "title": 10.0,
    "sample_titles": 8.0,
    "description": 3.0,
    "tasks": 2.5,
    "subjects": 2.5,
    "knowledge": 2.0,
    "skills": 1.5,
    "family": 2.0,
}

FIELD_LABELS = {
    "title": "Title",
    "sample_titles": "Also called",
    "description": "About",
    "tasks": "Task",
    "subjects": "Subject",
    "knowledge": "Knowledge",
    "skills": "Skill",
    "family": "Field",
}


def _stem(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"

    if len(word) > 5 and word.endswith("ing"):
        return word[:-3]

    if len(word) > 4 and word.endswith(("ches", "shes", "sses", "xes")):
        return word[:-2]

    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]

    return word


def _tokens(text: str) -> list[str]:
    return [_stem(word) for word in re.findall(r"[a-z0-9]+", text.lower())]


def _field_texts(career: dict) -> dict[str, list[str]]:
    return {
        "title": [career["title"]],
        "sample_titles": list(career["sample_titles"]),
        "description": [career["description"]],
        "tasks": list(career["tasks"]),
        "subjects": list(career["subjects"]),
        "knowledge": list(career.get("knowledge") or []),
        "skills": list(career.get("skills") or []),
        "family": [family_label(career["family"])],
    }


@lru_cache(maxsize=1)
def _search_index() -> dict:
    """Per career and field, the set of word stems; plus catalog-wide stats."""

    index = {}
    document_counts: dict[str, int] = {}

    for career in load_catalog()["careers"]:
        fields = {
            name: set(token for text in texts for token in _tokens(text))
            for name, texts in _field_texts(career).items()
        }
        index[career["slug"]] = fields

        for token in set().union(*fields.values()):
            document_counts[token] = document_counts.get(token, 0) + 1

    total = len(index)

    return {
        "fields": index,
        "idf": {
            token: 1 + math.log(total / count) for token, count in document_counts.items()
        },
        "vocabulary": sorted(document_counts),
    }


def _expand_term(term: str, vocabulary: list[str]) -> tuple[list[tuple[str, float, bool]], str | None]:
    """
    Every vocabulary stem a query term can match, each with a confidence.

    Returns (matches, correction). A correction is set only when the term
    matched nothing directly and a close spelling was used instead.
    """

    import difflib

    stem = _stem(term)
    matches: dict[str, tuple[float, bool]] = {}

    def add(token: str, confidence: float, prefix: bool = False) -> None:
        if token not in matches or matches[token][0] < confidence:
            matches[token] = (confidence, prefix)

    vocab = set(vocabulary)

    if stem in vocab:
        add(stem, 1.0)

    # Prefix match so "bio" finds "biology" and "engin" finds "engineer".
    # A complete word ("nurse") trusts its extensions ("nursery") less than
    # a partial one ("nur") does.
    if len(stem) >= 3:
        extension = 0.4 if stem in vocab else 0.8

        for token in vocabulary:
            if token != stem and token.startswith(stem):
                add(token, extension, True)

    # Shared root so "psychology" finds "psychologist" and "biology" "biologist".
    root = stem.rstrip("aeiouy")

    if len(root) >= 5 and root != stem:
        for token in vocabulary:
            if token.startswith(root):
                add(token, 0.75 if stem in vocab else 0.85, True)

    for alias in SEARCH_ALIASES.get(term, set()) | STUDENT_ALIASES.get(term, set()):
        alias_stem = _stem(alias)

        for token in vocabulary:
            if token == alias_stem or (len(alias_stem) >= 4 and token.startswith(alias_stem)):
                add(token, 0.7, True)

    if matches or len(stem) < 4:
        return [(token, confidence, prefix) for token, (confidence, prefix) in matches.items()], None

    # Nothing matched: try a close spelling ("enginer", "pyschology").
    close = difflib.get_close_matches(stem, vocabulary, n=1, cutoff=0.8)

    return [(token, 0.9, False) for token in close], close[0] if close else None


def _snippet(text: str, tokens: set[str], length: int = 110) -> str:
    words = text.split()

    for position, word in enumerate(words):
        if any(_stem(re.sub(r"[^a-z0-9]", "", word.lower())) == token for token in tokens):
            start = max(0, position - 6)
            snippet = " ".join(words[start : start + 18])

            if len(snippet) > length:
                snippet = snippet[:length].rsplit(" ", 1)[0]

            return ("…" if start else "") + snippet + ("…" if start + 18 < len(words) else "")

    return text[:length]


def search_careers(
    *,
    query: str = "",
    family: str = "",
    subject: str = "",
    interest: str = "",
) -> dict:
    """
    Ranked career search.

    Each query word is matched against the catalog's own words (exact,
    prefix, everyday aliases, then close spellings), scored by which field
    it hit and how rare the word is, and careers matching more of the query
    rank higher. Every result says where it matched.
    """

    candidates = [
        career
        for career in load_catalog()["careers"]
        if (not family or career["family"] == family)
        and (not subject or subject in career["subjects"])
        and (not interest or interest in career["interests"][:2])
    ]

    terms = [
        word
        for word in dict.fromkeys(re.findall(r"[a-z0-9]+", query.lower()))
        if word not in SEARCH_STOPWORDS
    ]

    if not terms:
        return {"careers": [summary(career) for career in candidates], "suggestion": None}

    index = _search_index()
    expansions = []
    corrected_terms = []
    corrected = False

    for term in terms:
        matches, correction = _expand_term(term, index["vocabulary"])

        # Search the corrected spelling as if the student had typed it.
        if correction:
            matches = _expand_term(correction, index["vocabulary"])[0]

        expansions.append(matches)
        corrected_terms.append(correction or term)
        corrected = corrected or bool(correction)

    phrase = query.strip().lower()
    scored = []

    for career in candidates:
        fields = index["fields"][career["slug"]]
        score = 0.0
        matched_terms = 0
        best_hit = None

        for matches in expansions:
            best = 0.0

            for token, confidence, _ in matches:
                for name, tokens in fields.items():
                    if token in tokens:
                        value = SEARCH_FIELDS[name] * confidence * index["idf"].get(token, 1)

                        if value > best:
                            best = value

                            if best_hit is None or value > best_hit[0]:
                                best_hit = (value, name, token)

            if best:
                matched_terms += 1
                score += best

        if not matched_terms:
            continue

        # Matching every word of the query beats matching one word strongly.
        score *= (matched_terms / len(terms)) ** 2

        if phrase and phrase in career["title"].lower():
            score += 40

        scored.append((score, career, best_hit))

    scored.sort(key=lambda item: (-item[0], item[1]["title"]))

    # Drop the long tail of incidental mentions.
    if scored:
        floor = scored[0][0] * 0.2
        scored = [item for item in scored if item[0] >= floor]

    results = []

    for score, career, hit in scored:
        hint = None

        if hit and hit[1] != "title":
            _, name, token = hit
            texts = _field_texts(career)[name]
            text = next((item for item in texts if token in _tokens(item)), texts[0])
            hint = {
                "field": FIELD_LABELS[name],
                "text": text if name in ("sample_titles", "subjects", "knowledge", "skills", "family") else _snippet(text, {token}),
            }

        results.append({**summary(career), "match_hint": hint, "relevance": round(score, 1)})

    return {
        "careers": results,
        "suggestion": " ".join(corrected_terms) if corrected else None,
    }


def all_subjects() -> list[str]:
    seen: list[str] = []

    for career in load_catalog()["careers"]:
        for subject in career["subjects"]:
            if subject not in seen:
                seen.append(subject)

    return sorted(seen)
