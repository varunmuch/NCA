"""
Write app/data/field_quiz_items.json: 4 quiz activities per catalog career,
rewritten from its real O*NET tasks by the local model, each kept with the
task it came from so a reviewer can check the meaning. Existing careers are
skipped unless --all.

Usage (from backend/, model running):
  .venv/bin/python -m scripts.build_field_quiz_items
  .venv/bin/python -m scripts.build_field_quiz_items --all
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import career_catalog, field_quiz  # noqa: E402


async def main(args: argparse.Namespace) -> None:
    data = field_quiz._load(field_quiz.ITEMS_PATH)
    data["about"] = (
        "Focused-quiz activities: each catalog career's O*NET tasks rewritten for high "
        "school students by the local model (app/services/field_quiz.py). Each item keeps "
        "its source task. Not yet reviewed by a school counselor."
    )
    data["reviewed"] = False
    failed = []

    for career in career_catalog.load_catalog()["careers"]:
        if career.get("added") or (career["slug"] in data["careers"] and not args.all):
            continue

        try:
            data["careers"][career["slug"]] = await field_quiz.generate_items(career)
            print(f"ok   {career['title']}", flush=True)
        except Exception as exc:  # keep going; report at the end
            failed.append(career["slug"])
            print(f"FAIL {career['title']}: {exc}", flush=True)

        field_quiz.ITEMS_PATH.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"\n{len(data['careers'])} careers with activities; failed: {failed or 'none'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--all", action="store_true", help="regenerate every career")
    asyncio.run(main(parser.parse_args()))
