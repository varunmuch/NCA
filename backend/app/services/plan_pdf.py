"""
Printable PDF of a stored career plan.

The PDF is rendered from the plan record as stored; it never regenerates
content.
"""

import io
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "neocity-knight-mark.png"

INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#5B6478")
PRIMARY = colors.HexColor("#4338CA")
PRIMARY_SOFT = colors.HexColor("#EDE9FE")
ACCENT = colors.HexColor("#0D9488")
LINE = colors.HexColor("#E7E5DF")

STYLES = {
    "eyebrow": ParagraphStyle(
        "eyebrow", fontName="Helvetica-Bold", fontSize=8.5, leading=11,
        textColor=PRIMARY, spaceAfter=2,
    ),
    "title": ParagraphStyle(
        "title", fontName="Helvetica-Bold", fontSize=22, leading=27,
        textColor=INK, spaceAfter=4,
    ),
    "meta": ParagraphStyle(
        "meta", fontName="Helvetica", fontSize=9.5, leading=13, textColor=MUTED,
    ),
    "h2": ParagraphStyle(
        "h2", fontName="Helvetica-Bold", fontSize=13, leading=17,
        textColor=PRIMARY, spaceBefore=14, spaceAfter=6,
    ),
    "body": ParagraphStyle(
        "body", fontName="Helvetica", fontSize=10.5, leading=15, textColor=INK,
        alignment=TA_LEFT,
    ),
    "item_title": ParagraphStyle(
        "item_title", fontName="Helvetica-Bold", fontSize=10.5, leading=14,
        textColor=INK,
    ),
    "small": ParagraphStyle(
        "small", fontName="Helvetica", fontSize=8.5, leading=11, textColor=MUTED,
    ),
}


def _p(text: str, style: str = "body") -> Paragraph:
    return Paragraph(escape(str(text or "")), STYLES[style])


def _bullets(items: list[str]) -> ListFlowable:
    return ListFlowable(
        [ListItem(_p(item), leftIndent=12) for item in items if item],
        bulletType="bullet",
        bulletColor=PRIMARY,
        bulletFontSize=7,
        leftIndent=12,
    )


def _titled_items(items: list[dict], title_key: str, body_key: str, extra_key: str = "") -> list:
    flowables = []

    for item in items:
        title = item.get(title_key, "")

        if extra_key and item.get(extra_key):
            title = f"{title}  —  {item[extra_key]}"

        flowables.append(
            KeepTogether(
                [
                    Paragraph(escape(title), STYLES["item_title"]),
                    _p(item.get(body_key, "")),
                    Spacer(1, 6),
                ]
            )
        )

    return flowables


def _section(story: list, heading: str, flowables: list) -> None:
    if not flowables:
        return

    story.append(Paragraph(escape(heading), STYLES["h2"]))
    story.extend(flowables)


def _footer(canvas, document) -> None:
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(inch * 0.8, 0.65 * inch, LETTER[0] - inch * 0.8, 0.65 * inch)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(
        inch * 0.8,
        0.45 * inch,
        "NeoCity Academy Career Explorer · AI-assisted plan. "
        "Review it with a school counselor or trusted adult.",
    )
    canvas.drawRightString(LETTER[0] - inch * 0.8, 0.45 * inch, f"Page {document.page}")
    canvas.restoreState()


def _dollars(value) -> str:
    return f"${value:,.0f}"


