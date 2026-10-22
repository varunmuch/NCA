"""
Every test sees only the committed catalog: the careers students have added
on this server (storage/catalog/) are swapped for an empty store.
"""

import pytest

from app.services import career_catalog, field_quiz


@pytest.fixture(autouse=True)
def empty_added_store(tmp_path, monkeypatch):
    monkeypatch.setattr(career_catalog, "ADDED_PATH", tmp_path / "added_careers.json")
    monkeypatch.setattr(field_quiz, "ADDED_ITEMS_PATH", tmp_path / "field_quiz_items.json")
    career_catalog.reload_catalog()
    yield
    career_catalog.reload_catalog()
