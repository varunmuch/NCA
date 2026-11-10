"""
The counselor as an agent: it acts for the student, and keeps their
suggestions and plan in step with their records without being asked.

Actions (from a chat message or a change in the record):
- refresh_majors: re-run the major and minor suggestions.
- refresh_plan:   write a new version of My Path (or a first one).
- add_step:       put a step on the My Path checklist.
- save_career:    save a career to their list.
- set_goal:       make a career their goal (then refresh the plan).

Slow work (majors, plans) runs in the background; each job is logged in
agent_activity so Home and the chat can show what's running and what was
done, and why. One job of a kind runs per student at a time; a trigger
that arrives while one is running is folded into it.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.db.models import AgentActivity, ProgressTask, ProgressTimeline, SavedCareer

logger = logging.getLogger(__name__)

# (student_id, kind) -> extra reasons that arrived while the job ran.
_running: dict[tuple[str, str], list[str]] = {}
_tasks: set[asyncio.Task] = set()
# Plan refreshes asked for while majors were refreshing; run once after.
_after_majors: dict[str, list[str]] = {}


def activity_to_dict(row: AgentActivity) -> dict:
    return {
        "id": row.id,
        "kind": row.kind,
        "status": row.status,
        "title": row.title,
        "reason": row.reason,
        "detail": row.detail,
        "href": row.href,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "finished_at": row.finished_at.isoformat() if row.finished_at else None,
    }


async def log(student_id: str, kind: str, title: str, *, status: str = "done", reason: str = "", detail: str = "", href: str = "") -> int:
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        row = AgentActivity(
            student_id=student_id,
            kind=kind,
            status=status,
            title=title[:255],
            reason=reason[:255],
            detail=detail,
            href=href[:255],
            created_at=now,
            finished_at=None if status == "running" else now,
        )
        db.add(row)
        await db.commit()
        return row.id


async def _finish(activity_id: int, *, status: str, title: str | None = None, detail: str | None = None, href: str | None = None) -> None:
    async with AsyncSessionLocal() as db:
        row = await db.get(AgentActivity, activity_id)

        if row is None:
            return

        row.status = status
        row.finished_at = datetime.now(timezone.utc)

        if title is not None:
            row.title = title[:255]
        if detail is not None:
            row.detail = detail
        if href is not None:
            row.href = href[:255]

        await db.commit()


async def recent(student_id: str, limit: int = 8) -> list[dict]:
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(AgentActivity)
                .where(AgentActivity.student_id == student_id)
                .order_by(AgentActivity.created_at.desc())
                .limit(limit)
            )
        ).scalars().all()

    return [activity_to_dict(row) for row in rows]


async def mark_interrupted() -> None:
    """At startup: jobs that were running when the server stopped won't finish."""

    from sqlalchemy import update

    async with AsyncSessionLocal() as db:
        await db.execute(
            update(AgentActivity)
            .where(AgentActivity.status == "running")
            .values(status="failed", title="Interrupted by a server restart; ask your counselor to try again", finished_at=datetime.now(timezone.utc))
        )
        await db.commit()


def _background(coro) -> None:
    task = asyncio.create_task(coro)
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


def is_running(student_id: str, kind: str) -> bool:
    return (student_id, kind) in _running


# Background jobs.

async def _refresh_majors(student_id: str, reason: str) -> bool:
    from app.services import major_agent
    from app.services.student_service import get_profile_dict

    profile = await get_profile_dict(student_id)

    if not profile.get("interest_scores"):
        return False

    activity = await log(student_id, "refresh_majors", "Updating your major and minor suggestions", status="running", reason=reason, href="/discover")

    try:
        result = await major_agent.recommend(student_id)
        first = (result.get("options") or [{}])[0]
        await _finish(
            activity,
            status="done",
            title="Updated your major and minor suggestions",
            detail=f"{first['major']['title']} with a minor in {first['minor']['title']}" if first.get("major") else "",
        )
        return True
    except Exception:
        logger.exception("Major refresh failed for %s", student_id)
        await _finish(activity, status="failed", title="Couldn't update your majors just now")
        return False