def _pathway(story: list, pathway: dict | None) -> None:
    """Courses, majors, Florida colleges and certifications for the main career."""

    if not pathway:
        return

    title = pathway.get("career_title", "")
    _section(story, f"My path to {title}" if title else "My path", [_p(pathway.get("summary", ""))] if pathway.get("summary") else [])

    courses = [
        {"title": f"{item['grade']}: {item['course']} ({item['kind']})", "why": item.get("why", "")}
        for item in pathway.get("courses") or []
    ]
    _section(story, "Courses to take in high school", _titled_items(courses, "title", "why"))

    majors = [
        {
            "title": f"{item['title']} (offered at {item['florida_colleges']} Florida colleges)",
            "why": " · ".join(part for part in [("Includes " + ", ".join(item["includes"][:3])) if item.get("includes") else "", item.get("why", "")] if part),
        }
        for item in pathway.get("majors") or []
    ]
    _section(story, "College majors", _titled_items(majors, "title", "why"))

    colleges = []

    for college in pathway.get("colleges") or []:
        facts = [f"{college['city']}, {college['ownership']} {college['kind']}"]
        facts.append(f"cost after aid {_dollars(college['net_price'])}/yr" if college.get("net_price") else "cost not published")

        if college.get("graduation_rate") is not None:
            facts.append(f"graduation rate {college['graduation_rate']}%")

        programs = "; ".join(
            f"{program['credential']} in {program['title']}"
            + (f" (graduates earn {_dollars(program['earnings_median'])})" if program.get("earnings_median") else "")
            for program in (college.get("programs") or [])[:2]
        )
        body = " · ".join(part for part in [", ".join(facts), programs, college.get("why", "")] if part)
        colleges.append({"title": college["name"], "why": body})

    _section(story, "Florida colleges to look at", _titled_items(colleges, "title", "why"))

    certs = [
        {
            "title": f"{cert['name']} ({cert['organization']})",
            "why": " · ".join(
                part
                for part in ["No degree needed" if cert.get("beginner_friendly") else "Needs a degree or work experience first", cert.get("why", "")]
                if part
            ),
        }
        for cert in pathway.get("certifications") or []
    ]
    _section(story, "Certifications to work toward", _titled_items(certs, "title", "why"))

    names = [source.get("name") for source in (pathway.get("sources") or {}).values() if source and source.get("name")]

    if names:
        story.append(_p("Courses, majors, colleges and certifications: " + "; ".join(names) + ".", "small"))


def _simple_plan(story: list, content: dict, task_status: dict[str, str]) -> None:
    """The Phase 5 plan: next 3 steps first, then careers with sourced facts."""

    stage = content.get("stage")

    if stage:
        story.append(Spacer(1, 6))
        story.append(_p(f"Grade {stage['grade']}: {stage['name']}. {stage['goal']}", "meta"))

    task_ids = content.get("next_action_task_ids") or []
    steps = []

    for index, step in enumerate(content.get("next_steps") or []):
        done = index < len(task_ids) and task_status.get(str(task_ids[index])) == "done"
        title = ("Done: " if done else "") + step.get("title", "")
        resource = step.get("resource") or {}
        detail = " ".join(part for part in [step.get("why", ""), step.get("how", ""), f"{resource['title']}: {resource['url']}" if resource else ""] if part)
        steps.append({"title": title, "why": detail})

    _section(story, "My next 3 steps this month", _titled_items(steps, "title", "why"))

    careers = []

    for card in content.get("careers") or []:
        facts = []

        if card.get("pay_median"):
            pay = f"Median pay {_dollars(card['pay_median'])} a year in the U.S."
            if card.get("pay_median_florida"):
                pay += f" ({_dollars(card['pay_median_florida'])} in Florida)"
            facts.append(pay)

        if card.get("education"):
            facts.append(f"Typical education to start: {card['education']}")

        survey = card.get("education_survey") or {}
        top = (survey.get("levels") or [None])[0]

        if top and card.get("education") and top["level"].lower() != card["education"].lower():
            facts.append(f"{top['percent']}% of workers surveyed say a {top['level'].lower()} is what the job requires")

        careers.append({"title": card.get("title", ""), "why": " · ".join([card.get("why", ""), *facts])})

    _section(story, "Careers I'm exploring", _titled_items(careers, "title", "why"))

    _pathway(story, content.get("pathway"))

    for period in content.get("this_year") or []:
        # Steps are text (older plans) or {text, how, resource}.
        lines = []

        for step in period.get("steps") or []:
            if isinstance(step, dict):
                resource = step.get("resource") or {}
                lines.append(" ".join(part for part in [step.get("text", ""), step.get("how", ""), f"({resource['title']}: {resource['url']})" if resource else ""] if part))
            else:
                lines.append(step)

        _section(story, period.get("period", "This year"), [_bullets(lines)])

    _section(story, "The rest of high school", _titled_items(content.get("high_school") or [], "grade", "focus"))
    _section(story, "After high school", _titled_items(content.get("after_high_school") or [], "route", "description"))
    _section(story, "Skills to build", _titled_items(content.get("skills") or [], "skill", "how"))

    sources = {card.get("pay_source") for card in content.get("careers") or []} | {
        card.get("outlook_source") for card in content.get("careers") or []
    }
    sources.discard(None)

    if sources:
        story.append(Spacer(1, 10))
        story.append(_p("Pay and education: " + "; ".join(sorted(sources)) + ".", "small"))

    if content.get("based_on"):
        story.append(_p(f"How this plan was made: {content['based_on']}", "small"))


