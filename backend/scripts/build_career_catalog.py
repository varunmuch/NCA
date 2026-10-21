"""
Build app/data/careers.json from the O*NET database (text format).

Usage:
    python scripts/build_career_catalog.py /path/to/db_31_0_text

The catalog is a curated subset of O*NET occupations relevant to high
school career exploration. Every field comes from O*NET data except
the career family grouping and the knowledge-to-school-subject mapping,
which are fixed lookup tables below. No salary or outlook figures are
included.

O*NET 31.0 Database by the U.S. Department of Labor, Employment and
Training Administration (USDOL/ETA), used under the CC BY 4.0 license.
"""

import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path


FAMILIES = {
    "technology": "Technology & Computing",
    "health": "Health & Medicine",
    "science": "Science & Research",
    "engineering": "Engineering & Architecture",
    "arts": "Arts, Design & Media",
    "business": "Business & Finance",
    "education": "Education & Helping People",
    "law": "Law, Government & Public Safety",
    "trades": "Skilled Trades & Transportation",
    "environment": "Environment & Agriculture",
    "hospitality": "Food, Sports & Recreation",
}


CATALOG = {
    "technology": [
        "15-1252.00", "15-1212.00", "15-2051.00", "15-1254.00",
        "15-1255.00", "15-1255.01", "15-1244.00", "15-1232.00",
        "15-1221.00", "15-1211.00",
    ],
    "health": [
        "29-1141.00", "29-1215.00", "29-1021.00", "29-1051.00",
        "29-1123.00", "29-1071.00", "29-2042.00", "29-1131.00",
        "29-1127.00", "29-2034.00", "31-9091.00", "29-1031.00",
        "29-1122.00",
    ],
    "science": [
        "19-1042.00", "19-2021.00", "19-1029.04", "19-2031.00",
        "19-2041.00", "19-3033.00", "19-4092.00", "19-2011.00",
        "19-1023.00",
    ],
    "engineering": [
        "17-2141.00", "17-2051.00", "17-2071.00", "17-2011.00",
        "17-2031.00", "17-2081.00", "17-2199.08", "17-1011.00",
        "17-3013.00",
    ],
    "arts": [
        "27-1024.00", "27-1014.00", "27-1025.00", "27-1022.00",
        "27-3023.00", "27-4021.00", "27-2042.00", "27-3043.00",
        "27-4032.00", "27-1021.00",
    ],
    "business": [
        "13-2011.00", "13-2051.00", "11-2021.00", "13-1161.00",
        "11-1021.00", "13-1071.00", "13-1121.00", "15-2011.00",
    ],
    "education": [
        "25-2031.00", "25-2021.00", "21-1012.00", "21-1021.00",
        "25-4022.00",
    ],
    "law": [
        "23-1011.00", "23-2011.00", "33-2011.00", "33-3051.00",
        "19-3011.00", "19-3094.00",
    ],
    "trades": [
        "47-2111.00", "47-2152.00", "49-3023.00", "47-2031.00",
        "49-9021.00", "51-4121.00", "49-3011.00", "53-2011.00",
    ],
    "environment": [
        "19-1031.00", "19-1013.00", "19-1032.00", "47-2231.00",
        "11-9013.00",
    ],
    "hospitality": [
        "35-1011.00", "27-2022.00", "29-9091.00", "39-9031.00",
    ],
}


# O*NET knowledge areas mapped to familiar high school subjects.
KNOWLEDGE_TO_SUBJECT = {
    "Mathematics": "Math",
    "Biology": "Biology",
    "Chemistry": "Chemistry",
    "Physics": "Physics",
    "English Language": "English",
    "Fine Arts": "Art & Music",
    "Design": "Art & Design",
    "Computers and Electronics": "Computer Science",
    "Engineering and Technology": "Engineering & Technology",
    "Psychology": "Psychology",
    "Sociology and Anthropology": "Social Studies",
    "History and Archeology": "History",
    "Geography": "Geography",
    "Law and Government": "Government & Civics",
    "Economics and Accounting": "Economics",
    "Foreign Language": "World Languages",
    "Communications and Media": "Journalism & Media",
    "Medicine and Dentistry": "Health Science",
    "Therapy and Counseling": "Health Science",
    "Education and Training": "Education",
    "Sales and Marketing": "Business",
    "Administration and Management": "Business",
    "Mechanical": "Technical Education",
    "Building and Construction": "Technical Education",
    "Food Production": "Agriculture",
    "Philosophy and Theology": "Philosophy",
}


INTEREST_NAMES = {
    "1.B.1.a": "Realistic",
    "1.B.1.b": "Investigative",
    "1.B.1.c": "Artistic",
    "1.B.1.d": "Social",
    "1.B.1.e": "Enterprising",
    "1.B.1.f": "Conventional",
}

# Friendly labels shown to students for the RIASEC interest codes.
INTEREST_LABELS = {
    "Realistic": "Hands-on building and fixing",
    "Investigative": "Solving problems and researching",
    "Artistic": "Creating and designing",
    "Social": "Helping and teaching people",
    "Enterprising": "Leading and persuading",
    "Conventional": "Organizing and working with details",
}


def read_tsv(directory: Path, name: str):
    with open(directory / name, encoding="utf-8", newline="") as file:
        yield from csv.DictReader(file, delimiter="\t")


def slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug[:80]


