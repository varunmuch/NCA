"""
One picture of a student, built from their own records, that every agent
uses: the counselor, the quiz, the plan and Home.

- Transcript: courses and grades become a GPA (unweighted and weighted),
  course rigor, and the subjects where grades are strongest. Computed in
  code, never by the model.
- Resume: activities, leadership, awards, work, volunteering and service
  hours.
- What the student told us: SAT/ACT scores, service hours, the major they
  want, and their interest quiz.

Grades decide what's realistic to aim for (reach, match, likely colleges;
Bright Futures). They are never used to talk a student out of a goal.
"""

import re
from collections import defaultdict

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.db.models import ResumeDocument
from app.services import career_catalog


# Plain letter grades on a 4.0 scale. Florida schools mostly report plain
# letters; a plus or minus counts as the letter.
LETTER_POINTS = {"A": 4.0, "B": 3.0, "C": 2.0, "D": 1.0, "F": 0.0, "E": 0.0}

# Common Florida district weighting for the weighted GPA we show.
LEVEL_BONUS = {"AP": 1.0, "IB": 1.0, "AICE": 1.0, "Dual enrollment": 1.0, "Honors": 0.5, "Regular": 0.0}

# Bright Futures adds the same 0.5 to every honors-level course.
BRIGHT_FUTURES_BONUS = 0.5

LEVEL_PATTERNS = [
    ("AP", re.compile(r"\b(AP|advanced placement)\b", re.IGNORECASE)),
    ("IB", re.compile(r"\b(IB|international baccalaureate)\b", re.IGNORECASE)),
    ("AICE", re.compile(r"\b(AICE|cambridge)\b", re.IGNORECASE)),
    ("Dual enrollment", re.compile(r"\b(dual[- ]enrollment|DE|[A-Z]{3}\s?\d{4}[CL]?)\b")),
    ("Honors", re.compile(r"\b(honors?|hon|pre-?AP|pre-?IB|gifted)\b", re.IGNORECASE)),
]

AREAS = [
    # Order matters: the first match wins ("AP Computer Science" is computer science, not science).
    ("Computer science", r"computer|programming|coding|software|cyber|\bcs\b|web design|data science|information tech"),
    ("Engineering", r"engineering|robotics|\bcad\b|drafting|principles of engineering|aerospace"),
    ("Math", r"algebra|geometry|calculus|statistic|math|precalc|trigonometry|probability"),
    ("Science", r"biolog|chemistr|physic|environmental|anatomy|physiology|science|marine|earth|astronomy|forensic"),
    ("English", r"english|literature|composition|writing|journalism|speech|debate|language arts"),
    ("Social studies", r"history|government|economics|psychology|geography|civics|sociology|world cultures|law"),
    ("World language", r"spanish|french|latin|mandarin|chinese|german|arabic|portuguese|italian|japanese|american sign language|\basl\b"),
    ("Arts", r"\bart\b|arts|design|music|band|orchestra|chorus|drawing|painting|theat|drama|dance|photograph|ceramic|digital media|animation"),
    ("Business", r"business|accounting|marketing|entrepreneur|finance|management"),
    ("Health & PE", r"physical education|\bpe\b|health|fitness|\bhope\b|weight training|sports medicine"),
]

AREA_PATTERNS = [(name, re.compile(pattern, re.IGNORECASE)) for name, pattern in AREAS]

# Subject areas map onto the catalog's school subjects for career and major matching.
AREA_SUBJECTS = {
    "Math": ["Math"],
    "Science": ["Biology", "Chemistry", "Physics", "Health Science"],
    "Computer science": ["Computer Science"],
    "Engineering": ["Engineering & Technology", "Physics"],
    "English": ["English"],
    "Social studies": ["Psychology", "Government & Civics", "Economics", "Geography"],
    "World language": [],
    "Arts": ["Art & Design", "Art & Music"],
    "Business": ["Business", "Economics"],
    "Health & PE": ["Health Science"],
}

HOURS_PATTERN = re.compile(
    r"(\d{1,4})\+?\s*(?:total\s+)?(?:volunteer(?:ed)?|service|community[- ]service)?\s*hours?",
    re.IGNORECASE,
)
SERVICE_WORDS = re.compile(r"volunteer|service|community", re.IGNORECASE)


def course_level(name: str) -> str:
    for level, pattern in LEVEL_PATTERNS:
        if pattern.search(name):
            return level

    return "Regular"


def course_area(name: str) -> str:
    for area, pattern in AREA_PATTERNS:
        if pattern.search(name):
            return area

    return "Other"


