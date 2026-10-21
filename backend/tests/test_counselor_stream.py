"""
The streamed counselor turn: event order, validation limits, prompt order,
and failure handling. The database and model are replaced with fakes.
"""

import asyncio
from types import SimpleNamespace

import pytest

from app.core import llm
from app.services import counselor_service as cs


CONTEXT = {
    "name": "Sam",
    "profile": {},
    "facts": [],
    "profile_text": "- Grade: 10th grade",
    "documents_text": "(none)",
    "past_text": "",
    "plan_text": "",
    "conversation_summary": "",
    "candidates_text": "registered-nurses: Registered Nurses",
    "candidates": [{"slug": "registered-nurses", "title": "Registered Nurses"}],
    "turns": [{"role": "user", "content": "I like helping people"}],
}


@pytest.fixture
def fake_turn(monkeypatch):
    """Replace every database and model call a turn makes."""

    saved: list[dict] = []
    conversation = SimpleNamespace(id="c1", title=cs.DEFAULT_TITLE)

    async def get_owned_conversation(student_id, conversation_id):
        return conversation

    async def create_conversation(student_id):
        return conversation

    async def add_message(student_id, conversation_id, role, content, metadata=None):
        message = SimpleNamespace(
            id=len(saved) + 1, role=role, content=content, metadata_json=metadata or {}, created_at=None
        )
        saved.append({"role": role, "content": content, "metadata": metadata or {}})
        return message

    async def build_context(student_id, conversation, text):
        return dict(CONTEXT)

    async def add_facts(student_id, facts, **kwargs):
        return [{"id": index, **fact} for index, fact in enumerate(facts)]

    async def set_title_if_default(conversation_id, title):
        conversation.title = title

    def message_to_dict(message):
        return {"id": message.id, "role": message.role, "content": message.content, "metadata": message.metadata_json}

    for name, value in {
        "get_owned_conversation": get_owned_conversation,
        "create_conversation": create_conversation,
        "add_message": add_message,
        "build_context": build_context,
        "add_facts": add_facts,
        "set_title_if_default": set_title_if_default,
        "message_to_dict": message_to_dict,
    }.items():
        monkeypatch.setattr(cs, name, value)

    return saved


def stream_of(*pieces):
    async def fake_stream(messages, **kwargs):
        for piece in pieces:
            yield piece

    return fake_stream


def collect(**kwargs):
    async def run():
        return [event async for event in cs.run_turn_stream("s1", conversation_id=None, **kwargs)]

    return asyncio.run(run())


def test_stream_events_arrive_in_order_and_reply_is_saved(fake_turn, monkeypatch):
    reply = (
        "**Registered Nurses**: you said you like helping people, so this could be worth exploring.\n\n"
        "Graphic Designers make visuals. Special Effects Artists and Animators bring them to life."
    )
    monkeypatch.setattr(cs, "chat_stream", stream_of(reply[:40], reply[40:]))

    async def extras(*args, **kwargs):
        return {
            "quick_replies": ["Yes", "No", "I'm not sure", "Maybe"],
            # Ignored: cards come from the careers the reply names.
            "career_suggestions": [{"slug": "made-up", "title": "Made Up Job", "why": "x"}],
            "suggested_actions": ["build_plan", "not_an_action"],
            "facts_to_remember": [
                {"category": "interests", "value": "helping people", "evidence": "I like helping people"},
                {"category": "interests", "value": "invented", "evidence": "something never said"},
            ],
            "conversation_title": "Exploring nursing",
        }

    monkeypatch.setattr(cs, "chat_json", extras)

    events = collect(text="I like helping people")

    assert [event["event"] for event in events] == ["start", "delta", "delta", "done"]
    assert "".join(event["text"] for event in events if event["event"] == "delta") == reply

    saved = fake_turn[-1]
    assert saved["role"] == "assistant" and saved["content"] == reply

    metadata = saved["metadata"]
    # Cards: the first 2 catalog careers the reply names, with its own words.
    assert [card["slug"] for card in metadata["career_suggestions"]] == ["registered-nurses", "graphic-designers"]
    assert metadata["career_suggestions"][0]["why"].startswith("you said you like helping people")
    assert metadata["quick_replies"] == ["Yes", "No", "I'm not sure"]
    assert metadata["suggested_actions"] == ["build_plan"]
    # Only facts quoting the student's own words are proposed.
    assert [fact["value"] for fact in metadata["proposed_facts"]] == ["helping people"]
    assert events[-1]["conversation_title"] == "Exploring nursing"


