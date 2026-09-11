import httpx

from sqlalchemy import select

from app.core.config import config
from app.core.database import AsyncSessionLocal
from app.db.models import (
    Message,
    StudentMemory,
)


MODEL_NAME = config["model"]["name"]
VLLM_BASE_URL = config["model"]["base_url"]
TIMEOUT_SECONDS = config["model"]["timeout_seconds"]

TRIGGER_TOKENS = config["memory"]["compression_trigger_tokens"]
TARGET_TOKENS = config["memory"]["compression_target_tokens"]
RECENT_MESSAGE_COUNT = config["memory"]["recent_message_count"]


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


async def compress_memory_if_needed(student_id: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Message)
            .where(
                Message.student_id == student_id,
                Message.summarized.is_(False),
            )
            .order_by(Message.id.asc())
        )

        unsummarized_messages = result.scalars().all()

        if len(unsummarized_messages) <= RECENT_MESSAGE_COUNT:
            return

        combined = "\n".join(
            f"{message.role}: {message.content}"
            for message in unsummarized_messages
        )

        if estimate_tokens(combined) < TRIGGER_TOKENS:
            return

        messages_to_compress = unsummarized_messages[:-RECENT_MESSAGE_COUNT]

        if not messages_to_compress:
            return

        result = await db.execute(
            select(StudentMemory).where(
                StudentMemory.student_id == student_id
            )
        )

        memory = result.scalar_one_or_none()

        if memory is None:
            memory = StudentMemory(
                student_id=student_id,
                summary="",
            )
            db.add(memory)
            await db.flush()

        old_summary = memory.summary or ""

        transcript = "\n".join(
            f"{message.role}: {message.content}"
            for message in messages_to_compress
        )

        compression_prompt = f"""
You maintain long-term memory for one student inside a Career Intelligence Engine.

Existing long-term memory:
{old_summary}

Older conversation to incorporate:
{transcript}

Create an updated compact memory.

Preserve only information useful for future career guidance:
- education
- current role
- target roles
- skills
- skill levels when stated
- certifications
- experience
- projects
- interests
- constraints
- career preferences
- career transitions
- completed milestones
- important corrections
- latest decisions

Rules:
- Newer information overrides older conflicting information.
- Do not invent facts.
- Do not include unrelated casual conversation.
- Keep the memory compact and factual.
"""

        payload = {
            "model": MODEL_NAME,
            "messages": [
                {
                    "role": "system",
                    "content": "You are the memory compression component of CIE.",
                },
                {
                    "role": "user",
                    "content": compression_prompt,
                },
            ],
            "temperature": 0,
            "max_tokens": TARGET_TOKENS,
        }

        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{VLLM_BASE_URL}/v1/chat/completions",
                json=payload,
            )

            response.raise_for_status()

            result = response.json()

            new_summary = result["choices"][0]["message"]["content"]

        memory.summary = new_summary

        for message in messages_to_compress:
            message.summarized = True

        await db.commit()