def grade_points(grade: str) -> float | None:
    """A letter or a 0-100 score as points; pass/fail and blanks don't count."""

    text = (grade or "").strip().upper()

    if not text:
        return None

    match = re.match(r"^([ABCDEF])[+-]?$", text)

    if match:
        return LETTER_POINTS[match.group(1)]

    number = re.match(r"^(\d{2,3})(?:\.\d+)?%?$", text)

    if number:
        score = int(number.group(1))

        if score >= 90:
            return 4.0
        if score >= 80:
            return 3.0
        if score >= 70:
            return 2.0
        if score >= 60:
            return 1.0
        return 0.0

    return None


def _round(value: float) -> float:
    return round(value + 1e-9, 2)


def academic_record(transcripts: list[dict]) -> dict | None:
    """Courses, GPA, rigor and strongest subjects from transcript extractions."""

    courses = []
    in_progress: list[str] = []
    grade_or_year = ""
    institution = ""

    for extraction in transcripts:
        grade_or_year = grade_or_year or extraction.get("grade_or_year", "")
        institution = institution or extraction.get("institution", "")
        in_progress += [course for course in extraction.get("courses_in_progress") or [] if course not in in_progress]

        for course in extraction.get("courses_completed") or []:
            name = (course.get("name") or "").strip()

            if not name:
                continue

            points = grade_points(course.get("grade", ""))
            courses.append(
                {
                    "name": name,
                    "term": (course.get("term") or "").strip(),
                    "grade": (course.get("grade") or "").strip(),
                    "points": points,
                    "level": course_level(name),
                    "area": course_area(name),
                }
            )

    if not courses and not in_progress:
        return None

    graded = [course for course in courses if course["points"] is not None]
    unweighted = weighted = bright = None

    if graded:
        unweighted = _round(sum(course["points"] for course in graded) / len(graded))
        weighted = _round(sum(course["points"] + (LEVEL_BONUS[course["level"]] if course["points"] > 0 else 0) for course in graded) / len(graded))
        bright = _round(
            sum(course["points"] + (BRIGHT_FUTURES_BONUS if course["level"] != "Regular" and course["points"] > 0 else 0) for course in graded) / len(graded)
        )

    by_area: dict[str, list[float]] = defaultdict(list)

    for course in graded:
        if course["area"] != "Other":
            by_area[course["area"]].append(course["points"])

    areas = sorted(
        (
            {"area": area, "gpa": _round(sum(points) / len(points)), "courses": len(points)}
            for area, points in by_area.items()
        ),
        key=lambda item: (-item["gpa"], -item["courses"]),
    )

    rigor: dict[str, int] = defaultdict(int)

    for course in courses + [{"name": name, "level": course_level(name)} for name in in_progress]:
        if course["level"] != "Regular":
            rigor[course["level"]] += 1

    # First term vs latest term, when the transcript has more than one.
    terms: dict[str, list[float]] = defaultdict(list)

    for course in graded:
        if course["term"]:
            terms[course["term"]].append(course["points"])

    trend = ""

    if len(terms) >= 2:
        ordered = sorted(terms.items(), key=lambda item: _term_order(item[0]))
        first = sum(ordered[0][1]) / len(ordered[0][1])
        last = sum(ordered[-1][1]) / len(ordered[-1][1])
        trend = "rising" if last - first >= 0.2 else "falling" if first - last >= 0.2 else "steady"

    return {
        "institution": institution,
        "grade_or_year": grade_or_year,
        "courses": courses,
        "in_progress": in_progress,
        "gpa_unweighted": unweighted,
        "gpa_weighted": weighted,
        "gpa_bright_futures": bright,
        "graded_courses": len(graded),
        "rigor": dict(rigor),
        "areas": areas,
        "strong_areas": [item["area"] for item in areas if item["gpa"] >= 3.5][:4],
        "weak_areas": [item["area"] for item in areas if item["gpa"] < 2.5][:3],
        "trend": trend,
    }


def _term_order(term: str) -> tuple:
    years = re.findall(r"(20\d{2}|\d{2})", term)
    grade = re.search(r"\b(9|10|11|12)(?:th)?\b", term)
    season = 0 if re.search(r"fall|sem(ester)?\s*1|s1|q1|q2", term, re.IGNORECASE) else 1
    year = int(years[0]) if years else 0
    return (int(grade.group(1)) if grade else 0, year if year > 100 else year + 2000 if years else 0, season)