async def _refresh_plan(student_id: str, reason: str) -> None:
    from app.services import plan_service

    plans = await plan_service.list_plans(student_id)
    latest = sorted(plans, key=lambda plan: (plan["status"] == "saved", plan["created_at"] or ""), reverse=True)
    current = latest[0] if latest else None

    activity = await log(
        student_id,
        "refresh_plan",
        "Updating My Path" if current else "Building My Path",
        status="running",
        reason=reason,
        href="/plan",
    )

    try:
        if current:
            plan = await plan_service.revise_plan(
                student_id,
                current["id"],
                # A request in the student's words goes straight through ("replace UCF with USF").
                instruction=(
                    reason[len('you asked: "'):-1]
                    if reason.startswith('you asked: "') and reason.endswith('"')
                    else f"Update the plan because {reason}. Keep what still fits; change what this affects."
                ),
                act_on_request=False,
            )
            # A plan the student saved stays their working plan: the update is
            # saved too (checked-off steps carry over; older versions stay in history).
            if current["status"] == "saved":
                plan = await plan_service.save_plan(student_id, plan["id"])
                title = "Updated My Path"
            else:
                title = "New version of My Path is ready to review"
        else:
            from app.services.student_service import get_profile_dict

            profile = await get_profile_dict(student_id)
            plan = await plan_service.generate_plan(student_id, career_goal=profile.get("career_aspiration", ""))
            title = "Your first My Path is ready to review"

        steps = "; ".join(step["title"] for step in (plan.get("content") or {}).get("next_steps", [])[:3])
        await _finish(activity, status="done", title=title, detail=steps, href=f"/plan/{plan['id']}")
    except Exception:
        logger.exception("Plan refresh failed for %s", student_id)
        await _finish(activity, status="failed", title="Couldn't update My Path just now")


async def _run(student_id: str, kind: str, reason: str, job) -> None:
    key = (student_id, kind)
    _running[key] = []

    try:
        await job(student_id, reason)

        # Triggers that arrived meanwhile get one more pass.
        extra = _running.get(key) or []

        if extra:
            _running[key] = []
            await job(student_id, " and ".join(dict.fromkeys(extra)))
    finally:
        _running.pop(key, None)


def queue(student_id: str, kind: str, reason: str) -> str:
    """Start a background job, or fold the reason into the one running. Returns "started" or "merged"."""

    key = (student_id, kind)

    if key in _running:
        _running[key].append(reason)
        return "merged"

    # A majors refresh is about to update the plan anyway: ride along with it.
    if kind == "refresh_plan" and (student_id, "refresh_majors") in _running:
        _after_majors.setdefault(student_id, []).append(reason)
        return "merged"

    job = {"refresh_majors": _refresh_majors, "refresh_plan": _refresh_plan}[kind]
    _running[key] = []  # mark before the task starts, so a second trigger merges
    _background(_run(student_id, kind, reason, job))

    return "started"


async def _has_plan(student_id: str) -> bool:
    from app.services import plan_service

    return bool(await plan_service.list_plans(student_id))


async def on_record_change(student_id: str, changed: set[str], reason: str) -> list[str]:
    """
    Keep suggestions and the plan in step with the record. Returns what was
    started, in plain words, for the chat or page to show.
    """

    started = []
    majors_matter = bool(changed & {"intended_major", "transcript", "resume", "quiz"})

    if majors_matter:
        from app.services.student_service import get_profile_dict

        if (await get_profile_dict(student_id)).get("interest_scores"):

            async def majors_then_plan(sid: str, why: str) -> None:
                refreshed = await _refresh_majors(sid, why)
                waiting = _after_majors.pop(sid, [])

                # The plan follows the new majors, when there is one to update.
                if (refreshed and await _has_plan(sid)) or waiting:
                    _running.pop((sid, "refresh_majors"), None)
                    queue(sid, "refresh_plan", " and ".join(dict.fromkeys([why, *waiting])))

            key = (student_id, "refresh_majors")

            if key in _running:
                _running[key].append(reason)
            else:
                _running[key] = []
                _background(_run(student_id, "refresh_majors", reason, majors_then_plan))

            started.append("updating your major and minor suggestions")

            if await _has_plan(student_id):
                started.append("then My Path")

            return started

    has_plan = await _has_plan(student_id)

    # A new goal with no plan yet gets a first plan.
    if has_plan or "goal" in changed:
        queue(student_id, "refresh_plan", reason)
        started.append("updating My Path" if has_plan else "building your first My Path")

    return started


