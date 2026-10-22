"""
Clean up text the model wrote inside structured (JSON) output.

Guided JSON decoding has two failure modes we've seen on career pages:

- A string hits its length limit mid-sentence and the model carries the
  same sentence on into the next list item ("...which are super-" /
  "important for Data Scientists").
- When it runs out of things to say, it fills the remaining slots with
  made-up field names ("future_steps_10th_12th_grade_2_years_out...").

The page shows plain text, so Markdown markers ("**Python**") would also
appear as literal asterisks. These helpers fix all three in code.
"""

import re

# Three or more snake_case words chained together: a field name, not prose.
JUNK = re.compile(r"\b[a-z0-9]+(?:_[a-z0-9]+){2,}\b", re.IGNORECASE)

MARKUP = re.compile(r"\*+|(?<!\w)__(?=\w)|(?<=\w)__(?!\w)|^#{1,6}\s*", re.MULTILINE)

SENTENCE_END = re.compile(r"[.!?…][\"'”’)]*$")

# Chinese, Japanese and Korean characters: the model occasionally slips a
# word from another language into an English sentence.
FOREIGN_SCRIPT = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]")


def plain_text(text: str) -> str:
    """Drop Markdown emphasis and heading markers; tidy spaces."""

    text = MARKUP.sub("", text or "")
    text = re.sub(r"[ \t]+", " ", text)

    return re.sub(r" +([,.;:!?])", r"\1", text).strip()


def drop_junk(text: str) -> str:
    """Cut text at the first run of made-up field names."""

    match = JUNK.search(text or "")

    if match is None:
        return (text or "").strip()

    return text[: match.start()].strip()


def whole_sentences(text: str) -> str:
    """Trim a trailing fragment that doesn't end a sentence."""

    text = text.strip()

    if not text or SENTENCE_END.search(text):
        return text

    cut = max(text.rfind(". "), text.rfind("! "), text.rfind("? "))

    return text[: cut + 1].strip() if cut > 0 else text


def drop_foreign_sentences(text: str) -> str:
    """Remove any sentence that contains characters from another script."""

    if not FOREIGN_SCRIPT.search(text or ""):
        return text or ""

    sentences = re.split(r"(?<=[.!?])\s+", text)

    return " ".join(sentence for sentence in sentences if not FOREIGN_SCRIPT.search(sentence)).strip()


def clean_paragraph(text: str) -> str:
    return whole_sentences(drop_foreign_sentences(plain_text(drop_junk(text))))


def clean_items(items: list, max_items: int | None = None) -> list[str]:
    """
    Clean a list of short items: rejoin pieces of one sentence that were
    split across items, drop junk and empty items, and remove repeats.
    """

    joined: list[str] = []

    for raw in items or []:
        if not isinstance(raw, str):
            continue

        text = drop_foreign_sentences(plain_text(drop_junk(raw)))

        if not text:
            continue

        previous = joined[-1] if joined else ""
        continues = previous and not SENTENCE_END.search(previous) and (
            text[0].islower() or previous.endswith("-")
        )

        if continues:
            separator = "" if previous.endswith("-") else " "
            joined[-1] = previous.rstrip("-") + separator + text if separator else previous + text
        else:
            joined.append(text)

    cleaned: list[str] = []
    seen: set[str] = set()

    for text in joined:
        text = whole_sentences(text)
        key = re.sub(r"\W+", " ", text.lower()).strip()

        if len(text) < 8 or key in seen:
            continue

        seen.add(key)
        cleaned.append(text)

    return cleaned[:max_items] if max_items else cleaned


def clean_strings(value):
    """Apply plain_text and drop_junk to every string in a nested structure."""

    if isinstance(value, str):
        return plain_text(drop_junk(value))

    if isinstance(value, list):
        return [clean_strings(item) for item in value]

    if isinstance(value, dict):
        return {key: clean_strings(item) for key, item in value.items()}

    return value