def render_plan_pdf(plan: dict, student_name: str, task_status: dict[str, str]) -> bytes:
    content = plan.get("content") or {}
    buffer = io.BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=LETTER,
        leftMargin=0.8 * inch,
        rightMargin=0.8 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.9 * inch,
        title=plan.get("title") or "Career Plan",
        author="NeoCity Academy Career Explorer",
    )

    created = plan.get("created_at")
    created_text = (
        datetime.fromisoformat(created).strftime("%B %d, %Y") if created else ""
    )

    header_text = [
        Paragraph("NEOCITY ACADEMY · CAREER PLAN", STYLES["eyebrow"]),
        Paragraph(escape(plan.get("title") or "My Career Plan"), STYLES["title"]),
        _p(
            " · ".join(
                part
                for part in [
                    f"Prepared for {student_name}" if student_name else "",
                    f"Created {created_text}" if created_text else "",
                    f"Version {plan.get('version', 1)}",
                ]
                if part
            ),
            "meta",
        ),
    ]

    logo = Image(str(LOGO_PATH), width=0.75 * inch, height=0.75 * inch) if LOGO_PATH.exists() else ""

    header = Table([[logo, header_text]], colWidths=[0.95 * inch, None])
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LINEBELOW", (0, 0), (-1, 0), 1, LINE),
            ]
        )
    )

    story: list = [header, Spacer(1, 10)]

    direction = Table(
        [[Paragraph("<b>My career direction</b><br/>" + escape(content.get("career_direction", "")), STYLES["body"])]],
        colWidths=[None],
    )
    direction.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PRIMARY_SOFT),
                ("BOX", (0, 0), (-1, -1), 0, PRIMARY_SOFT),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(direction)

    if content.get("schema") == 2:
        _simple_plan(story, content, task_status)
        document.build(story, onFirstPage=_footer, onLaterPages=_footer)
        return buffer.getvalue()

    actions = content.get("next_three_actions") or []

    if actions:
        _section(story, "My next three actions", [_bullets(actions)])

    _section(
        story,
        "My interests and strengths",
        [_bullets(content.get("interests_and_strengths") or [])]
        if content.get("interests_and_strengths")
        else [],
    )
    _section(
        story,
        "Careers I'm exploring",
        _titled_items(content.get("careers_exploring") or [], "title", "why"),
    )
    _section(
        story,
        "School subjects that matter",
        _titled_items(content.get("academic_subjects") or [], "subject", "why"),
    )
    _section(
        story,
        "Skills to develop",
        _titled_items(content.get("skills_to_develop") or [], "skill", "how"),
    )
    _section(
        story,
        "Projects and activities",
        _titled_items(content.get("projects_and_activities") or [], "title", "description"),
    )
    _section(
        story,
        "Learning opportunities",
        _titled_items(content.get("learning_opportunities") or [], "title", "description"),
    )

    roadmap = []

    for stage in content.get("high_school_roadmap") or []:
        roadmap.append(
            KeepTogether(
                [
                    Paragraph(
                        f"{escape(stage.get('period', ''))}: "
                        f"<font color='#0D9488'>{escape(stage.get('focus', ''))}</font>",
                        STYLES["item_title"],
                    ),
                    _bullets(stage.get("steps") or []),
                    Spacer(1, 6),
                ]
            )
        )

    _section(story, "High school roadmap", roadmap)
    _section(
        story,
        "Education and training pathways",
        _titled_items(content.get("education_pathways") or [], "path", "description"),
    )

    milestones = []

    for milestone in content.get("short_term_milestones") or []:
        done = task_status.get(str(milestone.get("task_id"))) == "done"
        mark = (
            "<font size='8' color='#0D9488'>DONE</font>"
            if done
            else "<font size='8' color='#5B6478'>TO DO</font>"
        )
        title = escape(milestone.get("title", ""))

        if milestone.get("timeframe"):
            title += f"  —  {escape(milestone['timeframe'])}"

        milestones.append(
            KeepTogether(
                [
                    Paragraph(f"{mark}&nbsp;&nbsp;{title}", STYLES["item_title"]),
                    _p(milestone.get("description", "")),
                    Spacer(1, 6),
                ]
            )
        )

    _section(story, "Short-term milestones", milestones)
    _section(
        story,
        "Long-term goals",
        [_bullets(content.get("long_term_goals") or [])] if content.get("long_term_goals") else [],
    )
    _section(
        story,
        "Other paths worth knowing about",
        _titled_items(content.get("alternative_pathways") or [], "title", "description"),
    )

    if content.get("based_on"):
        story.append(Spacer(1, 14))
        story.append(_p(f"How this plan was made: {content['based_on']}", "small"))

    document.build(story, onFirstPage=_footer, onLaterPages=_footer)

    return buffer.getvalue()
