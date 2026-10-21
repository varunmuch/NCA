"""
Replay sample counselor turns and report latency.

Creates a throwaway test student (never a real account), runs ~20 turns
through counselor_service.run_turn exactly as the API does, then deletes
the test student and everything it owns.

Turns run through run_turn_stream, the path the chat uses, so the numbers
are what a student sees:
  - ttft: from sending the message to the first reply text
  - text: until the reply text is complete
  - total: until the done event (extras validated, everything saved)

One conversation runs 9 turns so the background summary is triggered and
timed. --probe also replays each prompt straight to vLLM (plain text) for
comparison with the pre-streaming baseline.

Usage (from backend/, services running):
  .venv/bin/python -m scripts.bench_latency            # run and report
  .venv/bin/python -m scripts.bench_latency --json out.json
  .venv/bin/python -m scripts.bench_latency --probe    # add direct vLLM probes
"""

import argparse
import asyncio
import json
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import httpx
from sqlalchemy import delete

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.core.llm import MODEL_NAME, VLLM_BASE_URL  # noqa: E402
from app.db.models import Student  # noqa: E402
from app.services import counselor_service  # noqa: E402
from app.services.context_service import build_context  # noqa: E402
from app.services.conversation_service import get_owned_conversation  # noqa: E402
from app.services.memory_service import ensure_student  # noqa: E402
from app.services.student_service import save_profile_dict  # noqa: E402


PROFILE = {
    "name": "Bench Test",
    "preferred_name": "Sam",
    "grade_level": "10th grade",
    "favorite_subjects": ["Art", "Biology"],
    "interests": ["drawing", "video games"],
    "career_status": "exploring",
    "onboarding_completed": True,
}

# (action, text) per turn; one list per conversation.
CONVERSATIONS = [
    [
        (None, "hi"),
        (None, "I'm in 10th grade and honestly I have no idea what I want to do"),
        (None, "I like art class and I'm pretty good at drawing"),
        (None, "I'm not sure, maybe something with computers too?"),
        (None, "what would I need to study for that?"),
    ],
    [
        (None, "I want to be a nurse"),
        (None, "what classes should I take in high school?"),
        (None, "how long does nursing school take?"),
        (None, "are there cheaper options than a 4-year college?"),
        (None, "what can I do this summer to get experience?"),
        (None, "do hospitals let high schoolers volunteer?"),
        (None, "I also kind of like chemistry"),
        (None, "is pharmacy a good fit for that?"),
        (None, "ok what should I do first?"),
    ],
    [
        (None, "how much do astronauts make in Florida?"),
        (None, "what scholarships can I get?"),
        (None, "I hate math, can I still be an engineer?"),
        (None, "my parents want me to be a doctor but I like music"),
        (None, "can you make me a plan?"),
    ],
    [
        (None, "I'm interested in being a software developer"),
        ("skill_check", "What skills do I need to become a software developer?"),
        (None, "thanks, what kind of projects could I do?"),
        ("project_ideas", "Give me a project idea for software development"),
        (None, "ok cool"),
    ],
]


async def stream_probe(messages: list[dict], *, schema: dict | None, max_tokens: int) -> dict:
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.5,
        "stream": True,
        "stream_options": {"include_usage": True},
    }

    if schema is not None:
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "counselor_turn", "schema": schema},
        }

    started = time.monotonic()
    first = None
    usage = {}

    async with httpx.AsyncClient(timeout=300) as client:
        async with client.stream("POST", f"{VLLM_BASE_URL}/v1/chat/completions", json=payload) as response:
            response.raise_for_status()

            async for line in response.aiter_lines():
                if not line.startswith("data: ") or line == "data: [DONE]":
                    continue

                chunk = json.loads(line[6:])

                if chunk.get("usage"):
                    usage = chunk["usage"]

                for choice in chunk.get("choices") or []:
                    if first is None and (choice.get("delta") or {}).get("content"):
                        first = time.monotonic() - started

    total = time.monotonic() - started
    completion = usage.get("completion_tokens") or 0

    return {
        "ttft": round(first or total, 3),
        "total": round(total, 3),
        "prompt_tokens": usage.get("prompt_tokens") or 0,
        "completion_tokens": completion,
        "decode_tps": round(completion / (total - (first or 0)), 1) if completion and total > (first or 0) else 0,
    }


def pct(values: list[float], q: float) -> float:
    if not values:
        return 0.0

    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(q * (len(ordered) - 1))))
    return ordered[index]


def summary(values: list[float]) -> str:
    if not values:
        return "n/a"

    return (
        f"p50 {statistics.median(values):6.2f}s   p95 {pct(values, 0.95):6.2f}s   "
        f"min {min(values):6.2f}s   max {max(values):6.2f}s   (n={len(values)})"
    )