def main(directory: Path) -> None:
    wanted = {
        code: family
        for family, codes in CATALOG.items()
        for code in codes
    }

    occupations = {
        row["O*NET-SOC Code"]: row
        for row in read_tsv(directory, "Occupation Data.txt")
        if row["O*NET-SOC Code"] in wanted
    }

    missing = sorted(set(wanted) - set(occupations))

    if missing:
        print("Skipping codes not in this O*NET release:", missing)

    core_tasks = defaultdict(list)
    other_tasks = defaultdict(list)

    for row in read_tsv(directory, "Task Statements.txt"):
        code = row["O*NET-SOC Code"]

        if code not in occupations:
            continue

        if row["Task Type"] == "Core":
            core_tasks[code].append(row["Task"])
        else:
            other_tasks[code].append(row["Task"])

    # Some occupations have no tasks rated "Core" in a release.
    tasks = {
        code: core_tasks[code] or other_tasks[code]
        for code in occupations
    }

    knowledge = defaultdict(list)

    for row in read_tsv(directory, "Knowledge.txt"):
        code = row["O*NET-SOC Code"]

        if code in occupations and row["Scale ID"] == "IM":
            knowledge[code].append(
                (float(row["Data Value"]), row["Element Name"])
            )

    skills = defaultdict(list)

    for name in ("Essential Skills.txt", "Transferable Skills.txt"):
        for row in read_tsv(directory, name):
            code = row["O*NET-SOC Code"]

            if code in occupations and row["Scale ID"] == "IM":
                skills[code].append(
                    (float(row["Data Value"]), row["Element Name"])
                )

    interests = defaultdict(list)

    for row in read_tsv(directory, "Career Interest Types.txt"):
        code = row["O*NET-SOC Code"]

        if (
            code in occupations
            and row["Scale ID"] == "OI"
            and row["Element ID"] in INTEREST_NAMES
        ):
            interests[code].append(
                (float(row["Data Value"]), INTEREST_NAMES[row["Element ID"]])
            )

    job_zone_reference = {
        row["Job Zone"]: row
        for row in read_tsv(directory, "Job Zone Reference.txt")
    }

    job_zones = {
        row["O*NET-SOC Code"]: row["Job Zone"]
        for row in read_tsv(directory, "Job Zones.txt")
        if row["O*NET-SOC Code"] in occupations
    }

    education_labels = {
        row["Category"]: row["Category Description"]
        for row in read_tsv(directory, "Education Categories.txt")
        if row["Scale ID"] == "RL"
    }

    education = defaultdict(list)

    for row in read_tsv(directory, "Education.txt"):
        code = row["O*NET-SOC Code"]

        if code in occupations and row["Scale ID"] == "RL":
            education[code].append(
                (float(row["Data Value"]), row["Category"])
            )

    titles = defaultdict(list)

    for row in read_tsv(directory, "Sample of Reported Titles.txt"):
        code = row["O*NET-SOC Code"]

        if code in occupations and row["Shown in My Next Move"] == "Y":
            titles[code].append(row["Reported Job Title"])

    related = defaultdict(list)

    for row in read_tsv(directory, "Related Occupations.txt"):
        code = row["O*NET-SOC Code"]
        other = row["Related O*NET-SOC Code"]

        if code in occupations and other in occupations:
            related[code].append((int(row["Index"]), other))

    slugs = {
        code: slugify(row["Title"])
        for code, row in occupations.items()
    }

    careers = []

    for code, row in occupations.items():
        top_knowledge = sorted(knowledge[code], reverse=True)

        subjects = []

        for value, name in top_knowledge:
            subject = KNOWLEDGE_TO_SUBJECT.get(name)

            if value >= 3.0 and subject and subject not in subjects:
                subjects.append(subject)

        top_interests = [
            name for value, name in sorted(interests[code], reverse=True)[:3]
        ]

        zone = job_zones.get(code)
        zone_row = job_zone_reference.get(zone or "")

        education_rows = sorted(education[code], reverse=True)

        careers.append(
            {
                "slug": slugs[code],
                "onet_code": code,
                "title": row["Title"],
                "family": wanted[code],
                "description": row["Description"],
                "tasks": tasks[code][:7],
                "knowledge": [
                    name for _, name in top_knowledge[:6]
                ],
                "subjects": subjects[:5],
                "skills": [
                    name for _, name in sorted(skills[code], reverse=True)[:8]
                ],
                "interests": top_interests,
                "interest_labels": [
                    INTEREST_LABELS[name] for name in top_interests
                ],
                "job_zone": int(zone) if zone else None,
                "preparation": zone_row["Name"] if zone_row else "",
                "education_summary": zone_row["Education"] if zone_row else "",
                "common_education": [
                    {
                        "level": education_labels.get(category, category),
                        "percent": round(value),
                    }
                    for value, category in education_rows[:3]
                    if value >= 5
                ],
                "sample_titles": titles[code][:6],
                "related": [
                    slugs[other] for _, other in sorted(related[code])[:6]
                ],
                "source_url": (
                    f"https://www.onetonline.org/link/summary/{code}"
                ),
            }
        )

    careers.sort(key=lambda career: career["title"])

    output = {
        "source": {
            "name": "O*NET 31.0 Database",
            "publisher": (
                "U.S. Department of Labor, Employment and Training "
                "Administration (USDOL/ETA)"
            ),
            "license": "CC BY 4.0",
            "license_url": "https://creativecommons.org/licenses/by/4.0/",
            "url": "https://www.onetcenter.org/database.html",
            "modifications": (
                "Curated subset; tasks, skills, and knowledge trimmed to the "
                "most important items; knowledge areas mapped to school "
                "subjects; grouped into career families by NeoCity Academy."
            ),
        },
        "families": [
            {"key": key, "label": label}
            for key, label in FAMILIES.items()
        ],
        "careers": careers,
    }

    target = (
        Path(__file__).resolve().parents[1]
        / "app"
        / "data"
        / "careers.json"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, indent=1), encoding="utf-8")

    print(f"Wrote {len(careers)} careers to {target}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    main(Path(sys.argv[1]))
