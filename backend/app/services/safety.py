"""
A code-level safety net for counselor replies.

The prompt already tells the model to stop career talk and point to help
when a student is distressed or unsafe. This makes sure it happens even when
the model forgets: if the student's message signals danger or distress and
the reply doesn't give the 988 crisis line, a fixed paragraph is added.

The patterns lean toward catching too much: an extra line about where to
get help costs little; a missing one could cost a great deal.
"""

import re


CRISIS = re.compile(
    r"kill(?:ing)? myself|suicid\w*|self[- ]?harm|hurt(?:ing)? myself|cut(?:ting)? myself"
    r"|want(?:ed)? to die|wish (?:i|I) (?:was|were) dead|better off dead|end it all"
    r"|disappear|(?:wasn'?t|weren'?t|not be) here anymore|nobody would (?:even )?care"
    r"|(?:no|don'?t see the) point (?:of|in) (?:anything|living|life|trying)"
    r"|(?:hits|hit|hurts|beats|touches) me|abus(?:e|ed|ing|ive)"
    r"|(?:don'?t|do not|never) feel safe|not safe|unsafe|scared to go (?:home|to school)"
    r"|threaten\w*|bull(?:y|ied|ies|ying)"
    r"|haven'?t (?:really )?eaten|starv(?:e|ing) myself|hate (?:how i look|myself|my body)",
    re.IGNORECASE,
)

SAFETY_NOTE = (
    "If you ever feel unsafe or overwhelmed, please talk to a trusted adult today, "
    "like a parent, a teacher, or your school counselor. You can call or text 988, "
    "the Suicide & Crisis Lifeline, any time, day or night. If you're in danger "
    "right now, call 911."
)


def is_crisis(message: str) -> bool:
    return bool(CRISIS.search(message))


def missing_help(message: str, reply: str) -> str:
    """The text to add to the reply ("" when nothing is needed)."""

    if is_crisis(message) and "988" not in reply:
        return "\n\n" + SAFETY_NOTE

    return ""
