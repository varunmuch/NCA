"""The chat updates a student's record only from their own, current numbers."""

from app.services import record_updates as ru

CURRENT = {"service_hours": 62, "paid_hours": None, "sat": None, "act": None, "intended_major": "Computer Science"}


def item(value, evidence):
    return {"value": value, "evidence": evidence}


def test_stated_hours_are_kept():
    message = "I have 90 volunteer hours now!"
    assert ru.validate({"service_hours": item(90, "I have 90 volunteer hours")}, message, CURRENT) == {"service_hours": 90}


def test_added_hours_are_summed_from_the_known_total():
    message = "I did 20 more hours at the food bank this weekend"
    assert ru.validate({"service_hours": item(82, "I did 20 more hours")}, message, CURRENT) == {"service_hours": 82}


def test_evidence_must_be_in_the_message():
    message = "How many hours do I need for Bright Futures?"
    assert ru.validate({"service_hours": item(100, "I have 100 hours")}, message, CURRENT) == {}


def test_number_must_be_said_and_in_range():
    assert ru.validate({"sat": item(1310, "I got a 1300 on the SAT")}, "I got a 1300 on the SAT", CURRENT) == {}
    assert ru.validate({"act": item(40, "my ACT was 40")}, "my ACT was 40", CURRENT) == {}
    assert ru.validate({"sat": item(1310, "I got 1310 on the SAT")}, "I got 1310 on the SAT", CURRENT) == {"sat": 1310}


def test_unchanged_values_are_not_updates():
    assert ru.validate({"service_hours": item(62, "I have 62 hours")}, "I have 62 hours", CURRENT) == {}
    assert ru.validate({"intended_major": item("computer science", "major in computer science")}, "I want to major in computer science", CURRENT) == {}


def test_major_change():
    message = "Actually I want to major in nursing"
    assert ru.validate({"intended_major": item("Nursing", "I want to major in nursing")}, message, CURRENT) == {"intended_major": "Nursing"}


def test_describe_shows_old_and_new():
    changes = ru.describe({"service_hours": 90}, CURRENT)
    assert changes == [{"field": "service_hours", "label": "Service hours", "old": 62, "new": 90}]


def test_messages_without_numbers_or_majors_skip_the_model():
    assert not ru.TRIGGER.search("I like drawing and computers")


def test_requested_actions_need_evidence_in_the_message():
    message = "Please add sign up for the PSAT to my plan and save nursing"
    raw = {
        "actions": [
            {"action": "add_step", "value": "Sign up for the PSAT", "evidence": "add sign up for the PSAT to my plan"},
            {"action": "save_career", "value": "nursing", "evidence": "save nursing"},
            {"action": "set_goal", "value": "Doctor", "evidence": "make doctor my goal"},  # not in the message
            {"action": "add_step", "value": "Again", "evidence": "add sign up for the PSAT to my plan"},  # one of each kind
            {"action": "delete_everything", "value": "", "evidence": "Please"},  # not an action we know
        ]
    }

    assert ru.validate_actions(raw, message) == [
        {"action": "add_step", "value": "Sign up for the PSAT"},
        {"action": "save_career", "value": "nursing"},
    ]


def test_plan_update_needs_no_value_but_a_step_does():
    message = "Can you update my plan? Also add to my plan"
    raw = {
        "actions": [
            {"action": "update_plan", "value": "", "evidence": "update my plan"},
            {"action": "add_step", "value": "", "evidence": "add to my plan"},
        ]
    }

    assert ru.validate_actions(raw, message) == [{"action": "update_plan", "value": ""}]
