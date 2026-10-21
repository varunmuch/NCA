"""
Find factual claims in a counselor reply that no provided source supports.

Checked claim kinds, each a specific figure or name a student could act on:
  money (salaries, wages, costs), percent (growth, pass rates), date
  (deadlines), year, gpa, url, award (named scholarships and grants)

A claim is grounded when the same figure or name appears in the source text
the reply was written from (catalog data, the student's own words, later
search results). The few official sites the counselor may point students
to (REFERRAL_DOMAINS) are always allowed as links.

ground_reply() removes the sentences that carry ungrounded claims and adds
one plain note saying where to check instead. It never adds a fact.
"""

import re


REFERRAL_DOMAINS = (
    "bls.gov",
    "onetonline.org",
    "mynextmove.org",
    "careeronestop.org",
    "studentaid.gov",
    "collegeboard.org",
    "bigfuture.collegeboard.org",
)

MONTHS = (
    "January|February|March|April|May|June|July|August|September|October|November|December|"
    "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"
)

PATTERNS = {
    "money": re.compile(
        r"\$\s?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?(?:k|K|thousand|million|billion)\b)?"
        r"|\b\d+(?:,\d{3})*(?:\.\d+)?\s?(?:dollars|USD)\b"
    ),
    "percent": re.compile(r"\b\d+(?:\.\d+)?\s?(?:%|percent\b)"),
    "date": re.compile(
        rf"\b(?:{MONTHS})\.?\s+\d{{1,2}}(?:st|nd|rd|th)?\b(?:,?\s+\d{{4}})?"
        r"|\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b"
    ),
    "year": re.compile(r"\b(?:19|20)\d{2}\b"),
    "gpa": re.compile(
        r"\b[0-4]\.\d{1,2}\b(?=[^.\n]{0,15}\bGPA\b)|\bGPA\b[^.\n]{0,20}?\b[0-4]\.\d{1,2}\b"
    ),
    "url": re.compile(
        # Trailing punctuation belongs to the sentence, not the link.
        r"https?://[^\s)>\]]*[^\s)>\].,;:!?]|\bwww\.[^\s)>\]]*[^\s)>\].,;:!?]"
        r"|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:gov|edu|org|com)\b(?:/[^\s)>\]]*[^\s)>\].,;:!?])?",
        re.IGNORECASE,
    ),
    "award": re.compile(
        r"\b(?:[A-Z][\w'&.-]*\s+){1,6}(?:Scholarship|Scholars|Grant|Fellowship|Award)s?\b"
    ),
}

NOTE = (
    "I left out a number or name I couldn't verify. For current figures, "
    "your school counselor or an official site like bls.gov or studentaid.gov can help."
)


def _squash(text: str) -> str:
    return re.sub(r"[\s,]+", "", text.lower())


def _digits(text: str) -> str:
    return re.sub(r"\D", "", text)


def find_claims(text: str) -> list[dict]:
    """Every checkable claim in text, as {kind, text, start, end}."""

    claims = []
    taken: list[tuple[int, int]] = []

    # Specific kinds first, so "$1,200" isn't also read as a year.
    for kind in ("url", "money", "percent", "date", "gpa", "award", "year"):
        for match in PATTERNS[kind].finditer(text):
            start, end = match.span()

            if any(start < other_end and end > other_start for other_start, other_end in taken):
                continue

            taken.append((start, end))
            claims.append({"kind": kind, "text": match.group().strip(), "start": start, "end": end})

    return sorted(claims, key=lambda claim: claim["start"])


def is_grounded(claim: dict, corpus: str) -> bool:
    kind, value = claim["kind"], claim["text"]

    if kind == "url":
        host = re.sub(r"^https?://|^www\.", "", value.lower()).split("/")[0].rstrip(".")

        if any(host == domain or host.endswith("." + domain) for domain in REFERRAL_DOMAINS):
            return True

        return value.lower().rstrip("/.") in corpus.lower()

    if kind in ("money", "percent", "gpa", "year"):
        digits = _digits(value)
        return bool(digits) and digits in _digits_runs(corpus)

    return _squash(value) in _squash(corpus)


def _digits_runs(corpus: str) -> set[str]:
    # Numbers as written in the sources, digits only ("$77,600" -> "77600").
    return {_digits(match) for match in re.findall(r"\d[\d,.]*", corpus)}


def ungrounded_claims(text: str, corpus: str) -> list[dict]:
    return [claim for claim in find_claims(text) if not is_grounded(claim, corpus)]


def ground_reply(reply: str, corpus: str) -> tuple[str, list[dict]]:
    """
    The reply without sentences that carry ungrounded claims, plus the
    claims removed. Unchanged when every claim is supported.
    """

    removed = ungrounded_claims(reply, corpus)

    if not removed:
        return reply, []

    kept_lines = []

    for line in reply.split("\n"):
        bullet = re.match(r"^(\s*(?:[-*•]|\d{1,2}[.)])\s+)", line)
        prefix = bullet.group(1) if bullet else ""
        body = line[len(prefix):]
        sentences = re.split(r"(?<=[.!?])\s+", body)
        kept = [sentence for sentence in sentences if not ungrounded_claims(sentence, corpus)]

        if kept == sentences:
            kept_lines.append(line)
        elif kept:
            kept_lines.append(prefix + " ".join(kept))
        # A line whose every sentence was removed is dropped entirely.

    text = re.sub(r"\n{3,}", "\n\n", "\n".join(kept_lines)).strip()
    text = (text + "\n\n" + NOTE).strip() if text else NOTE

    return text, removed