def service_hours_from_resume(extraction: dict, text: str) -> int | None:
    """Service hours the resume states: the extracted total, else the hours next to service words."""

    stated = extraction.get("service_hours")

    if isinstance(stated, (int, float)) and stated > 0:
        return int(stated)

    total = 0

    for line in (text or "").splitlines():
        if not SERVICE_WORDS.search(line):
            continue

        for match in HOURS_PATTERN.finditer(line):
            hours = int(match.group(1))

            if 0 < hours <= 2000:
                total = max(total, hours) if "total" in line.lower() else total + hours

    return total or None


def resume_record(extraction: dict, text: str) -> dict:
    keys = ["activities", "leadership", "volunteering", "awards", "work_experience", "projects", "skills", "education"]

    record = {key: [item for item in extraction.get(key) or [] if item] for key in keys}
    record["summary"] = extraction.get("summary", "")
    record["service_hours"] = service_hours_from_resume(extraction, text)

    return record


RESUME_CHECKLIST = [
    ("activities", "Clubs, teams and activities", "List every club, team, band, robotics, scouts or church group, with your role and years."),
    ("leadership", "Leadership", "Officer roles, captain, team lead, tutoring or mentoring others all count."),
    ("volunteering", "Volunteering and service hours", "Write where you volunteered and how many hours. Bright Futures counts service hours."),
    ("work_experience", "Jobs and work", "Part-time jobs, babysitting, family business, internships, paid or unpaid."),
    ("awards", "Awards and honors", "Honor roll, competitions, certificates, AP Scholar, sports awards."),
    ("projects", "Projects", "Things you built, made or researched on your own: apps, art, science fair, YouTube channel."),
    ("skills", "Skills", "Languages you speak, software, coding, instruments, certifications."),
]


def resume_checklist(resume: dict | None) -> list[dict]:
    return [
        {
            "key": key,
            "label": label,
            "hint": hint,
            "count": len((resume or {}).get(key) or []),
            "done": bool((resume or {}).get(key)),
        }
        for key, label, hint in RESUME_CHECKLIST
    ]


async def _documents(student_id: str) -> tuple[list[dict], dict | None, str]:
    async with AsyncSessionLocal() as db:
        records = (
            await db.execute(
                select(ResumeDocument)
                .where(
                    ResumeDocument.student_id == student_id,
                    ResumeDocument.is_active.is_(True),
                    ResumeDocument.deleted_at.is_(None),
                    ResumeDocument.status == "processed",
                )
                .order_by(ResumeDocument.uploaded_at.desc())
            )
        ).scalars().all()

    transcripts = []
    resume = None
    resume_text = ""

    for record in records:
        extraction = (record.parsed_profile_json or {}).get("extraction") or {}

        if record.doc_type == "transcript" and extraction:
            transcripts.append(extraction)
        elif record.doc_type == "resume" and extraction and resume is None:
            resume = extraction
            resume_text = record.extracted_text or ""

    return transcripts, resume, resume_text


def _int(value) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None

    return number if number > 0 else None


async def build_record(student_id: str, profile: dict) -> dict:
    from app.services import college_match  # avoids an import cycle

    transcripts, resume_extraction, resume_text = await _documents(student_id)
    academics = academic_record(transcripts)
    resume = resume_record(resume_extraction, resume_text) if resume_extraction else None

    told = profile.get("academic_profile") or {}
    sat = _int(told.get("sat"))
    act = _int(told.get("act"))
    stated_hours = _int(told.get("service_hours"))
    resume_hours = (resume or {}).get("service_hours")
    hours = stated_hours if stated_hours is not None else resume_hours
    hours_source = "you told us" if stated_hours is not None else "your resume" if resume_hours else ""

    scores = profile.get("interest_scores") or {}
    riasec = None

    if scores:
        from app.services import interest_quiz

        top = interest_quiz.top_types(scores)
        riasec = {
            "code": "".join(interest_quiz.LETTERS.get(kind, kind[0]) for kind in top),
            "top": top,
            "labels": [career_catalog.INTEREST_LABELS[kind] for kind in top],
            "scores": scores,
        }

    record = {
        "academics": academics,
        "tests": {"sat": sat, "act": act, "plan": told.get("test_plan", "")},
        "service_hours": hours,
        "service_hours_source": hours_source,
        "paid_work_hours": _int(told.get("paid_hours")),
        "resume": resume,
        "resume_checklist": resume_checklist(resume),
        "riasec": riasec,
        "intended_major": (told.get("intended_major") or "").strip(),
        "interests_told": told.get("interests", ""),
        "major_minor": profile.get("major_minor") or None,
        "grade_level": profile.get("grade_level", ""),
    }

    record["bright_futures"] = college_match.bright_futures(record)
    record["missing"] = missing_pieces(record)

    return record