# Immediate actions (from the chat).

async def add_step(student_id: str, title: str, reason: str = "you asked") -> dict:
    """A step on the My Path checklist (the saved plan's timeline, or a counselor list)."""

    title = title.strip().rstrip(".")[:200]
    now = datetime.utcnow()

    async with AsyncSessionLocal() as db:
        timeline = (
            await db.execute(
                select(ProgressTimeline)
                .where(ProgressTimeline.student_id == student_id)
                .order_by(ProgressTimeline.plan_id.is_(None), ProgressTimeline.updated_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        if timeline is None:
            timeline = ProgressTimeline(
                student_id=student_id,
                title="Steps from my counselor",
                description="",
                status="in_progress",
                sort_order=0,
                created_at=now,
                updated_at=now,
            )
            db.add(timeline)
            await db.flush()

        count = len((await db.execute(select(ProgressTask.id).where(ProgressTask.timeline_id == timeline.id))).all())
        db.add(
            ProgressTask(
                timeline_id=timeline.id,
                student_id=student_id,
                title=title,
                notes="Added by your counselor in chat.",
                status="not_started",
                priority="medium",
                sort_order=count,
                created_at=now,
                updated_at=now,
            )
        )
        timeline.updated_at = now
        await db.commit()
        href = f"/plan/{timeline.plan_id}" if timeline.plan_id else "/"

    await log(student_id, "add_step", f"Added to your checklist: {title}", reason=reason, href=href)

    return {"kind": "add_step", "text": f"added \"{title}\" to your My Path checklist", "href": href}


async def _resolve_career(name: str) -> dict | None:
    from app.services import career_catalog, career_expansion

    named = career_catalog.named_careers(name)

    if named:
        return career_catalog.get_career(named[0])

    # A field or subject ("nursing", "marine biology"): the best search match.
    found = career_catalog.search_careers(query=name)
    results = found.get("careers") or found.get("results") or []

    if results:
        return career_catalog.get_career(results[0]["slug"])

    try:
        outcome = await career_expansion.ensure_within(name, seconds=12)
    except Exception:
        return None

    return career_catalog.get_career(outcome.get("slug", "")) if outcome.get("slug") else None


async def save_career(student_id: str, name: str) -> dict | None:
    career = await _resolve_career(name)

    if career is None:
        return None

    async with AsyncSessionLocal() as db:
        exists = (
            await db.execute(select(SavedCareer.id).where(SavedCareer.student_id == student_id, SavedCareer.career_slug == career["slug"]))
        ).first()

        if not exists:
            db.add(SavedCareer(student_id=student_id, career_slug=career["slug"]))
            await db.commit()

    href = f"/explore/{career['slug']}"
    await log(student_id, "save_career", f"Saved {career['title']} to your careers", href=href)

    return {"kind": "save_career", "text": f"saved {career['title']} to your careers", "href": href}


async def set_goal(student_id: str, name: str) -> dict | None:
    from app.services.student_service import save_profile_dict

    career = await _resolve_career(name)

    if career is None:
        return None

    await save_profile_dict(student_id, {"career_aspiration": career["title"], "career_status": "have_goal"})
    href = f"/explore/{career['slug']}"
    await log(student_id, "set_goal", f"Made {career['title']} your goal", href=href)
    started = await on_record_change(student_id, {"goal"}, f"your goal changed to {career['title']}")

    return {
        "kind": "set_goal",
        "text": f"made {career['title']} your goal" + (f" and started {' '.join(started)}" if started else ""),
        "href": href,
    }


def _closest(target: str, options: list[tuple[int, str]]) -> tuple[int, str] | None:
    """The option whose words best overlap the target (for "check off the PSAT step")."""

    import re

    words = {word for word in re.findall(r"[a-z0-9]+", target.lower()) if len(word) > 2}
    best, best_score = None, 0.0

    for option_id, title in options:
        option_words = {word for word in re.findall(r"[a-z0-9]+", title.lower()) if len(word) > 2}

        if not option_words:
            continue

        score = len(words & option_words) / len(words | option_words)

        if score > best_score:
            best, best_score = (option_id, title), score

    return best if best_score >= 0.2 else None


async def _open_tasks(student_id: str, include_done: bool = False) -> list[ProgressTask]:
    async with AsyncSessionLocal() as db:
        query = select(ProgressTask).where(ProgressTask.student_id == student_id)

        if not include_done:
            query = query.where(ProgressTask.status != "done")

        return list((await db.execute(query)).scalars().all())


async def complete_step(student_id: str, text: str) -> dict | None:
    tasks = await _open_tasks(student_id)
    match = _closest(text, [(task.id, task.title) for task in tasks])

    if not match:
        return None

    async with AsyncSessionLocal() as db:
        task = await db.get(ProgressTask, match[0])
        task.status = "done"
        task.updated_at = datetime.utcnow()
        await db.commit()

    await log(student_id, "complete_step", f"Checked off: {match[1]}", href="/plan")

    return {"kind": "complete_step", "text": f"checked off \"{match[1]}\"", "href": "/plan"}


async def remove_step(student_id: str, text: str) -> dict | None:
    tasks = await _open_tasks(student_id, include_done=True)
    match = _closest(text, [(task.id, task.title) for task in tasks])

    if not match:
        return None

    async with AsyncSessionLocal() as db:
        task = await db.get(ProgressTask, match[0])
        await db.delete(task)
        await db.commit()

    await log(student_id, "remove_step", f"Removed from your checklist: {match[1]}", href="/plan")

    return {"kind": "remove_step", "text": f"removed \"{match[1]}\" from your checklist", "href": "/plan"}


async def unsave_career(student_id: str, name: str) -> dict | None:
    from sqlalchemy import delete

    from app.services import career_catalog

    async with AsyncSessionLocal() as db:
        saved = (await db.execute(select(SavedCareer.career_slug).where(SavedCareer.student_id == student_id))).scalars().all()

    options = [(index, career["title"]) for index, slug in enumerate(saved) if (career := career_catalog.get_career(slug))]
    match = _closest(name, options)

    if not match:
        return None

    slug = saved[match[0]]

    async with AsyncSessionLocal() as db:
        await db.execute(delete(SavedCareer).where(SavedCareer.student_id == student_id, SavedCareer.career_slug == slug))
        await db.commit()

    await log(student_id, "unsave_career", f"Removed {match[1]} from your saved careers", href="/explore")

    return {"kind": "unsave_career", "text": f"removed {match[1]} from your saved careers", "href": "/explore"}


PROFILE_FIELDS = {
    "preferred_name": ("name", False),
    "grade_level": ("grade", False),
    "school": ("school", False),
    "interests": ("interests", True),
    "favorite_subjects": ("favorite subjects", True),
    "hobbies": ("hobbies", True),
}


async def update_profile(student_id: str, field: str, value: str) -> dict | None:
    """A profile detail the student asked to change ("call me Sam", "I'm in 11th grade now")."""

    from app.services.student_service import get_profile_dict, normalize_grade, save_profile_dict

    if field not in PROFILE_FIELDS or not value.strip():
        return None

    label, is_list = PROFILE_FIELDS[field]
    value = value.strip()[:100]

    if field == "grade_level":
        value = normalize_grade(value.split()[0] if value.split()[0].isdigit() else value)

    if is_list:
        current = list((await get_profile_dict(student_id)).get(field) or [])
        added = [item.strip() for item in value.split(",") if item.strip() and item.strip().lower() not in {c.lower() for c in current}]
        await save_profile_dict(student_id, {field: current + added})
        text = f"added {', '.join(added)} to your {label}" if added else f"already had that in your {label}"
    else:
        await save_profile_dict(student_id, {field: value})
        text = f"changed your {label} to {value}"

    await log(student_id, "update_profile", text[0].upper() + text[1:], href="/profile")

    return {"kind": "update_profile", "text": text, "href": "/profile"}



async def set_target_college(student_id: str, name: str) -> dict | None:
    """The college the student says they're aiming for (only ever their choice)."""

    from app.services import college_match, plan_revision
    from app.services.student_service import save_profile_dict

    match = next((item for item in college_match.colleges() if plan_revision._matches(item["name"], [name])), None)

    if match is None:
        return None

    await save_profile_dict(student_id, {"target_college": {"id": match["id"], "name": match["name"]}})
    await log(student_id, "set_target", f"Set {match['name']} as your target college", href="/")

    return {"kind": "set_target", "text": f"set {match['name']} as your target college", "href": "/"}


def _minor_choices(record: dict, first: dict) -> list[dict]:
    """
    Minors that fit both the interest type and the major: interest fit, plus
    shared school subjects with the major and the student's strongest grades.
    """

    from app.services import college_match

    catalog = college_match.majors_catalog()
    major = catalog.get(first["major"]["cip4"]) or {}
    major_subjects = set(major.get("subjects") or [])
    strong = set()

    for area in (record.get("academics") or {}).get("strong_areas") or []:
        strong |= college_match.AREA_TO_SUBJECTS.get(area, set())

    taken = college_match._words(first["major"]["title"]) | college_match._words(first["minor"]["title"])
    candidates = college_match.rank_minors(record, exclude={first["major"]["cip4"], first["minor"]["cip4"]}, limit=60)
    scored = []

    for item in candidates:
        if college_match._words(item["title"]) & taken or item["florida_bachelors"] < 3:
            continue

        subjects = set(item.get("subjects") or [])
        related = len(subjects & major_subjects) / max(1, len(subjects)) if subjects else 0
        strength = len(subjects & strong) / max(1, len(subjects)) if subjects else 0
        scored.append((0.45 * item["interest_fit"] / 100 + 0.35 * related + 0.2 * strength, item))

    scored.sort(key=lambda pair: -pair[0])

    return [item for _, item in scored[:5]]


async def change_minor(student_id: str, wanted: str = "") -> dict | None:
    """A different minor: the one they name, or the next best fit for their interest type."""

    from app.services import college_match, student_record
    from app.services.student_service import get_profile_dict, save_profile_dict

    profile = await get_profile_dict(student_id)
    result = dict(profile.get("major_minor") or {})
    options = [dict(option) for option in result.get("options") or []]

    if not options:
        return None

    record = await student_record.build_record(student_id, profile)
    first = options[0]
    old = first["minor"]["title"]
    scores = (record.get("riasec") or {}).get("scores") or {}

    if wanted.strip():
        target = college_match.find_major(wanted)
    else:
        ranked = _minor_choices(record, first)
        target = ranked[0] if ranked else None

    if not target or target["cip4"] == first["minor"]["cip4"]:
        return None

    alternatives = [item["title"] for item in _minor_choices(record, first) if item["cip4"] != target["cip4"]][:2]

    fit = round(100 * college_match.interest_fit(scores, target)) if scores else None
    code = (record.get("riasec") or {}).get("code", "")
    first["minor"] = {"cip4": target["cip4"], "cip": target["cip"], "title": target["title"]}
    first["why_minor"] = (
        f"You asked for a different minor. {target['title']} "
        + (f"fits your {code} interest type ({fit}% match)" if fit is not None else "fits your interests")
        + f" and adds a different skill set to {first['major']['title']}."
    )
    options[0] = first
    result["options"] = options
    await save_profile_dict(student_id, {"major_minor": result})
    await log(student_id, "change_minor", f"Changed your minor from {old} to {target['title']}", href="/plan")

    return {
        "kind": "change_minor",
        "text": f"changed your minor from {old} to {target['title']}",
        "href": "/plan",
        "options": [f"Make my minor {title}" for title in alternatives],
    }
