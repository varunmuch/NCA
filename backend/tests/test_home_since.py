from datetime import datetime, timezone

from app.services.home_service import since_items

SINCE = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)


def test_since_last_time_lists_only_newer_activity():
    items = since_items(
        SINCE,
        done=["Ask your counselor about AP Computer Science A", "Join the coding club", "Try a Khan Academy lesson"],
        plans=1,
        documents=[
            {"doc_type": "transcript", "uploaded_at": "2026-10-21T09:00:00"},
            {"doc_type": "resume", "uploaded_at": "2026-10-01T09:00:00"},
        ],
        roadmaps=[{"title": "Software Developers", "updated_at": "2026-10-21T10:00:00+00:00"}],
        quiz_at="2026-10-19T08:00:00+00:00",
    )

    assert items[0].startswith("You finished 3 steps: Ask your counselor about AP Computer Science A; Join the coding club")
    assert "You added your transcript" in items
    assert "You made a new plan" in items
    assert "You built a roadmap for Software Developers" in items
    assert not any("quiz" in item for item in items)


def test_nothing_new_gives_no_items():
    assert since_items(SINCE, [], 0, [], [], "") == []