def missing_pieces(record: dict) -> list[dict]:
    """What would make the advice better, most important first."""

    missing = []

    if not record["academics"]:
        missing.append({"key": "transcript", "label": "Upload your transcript", "why": "Your grades decide which colleges and scholarships are realistic."})

    if not record["resume"]:
        missing.append({"key": "resume", "label": "Upload your resume", "why": "Your activities, jobs and service show what you're good at."})
    elif sum(item["done"] for item in record["resume_checklist"]) < 4:
        missing.append({"key": "resume_more", "label": "Add more to your resume", "why": "Put in everything you've done, even small things. It all counts."})

    if not record["riasec"]:
        missing.append({"key": "quiz", "label": "Take the interest quiz", "why": "Your interest type picks your minor and shapes your major."})

    if not (record["tests"]["sat"] or record["tests"]["act"]):
        missing.append({"key": "tests", "label": "Add SAT or ACT scores", "why": "Scores sort colleges into reach, match and likely. Practice scores are fine."})

    if record["service_hours"] is None:
        missing.append({"key": "hours", "label": "Add your service hours", "why": "Bright Futures needs 75 to 100 hours."})

    return missing


def record_text(record: dict) -> str:
    """The record as the model sees it. Only facts from the student's own records."""

    lines = []
    academics = record.get("academics")

    if academics:
        if academics["gpa_unweighted"] is not None:
            lines.append(
                f"- GPA from transcript (calculated by the app from {academics['graded_courses']} graded courses): "
                f"unweighted {academics['gpa_unweighted']:.2f}, weighted {academics['gpa_weighted']:.2f}"
            )

        if academics["rigor"]:
            lines.append("- Advanced courses: " + ", ".join(f"{count} {level}" for level, count in academics["rigor"].items()))

        if academics["areas"]:
            lines.append(
                "- Grades by subject (GPA): "
                + ", ".join(f"{item['area']} {item['gpa']:.1f} ({item['courses']} courses)" for item in academics["areas"][:7])
            )

        if academics["trend"]:
            lines.append(f"- Grade trend across terms: {academics['trend']}")

        graded = [f"{course['name']} {course['grade']}" for course in academics["courses"] if course["grade"]][:30]

        if graded:
            lines.append("- Courses and grades: " + "; ".join(graded))

        if academics["in_progress"]:
            lines.append("- Taking now: " + ", ".join(academics["in_progress"][:10]))
    else:
        lines.append("- No transcript yet, so no GPA.")

    tests = record.get("tests") or {}

    if tests.get("sat") or tests.get("act"):
        parts = [f"SAT {tests['sat']}" if tests.get("sat") else "", f"ACT {tests['act']}" if tests.get("act") else ""]
        lines.append("- Test scores the student gave: " + ", ".join(part for part in parts if part))
    elif tests.get("plan"):
        lines.append(f"- Test plans: {tests['plan']}")

    if record.get("service_hours") is not None:
        lines.append(f"- Service hours: {record['service_hours']} (from {record['service_hours_source']})")

    resume = record.get("resume")

    if resume:
        for key, label in [
            ("activities", "Activities"),
            ("leadership", "Leadership"),
            ("volunteering", "Volunteering"),
            ("work_experience", "Work"),
            ("awards", "Awards"),
            ("projects", "Projects"),
            ("skills", "Skills"),
        ]:
            if resume.get(key):
                lines.append(f"- {label} (resume): " + "; ".join(resume[key][:8]))
    else:
        lines.append("- No resume yet.")

    riasec = record.get("riasec")

    if riasec:
        lines.append(f"- Interest type (RIASEC): {riasec['code']} ({', '.join(riasec['top'])})")

    if record.get("intended_major"):
        lines.append(f"- Major the student wants: {record['intended_major']}")

    if record.get("interests_told"):
        lines.append(f"- Interests the student told the quiz: {record['interests_told']}")

    chosen = record.get("major_minor") or {}

    if chosen.get("options"):
        first = chosen["options"][0]
        lines.append(f"- Suggested major and minor: {first['major']['title']} with a minor in {first['minor']['title']}")

    bright = record.get("bright_futures") or {}

    if bright.get("summary"):
        lines.append(f"- Bright Futures check (app's estimate): {bright['summary']}")

    return "\n".join(lines)