def test_extras_failure_keeps_the_reply(fake_turn, monkeypatch):
    monkeypatch.setattr(cs, "chat_stream", stream_of("Here is a thought."))

    async def broken(*args, **kwargs):
        raise llm.LLMError("cut off")

    monkeypatch.setattr(cs, "chat_json", broken)

    events = collect(text="hi")

    assert events[-1]["event"] == "done"
    assert fake_turn[-1]["content"] == "Here is a thought."
    assert fake_turn[-1]["metadata"]["career_suggestions"] == []


def test_model_failure_becomes_an_error_event(fake_turn, monkeypatch):
    async def failing(messages, **kwargs):
        raise llm.LLMError("down")
        yield  # pragma: no cover

    monkeypatch.setattr(cs, "chat_stream", failing)

    events = collect(text="hi")

    assert [event["event"] for event in events] == ["start", "error"]
    assert events[-1]["assistant_message"]["metadata"] == {"error": True}
    # The student's message is saved; no assistant message is.
    assert [message["role"] for message in fake_turn] == ["user"]


def test_empty_reply_is_an_error(fake_turn, monkeypatch):
    monkeypatch.setattr(cs, "chat_stream", stream_of("   "))

    events = collect(text="hi")

    assert events[-1]["event"] == "error"


def test_run_turn_returns_the_done_payload(fake_turn, monkeypatch):
    monkeypatch.setattr(cs, "chat_stream", stream_of("Short reply."))

    async def extras(*args, **kwargs):
        return {}

    monkeypatch.setattr(cs, "chat_json", extras)

    result = asyncio.run(cs.run_turn("s1", conversation_id=None, text="hi"))

    assert "event" not in result
    assert result["assistant_message"]["content"] == "Short reply."


def test_retry_without_an_unanswered_message_is_refused(fake_turn, monkeypatch):
    async def last_message(conversation_id):
        return SimpleNamespace(role="assistant")

    monkeypatch.setattr(cs, "_last_message", last_message)

    with pytest.raises(ValueError):
        collect(text="", retry=True)


def test_prompt_puts_the_fixed_instructions_first():
    messages = cs.counselor_messages(dict(CONTEXT), "Sam")
    system = messages[0]["content"]

    # Identical leading text across students lets vLLM reuse the cache.
    assert system.startswith(cs.SYSTEM_PROMPT)
    assert system.index("What you know about this student") < system.index("Career catalog candidates")
    assert messages[1:] == CONTEXT["turns"]


def test_reply_and_extras_limits_match_the_validator():
    schema = cs.EXTRAS_SCHEMA["properties"]

    assert "career_suggestions" not in schema
    assert cs.MAX_CAREER_SUGGESTIONS == 2
    assert schema["quick_replies"]["maxItems"] == cs.MAX_QUICK_REPLIES == 3
    assert cs.REPLY_MAX_TOKENS <= 450


def test_model_health_is_false_when_vllm_is_unreachable_and_is_cached(monkeypatch):
    monkeypatch.setattr(llm, "VLLM_BASE_URL", "http://127.0.0.1:9")
    monkeypatch.setitem(llm._health, "checked", 0.0)

    assert asyncio.run(llm.model_healthy()) is False

    # Within the cache window the answer is reused, even if vLLM recovers.
    monkeypatch.setattr(llm, "VLLM_BASE_URL", "http://unused.invalid")
    llm._health["ok"] = True
    assert asyncio.run(llm.model_healthy()) is True


def test_career_cards_come_only_from_careers_the_reply_names():
    reply = "A graphic designer makes visuals. Maybe an astronaut too? Or a nurse."
    cards = cs.careers_in_reply(reply)

    # Singular forms match catalog titles; names not in the catalog never do.
    assert [card["slug"] for card in cards] == ["graphic-designers"]
    assert cards[0]["why"] == "A graphic designer makes visuals."
    assert cs.careers_in_reply("No careers here.") == []


def test_each_card_gets_the_sentence_that_names_it():
    # Seen in the Phase 7 screenshots: two careers in one paragraph both got
    # the paragraph's first sentence as their reason.
    reply = (
        "You like drawing and computers. One option could be Special Effects Artists and Animators, "
        "who bring art to life. Another could be Graphic Designers, who design visuals."
    )
    cards = {card["slug"]: card["why"] for card in cs.careers_in_reply(reply)}

    assert cards["special-effects-artists-and-animators"].startswith("One option could be Special Effects")
    assert cards["graphic-designers"].startswith("Another could be Graphic Designers")
