"""
Write app/data/onet_job_titles.tsv from O*NET's "Job Titles.txt": every
official job title (54,000+), the occupation it belongs to, its short form,
and how many sources reported it. Used to validate careers students name
("AI Engineer" is an official title within Computer and Information
Research Scientists; "Unicorn Wrangler" is not).

Usage:
  python scripts/build_title_index.py /path/to/db_31_0_text

O*NET 31.0 Database by USDOL/ETA, used under the CC BY 4.0 license.
"""

import csv
import sys
from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[1] / "app" / "data" / "onet_job_titles.tsv"


def main(directory: Path) -> None:
    rows = []

    with open(directory / "Job Titles.txt", encoding="utf-8", newline="") as file:
        for row in csv.DictReader(file, delimiter="\t"):
            short = row["Short Title"].strip()
            rows.append(
                (
                    row["O*NET-SOC Code"].strip(),
                    row["Job Title"].strip(),
                    "" if short == "n/a" else short,
                    str(len([source for source in row["Source(s)"].split(",") if source.strip()])),
                )
            )

    with open(OUTPUT, "w", encoding="utf-8", newline="") as file:
        file.write("# O*NET 31.0 Job Titles (USDOL/ETA, CC BY 4.0): code, title, short title, sources\n")
        csv.writer(file, delimiter="\t", lineterminator="\n").writerows(rows)

    print(f"wrote {len(rows)} titles to {OUTPUT}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
