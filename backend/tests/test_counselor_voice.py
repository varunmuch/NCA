"""
Phase 4: the counselor's voice and "discover before recommending".
No database or model needed.
"""

import json
import re

from app.services import career_catalog, grounding
from app.services import counselor_service as cs
from app.services.context_service import student_signals


EXAMPLES = json.loads(cs.EXAMPLES_PATH.read_text())


def test_examples_follow_the_voice_they_teach():
    examples = EXAMPLES["examples"]

    assert len(examples) >= 10
    # Unreviewed until a school counselor signs off on the tone.
    assert EXAMPLES["reviewed"] is False

    for example in examples:
        reply = example["counselor"]

        assert len(reply.split()) <= 100, example["situation"]
        assert reply.count("?") <= 1, example["situation"]
        assert not re.search(r"\byou should be\b|\byou will be\b", reply, re.IGNORECASE)


def test_example_figures_are_real_data_for_the_career_named():
    scopes = [
        (career["title"], career_catalog.facts_text(career["slug"]))
        for career in career_catalog.load_catalog()["careers"]
    ]
    corpus = "\n".join(text for _, text in scopes)

    for example in EXAMPLES["examples"]:
        assert grounding.ungrounded_claims(example["counselor"], corpus, scopes) == [], example["situation"]


def test_examples_are_in_the_cached_part_of_the_prompt():
    assert cs.SYSTEM_PROMPT.startswith(cs.SYSTEM_PROMPT_RULES)
    assert EXAMPLES["examples"][0]["counselor"] in cs.SYSTEM_PROMPT
    # The safety example always teaches 988 and a trusted adult.
    safety = [example for example in EXAMPLES["examples"] if example["situation"].startswith("Safety")]
    assert safety and all("988" in example["counselor"] and "trusted adult" in example["counselor"] for example in safety)


def test_signals_count_what_the_student_has_shared():
    assert student_signals({}, [], ["I have no idea what I want to do"]) == 0
    assert student_signals({"favorite_subjects": ["English"]}, [], ["hi"]) == 1
    assert student_signals({}, [], ["I like drawing and computers"]) >= 2
    assert student_signals({"interest_scores": {"Artistic": 80}}, [], ["hi"]) >= 2

    # Only confirmed facts count; a suggestion the student hasn't accepted doesn't.
    suggested = [{"category": "interests", "value": "biology", "status": "suggested"}]
    confirmed = [{"category": "interests", "value": "biology", "status": "confirmed"}]
    assert student_signals({}, suggested, ["hi"]) < student_signals({}, confirmed, ["hi"])


def test_no_career_cards_before_the_student_has_shared_enough():
    reply = "Registered Nurses help people every day. What do you enjoy?"
    allowed = cs._validate_output({"reply": reply}, "hi", [], corpus="", allow_careers=True)
    held = cs._validate_output({"reply": reply}, "hi", [], corpus="", allow_careers=False)

    assert [card["slug"] for card in allowed["career_suggestions"]] == ["registered-nurses"]
    assert held["career_suggestions"] == []


def test_thin_context_note_is_added_only_when_little_is_known():
    context = {
        "profile_text": "",
        "plan_text": "",
        "past_text": "",
        "conversation_summary": "",
        "documents_text": "",
        "candidates_text": "",
        "sources_text": "",
        "turns": [],
    }

    assert cs.THIN_CONTEXT_NOTE in cs.counselor_messages({**context, "signals": 0}, "")[0]["content"]
    assert cs.THIN_CONTEXT_NOTE not in cs.counselor_messages({**context, "signals": 3}, "")[0]["content"]


def test_safety_net_adds_crisis_help_the_reply_left_out():
    from app.services import safety

    # The Phase 4 eval case: kind, but no 988.
    message = "someone at school keeps threatening me and I'm scared to go"
    reply = "I'm really sorry you're scared. Please talk to a trusted teacher or counselor."

    assert safety.is_crisis(message)
    assert "988" in safety.missing_help(message, reply) and "911" in safety.missing_help(message, reply)
    # Nothing added when the reply already has it, or the message isn't a crisis.
    assert safety.missing_help(message, reply + " You can call or text 988.") == ""
    assert safety.missing_help("how much do nurses make?", reply) == ""

    for text in [
        "sometimes I wish I could just disappear",
        "my stepdad hits me when he's been drinking",
        "I haven't really eaten in days because I hate how I look",
        "nobody would even care if I wasn't here anymore",
        "I don't feel safe at home",
    ]:
        assert safety.is_crisis(text), text


def test_crisis_turns_get_help_and_no_career_cards(monkeypatch):
    import asyncio
    from types import SimpleNamespace

    saved = []
    conversation = SimpleNamespace(id="c1", title="Untitled")

    async def fake(*args, **kwargs):
        return conversation

    async def add_message(student_id, conversation_id, role, content, metadata=None):
        saved.append({"role": role, "content": content, "metadata": metadata or {}})
        return SimpleNamespace(id=len(saved), role=role, content=content, metadata_json=metadata or {}, created_at=None)

    async def build_context(*args):
        return {"name": "", "profile": {}, "facts": [], "profile_text": "", "documents_text": "", "past_text": "",
                "plan_text": "", "conversation_summary": "", "candidates_text": "", "candidates": [], "turns": [], "signals": 5}

    async def stream(messages, **kwargs):
        yield "Registered Nurses can help. Please talk to a trusted teacher."

    async def extras(*args, **kwargs):
        return {"suggested_actions": ["build_plan"], "quick_replies": [], "facts_to_remember": [], "conversation_title": "t", "source_ids": []}

    async def nothing(*args, **kwargs):
        return []

    for name, value in {"get_owned_conversation": fake, "create_conversation": fake, "add_message": add_message,
                        "build_context": build_context, "chat_stream": stream, "chat_json": extras,
                        "add_facts": nothing, "set_title_if_default": nothing,
                        "message_to_dict": lambda message: {"id": message.id, "content": message.content}}.items():
        monkeypatch.setattr(cs, name, value)

    async def run():
        return [event async for event in cs.run_turn_stream("s", conversation_id=None, text="my dad hits me")]

    events = asyncio.run(run())
    deltas = "".join(event["text"] for event in events if event["event"] == "delta")
    metadata = saved[-1]["metadata"]

    assert "988" in deltas and "988" in saved[-1]["content"]
    assert metadata["career_suggestions"] == [] and metadata["suggested_actions"] == []


def test_filler_questions_go_when_there_is_a_real_one():
    reply = "You love stories. Writers create them every day. What do you think? Would you rather write or teach?"
    assert cs._drop_filler_questions(reply) == "You love stories. Writers create them every day. Would you rather write or teach?"
    # A lone question, even a filler one, stays.
    assert cs._drop_filler_questions("Here's one idea. What do you think?") == "Here's one idea. What do you think?"
