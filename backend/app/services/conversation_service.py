"""
Conversation threads and messages, always scoped to the owning student.
"""

import json
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import delete, func, select

from app.core.database import AsyncSessionLocal
from app.db.models import Conversation, Message


DEFAULT_TITLE = "New conversation"


# Assistant messages saved before the redesign hold a module's JSON result.
LEGACY_MODULE_KEYS = {
    "missing_core_skills": "skill_check",
    "project_title": "project_ideas",
    "recommended_first_certification": "certificates",
    "interview_type": "interview_practice",
    "recommended_next_roles": "career_roadmap",
}


def _legacy_module(content: str) -> dict | None:
    if not content.startswith("{"):
        return None

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return None

    if not isinstance(data, dict):
        return None

    for key, module_type in LEGACY_MODULE_KEYS.items():
        if key in data:
            return {"type": module_type, "result": data}

    return None


def message_to_dict(message: Message) -> dict:
    metadata = dict(message.metadata_json or {})
    content = message.content

    if message.role == "assistant" and "module" not in metadata:
        module = _legacy_module(content)

        if module is not None:
            metadata["module"] = module
            content = ""

    return {
        "id": message.id,
        "role": message.role,
        "content": content,
        "metadata": metadata,
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }


def message_as_model_text(message: Message) -> str:
    """
    How a stored message is shown to the model in later turns.
    """

    metadata = message.metadata_json or {}

    if message.role != "assistant":
        return message.content

    module = metadata.get("module") or _legacy_module(message.content)

    if module is not None:
        result = module.get("result") or {}
        target = result.get("target_role") or result.get("project_title") or ""
        return (
            f"[Shared a {module['type'].replace('_', ' ')} card"
            f"{' for ' + target if target else ''}.]"
        )

    text = message.content

    if metadata.get("follow_up_question"):
        text = f"{text}\n\n{metadata['follow_up_question']}"

    return text


def conversation_to_dict(conversation: Conversation, preview: str = "") -> dict:
    return {
        "id": conversation.id,
        "title": conversation.title,
        "is_legacy": conversation.is_legacy,
        "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
        "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
        "preview": preview,
    }


async def list_conversations(student_id: str, *, limit: int = 50) -> list[dict]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Conversation)
            .where(
                Conversation.student_id == student_id,
                Conversation.deleted_at.is_(None),
            )
            .order_by(Conversation.updated_at.desc())
            .limit(limit)
        )
        conversations = result.scalars().all()

        if not conversations:
            return []

        # Latest student message per conversation, for previews.
        latest = (
            select(
                Message.conversation_id,
                func.max(Message.id).label("message_id"),
            )
            .where(
                Message.conversation_id.in_([item.id for item in conversations]),
                Message.role == "user",
            )
            .group_by(Message.conversation_id)
            .subquery()
        )
        preview_rows = await db.execute(
            select(Message.conversation_id, Message.content).join(
                latest, Message.id == latest.c.message_id
            )
        )
        previews = {
            conversation_id: content[:140]
            for conversation_id, content in preview_rows.all()
        }

        return [
            conversation_to_dict(item, previews.get(item.id, ""))
            for item in conversations
        ]


async def create_conversation(student_id: str, title: str = DEFAULT_TITLE) -> Conversation:
    now = datetime.utcnow()

    async with AsyncSessionLocal() as db:
        conversation = Conversation(
            id=str(uuid4()),
            student_id=student_id,
            title=(title.strip() or DEFAULT_TITLE)[:255],
            created_at=now,
            updated_at=now,
        )
        db.add(conversation)
        await db.commit()

        return conversation


async def get_owned_conversation(student_id: str, conversation_id: str) -> Conversation:
    async with AsyncSessionLocal() as db:
        conversation = await db.get(Conversation, conversation_id)

    if (
        conversation is None
        or conversation.student_id != student_id
        or conversation.deleted_at is not None
    ):
        raise HTTPException(status_code=404, detail="Conversation not found.")

    return conversation


async def get_messages(conversation_id: str, *, limit: int | None = None) -> list[Message]:
    async with AsyncSessionLocal() as db:
        query = select(Message).where(Message.conversation_id == conversation_id)

        if limit is not None:
            query = query.order_by(Message.id.desc()).limit(limit)
            result = await db.execute(query)
            return list(reversed(result.scalars().all()))

        result = await db.execute(query.order_by(Message.id.asc()))
        return list(result.scalars().all())


async def get_conversation_detail(student_id: str, conversation_id: str) -> dict:
    conversation = await get_owned_conversation(student_id, conversation_id)
    messages = await get_messages(conversation_id)

    return {
        **conversation_to_dict(conversation),
        "messages": [message_to_dict(message) for message in messages],
    }


async def add_message(
    student_id: str,
    conversation_id: str,
    role: str,
    content: str,
    metadata: dict | None = None,
) -> Message:
    async with AsyncSessionLocal() as db:
        message = Message(
            student_id=student_id,
            conversation_id=conversation_id,
            role=role,
            content=content,
            metadata_json=metadata or {},
            created_at=datetime.utcnow(),
        )
        db.add(message)

        conversation = await db.get(Conversation, conversation_id)
        conversation.updated_at = datetime.utcnow()

        await db.commit()

        return message


async def update_message_metadata(message_id: int, updates: dict) -> None:
    async with AsyncSessionLocal() as db:
        message = await db.get(Message, message_id)

        if message is not None:
            message.metadata_json = {**(message.metadata_json or {}), **updates}
            await db.commit()


async def rename_conversation(student_id: str, conversation_id: str, title: str) -> dict:
    await get_owned_conversation(student_id, conversation_id)

    cleaned = title.strip()[:255]

    if not cleaned:
        raise HTTPException(status_code=400, detail="Title is required.")

    async with AsyncSessionLocal() as db:
        conversation = await db.get(Conversation, conversation_id)
        conversation.title = cleaned
        await db.commit()

        return conversation_to_dict(conversation)


async def set_title_if_default(conversation_id: str, title: str) -> None:
    cleaned = " ".join(title.split())[:80]

    if not cleaned:
        return

    async with AsyncSessionLocal() as db:
        conversation = await db.get(Conversation, conversation_id)

        if conversation is not None and conversation.title == DEFAULT_TITLE:
            conversation.title = cleaned
            await db.commit()


async def delete_conversation(student_id: str, conversation_id: str) -> None:
    """
    Permanently remove a conversation and its messages.
    """

    await get_owned_conversation(student_id, conversation_id)

    async with AsyncSessionLocal() as db:
        await db.execute(
            delete(Message).where(
                Message.conversation_id == conversation_id,
                Message.student_id == student_id,
            )
        )
        await db.execute(
            delete(Conversation).where(Conversation.id == conversation_id)
        )
        await db.commit()
