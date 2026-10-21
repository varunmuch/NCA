"""
Find factual claims in a counselor reply that no provided source supports.

Checked claim kinds, each a specific figure or name a student could act on:
  money (salaries, wages, costs), percent (growth, pass rates), date
  (deadlines), year, gpa, url, award (named scholarships and grants)

A claim is grounded when the same value of the same kind appears in the
source text the reply was written from (catalog data, the student's own
words, later search results): "100%" needs a percentage of 100, not the
number 100 somewhere. The few official sites the counselor may point
students to (REFERRAL_DOMAINS) are always allowed as links.

Pay and percentages are also checked against the career they describe.
With per-career sources (scopes), a figure in a sentence that names a
career, or follows one, must come from that career's own source, so the
median of one job can't be passed off as another's.

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
        # A real month and day, so "24/7" isn't read as a date.
        r"|\b(?:0?[1-9]|1[0-2])/(?:0?[1-9]|[12]\d|3[01])(?:/\d{2,4})?\b"
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

# Crisis help is never removed, whatever else its sentence contains.
SAFETY = re.compile(r"\b(?:988|911|741741)\b|crisis|lifeline|hotline|emergency", re.IGNORECASE)

# Figures that belong to one career and are checked against its source.
SCOPED_KINDS = ("money", "percent")

NOTE = (
    "I left out a number or name I couldn't verify. For current figures, "
    "your school counselor or an official site like bls.gov or studentaid.gov can help."
)


def _squash(text: str) -> str:
    return re.sub(r"[\s,]+", "", text.lower())


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


def value_of(claim: dict) -> str:
    """A comparable value: '$97,550' and '97,550 dollars' both -> '97550'."""

    kind, text = claim["kind"], claim["text"]

    if kind in ("money", "percent", "gpa"):
        number = re.search(r"\d+(?:,\d{3})*(?:\.\d+)?", text)
        value = float(number.group().replace(",", "")) if number else 0.0
        scale = re.search(r"\b(k|K|thousand|million|billion)\b", text)

        if kind == "money" and scale:
            value *= {"k": 1e3, "K": 1e3, "thousand": 1e3, "million": 1e6, "billion": 1e9}[scale.group(1)]

        return f"{value:.2f}"

    if kind == "year":
        return text

    return _squash(text)


def index_claims(text: str) -> set[tuple[str, str]]:
    return {(claim["kind"], value_of(claim)) for claim in find_claims(text)}


def career_pattern(title: str) -> re.Pattern:
    # "Graphic Designers" also matches "graphic designer".
    lowered = title.lower()
    return re.compile(rf"\b{re.escape(lowered[:-1] if lowered.endswith('s') else lowered)}")


def _is_grounded(claim: dict, corpus: str, corpus_index: set, scoped_index: set | None) -> bool:
    kind = claim["kind"]

    if kind == "url":
        value = claim["text"]
        host = re.sub(r"^https?://|^www\.", "", value.lower()).split("/")[0].rstrip(".")

        if any(host == domain or host.endswith("." + domain) for domain in REFERRAL_DOMAINS):
            return True

        return value.lower().rstrip("/.") in corpus.lower()

    if kind in ("date", "award"):
        # Names and dates may appear in the student's own lowercase words.
        return _squash(claim["text"]) in _squash(corpus)

    if scoped_index is not None and kind in SCOPED_KINDS:
        return (kind, value_of(claim)) in scoped_index

    return (kind, value_of(claim)) in corpus_index


def ungrounded_claims(
    text: str,
    corpus: str,
    scopes: list[tuple[str, str]] | None = None,
) -> list[dict]:
    """
    Claims in text that the corpus doesn't support. scopes = [(career
    title, that career's source text)]: pay and percentages near a career's
    name must match that career's source.
    """

    corpus_index = index_claims(corpus)
    patterns = [(career_pattern(title), index_claims(source)) for title, source in scopes or []]
    lowered = text.lower()
    unsupported = []

    # The careers each position is about: named there, or most recently named.
    mentions = sorted(
        (match.start(), index)
        for index, (pattern, _) in enumerate(patterns)
        for match in pattern.finditer(lowered)
    )

    # Sentence edges: end punctuation followed by space, or a line break.
    # (A plain "." would split "$46.90".)
    edges = [0, *(match.end() for match in re.finditer(r"[.!?](?=\s)|\n", text)), len(text)]

    for claim in find_claims(text):
        scoped_index = None

        if mentions:
            # Careers named in the same sentence, else the last one named before.
            sentence_start = max(edge for edge in edges if edge <= claim["start"])
            sentence_end = min(edge for edge in edges if edge >= claim["end"])
            here = {index for position, index in mentions if sentence_start <= position < sentence_end}
            before = [index for position, index in mentions if position < claim["start"]]
            about = here or ({before[-1]} if before else set())

            if about:
                scoped_index = set().union(*(patterns[index][1] for index in about))

        if not _is_grounded(claim, corpus, corpus_index, scoped_index):
            unsupported.append(claim)

    return unsupported


def ground_reply(
    reply: str,
    corpus: str,
    scopes: list[tuple[str, str]] | None = None,
    *,
    note: bool = True,
) -> tuple[str, list[dict]]:
    """
    The reply without sentences that carry ungrounded claims, plus the
    claims removed. Unchanged when every claim is supported.
    """

    removed = ungrounded_claims(reply, corpus, scopes)

    if not removed:
        return reply, []

    bad = [(claim["start"], claim["end"]) for claim in removed]
    kept_lines = []
    offset = 0

    for line in reply.split("\n"):
        bullet = re.match(r"^(\s*(?:[-*•]|\d{1,2}[.)])\s+)", line)
        prefix = bullet.group(1) if bullet else ""
        kept = []
        cursor = offset + len(prefix)

        for sentence in re.split(r"(?<=[.!?])\s+", line[len(prefix):]):
            start = reply.find(sentence, cursor) if sentence else cursor
            end = start + len(sentence)
            cursor = end

            if SAFETY.search(sentence) or not any(start <= claim_start < end for claim_start, _ in bad):
                kept.append(sentence)

        sentences = [item for item in re.split(r"(?<=[.!?])\s+", line[len(prefix):])]

        if kept == sentences:
            kept_lines.append(line)
        elif any(item.strip() for item in kept):
            kept_lines.append(prefix + " ".join(kept))
        # A line whose every sentence was removed is dropped entirely.

        offset += len(line) + 1

    text = re.sub(r"\n{3,}", "\n\n", "\n".join(kept_lines)).strip()

    if text == reply.strip():
        # Every flagged claim sat in a safety sentence that had to stay.
        return reply, []

    if note:
        text = (text + "\n\n" + NOTE).strip() if text else NOTE

    return text, removed
