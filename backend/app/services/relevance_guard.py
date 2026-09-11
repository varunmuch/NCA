import re
from enum import Enum

from app.core.config import config


class RelevanceDecision(str, Enum):
    ALLOW = "allow"
    REJECT = "reject"


BLOCKED_PATTERNS = config["security"]["blocked_patterns"]

REJECTION_MESSAGE = config["career_scope"]["rejection_message"]


def check_relevance(text: str) -> tuple[RelevanceDecision, str]:
    """
    Layer 1 security guard.

    This layer does NOT determine career relevance.
    It only rejects empty input and obvious attempts
    to manipulate or bypass CIE restrictions.

    Career relevance is determined by the intent classifier.
    """

    normalized = text.lower().strip()

    if not normalized:
        return (
            RelevanceDecision.REJECT,
            "Empty request"
        )

    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, normalized):
            return (
                RelevanceDecision.REJECT,
                "Prompt manipulation attempt detected"
            )

    return (
        RelevanceDecision.ALLOW,
        "Security validation passed"
    )