async def main(args: argparse.Namespace) -> None:
    student_id = f"bench-latency-{uuid4().hex[:12]}"
    await ensure_student(student_id)
    await save_profile_dict(student_id, PROFILE)

    rows: list[dict] = []

    try:
        for index, turns in enumerate(CONVERSATIONS, start=1):
            conversation_id = None

            for number, (action, text) in enumerate(turns, start=1):
                started = time.monotonic()
                first = text_done = None
                result = None

                async for event in counselor_service.run_turn_stream(
                    student_id, conversation_id=conversation_id, text=text, action=action
                ):
                    if event["event"] == "delta":
                        text_done = time.monotonic() - started
                        first = text_done if first is None else first
                    elif event["event"] in ("done", "error"):
                        result = event

                wall = time.monotonic() - started
                conversation_id = result["conversation_id"]
                timing = dict(counselor_service.last_turn_timing.get() or {})
                row = {
                    "conversation": index,
                    "turn": number,
                    "action": action or "chat",
                    "wall": round(wall, 3),
                    "ttft": round(first if first is not None else wall, 3),
                    "text": round(text_done if text_done is not None else wall, 3),
                    "reply_chars": len(result["assistant_message"]["content"] or ""),
                    **timing,
                }

                if args.probe and action is None and timing.get("ok"):
                    conversation = await get_owned_conversation(student_id, conversation_id)
                    context = await build_context(student_id, conversation, text)
                    context["turns"] = context["turns"][:-1]
                    messages = counselor_service.counselor_messages(context, context["name"])
                    row["stream_text"] = await stream_probe(messages, schema=None, max_tokens=600)

                rows.append(row)
                print(
                    f"conv {index} turn {number} {row['action']:<13} ttft {row['ttft']:5.2f}s  "
                    f"text {row['text']:5.2f}s  total {row.get('total', wall):5.2f}s  "
                    f"extras {row.get('extras', 0):4.2f}s  prompt {row.get('prompt_tokens', 0):5}  "
                    f"out {row.get('completion_tokens', 0):4}  chars {row['reply_chars']}",
                    flush=True,
                )

            started = time.monotonic()
            await counselor_service.summarize_if_needed(conversation_id)
            rows.append({"conversation": index, "action": "summarize", "wall": round(time.monotonic() - started, 3)})
    finally:
        if not args.keep:
            async with AsyncSessionLocal() as db:
                await db.execute(delete(Student).where(Student.id == student_id))
                await db.commit()

    chat = [row for row in rows if row["action"] == "chat" and row.get("ok")]
    modules = [row for row in rows if row["action"] not in ("chat", "summarize") and row.get("ok")]
    failed = [row for row in rows if row["action"] != "summarize" and not row.get("ok")]

    print("\n=== Chat turns (streamed, as the student sees them)")
    print("time to first token", summary([row["ttft"] for row in chat]))
    print("reply text complete", summary([row["text"] for row in chat]))
    print("done (extras saved) ", summary([row["total"] for row in chat]))

    for stage in ("setup", "context", "first_token", "reply", "extras", "validate", "save"):
        print(f"  {stage:<17}", summary([row.get(stage, 0) for row in chat]))

    print("prompt tokens (both calls) p50", statistics.median([row["prompt_tokens"] for row in chat]) if chat else "n/a",
          " max", max((row["prompt_tokens"] for row in chat), default=0))
    print("output tokens (both calls) p50", statistics.median([row["completion_tokens"] for row in chat]) if chat else "n/a",
          " max", max((row["completion_tokens"] for row in chat), default=0))
    print("reply length chars p50", statistics.median([row["reply_chars"] for row in chat]) if chat else "n/a")

    probes = [row for row in chat if "stream_text" in row]

    if probes:
        print("\n=== Same prompts streamed straight from vLLM (plain text)")
        print("TTFT ", summary([row["stream_text"]["ttft"] for row in probes]))
        print("total", summary([row["stream_text"]["total"] for row in probes]))

    if modules:
        print("\n=== Deep-dive modules")
        print("turn total      ", summary([row["total"] for row in modules]))

    summaries = [row["wall"] for row in rows if row["action"] == "summarize"]
    print("\nsummarize (background today)", summary(summaries))
    print(f"failed turns: {len(failed)}")

    if args.json:
        Path(args.json).write_text(
            json.dumps({"ran_at": datetime.now(timezone.utc).isoformat(), "rows": rows}, indent=2)
        )
        print(f"wrote {args.json}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--json", help="also write raw rows to this file")
    parser.add_argument("--keep", action="store_true", help="keep the test student afterwards")
    parser.add_argument("--probe", action="store_true", help="also replay prompts straight to vLLM")
    asyncio.run(main(parser.parse_args()))
