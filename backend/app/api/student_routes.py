"""
Student-owned API. Every route resolves the student from the verified
session identity (see app.core.security); no route accepts a student ID.
"""

from pathlib import Path
from typing import Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.core.database import AsyncSessionLocal
from app.core.llm import LLMError, chat_json
from app.core.security import current_student_id
from app.db.models import (
    CareerPlan,
    Message,
    ResumeDocument,
    SavedCareer,
    SectionResponse,
    StudentFact,
)
from app.models.progress import (
    ProgressTaskCreate,
    ProgressTaskUpdate,
    ProgressTimelineCreate,
    ProgressTimelineUpdate,
)
from app.services import account_service
from app.services import career_catalog
from app.services import interest_quiz
from app.services import conversation_service as conversations
from app.services import document_service as documents
from app.services import plan_service as plans
from app.services import progress_service as progress
from app.services import roadmap_service as roadmaps
from app.services import staff_service
from app.services.context_service import build_context, context_block
from app.services.counselor_service import run_turn, summarize_if_needed
from app.services.home_service import home_summary
from app.services.plan_pdf import render_plan_pdf
from app.services.student_service import (
    FACT_CATEGORIES,
    add_facts,
    delete_fact,
    display_name,
    get_profile_dict,
    list_facts,
    save_profile_dict,
    update_fact,
)


router = APIRouter(prefix="/api/v1")

Student = Depends(current_student_id)


# ------------------------------------------------------------------ profile


PROFILE_EDITABLE = {
    "name",
    "preferred_name",
    "grade_level",
    "school",
    "country",
    "favorite_subjects",
    "interests",
    "hobbies",
    "skills",
    "strengths",
    "activities",
    "career_aspiration",
    "career_status",
    "academic_goals",
    "learning_style",
    "current_education",
    "additional_context",
    "onboarding_completed",
}


async def _has_history(student_id: str) -> bool:
    """True when the student used the app before onboarding existed."""

    async with AsyncSessionLocal() as db:
        for model in (
            Message,
            SectionResponse,
            CareerPlan,
            StudentFact,
            ResumeDocument,
            SavedCareer,
        ):
            found = await db.scalar(
                select(model.student_id).where(model.student_id == student_id).limit(1)
            )

            if found is not None:
                return True

    return False


@router.get("/me")
async def get_me(student_id: str = Student):
    profile = await get_profile_dict(student_id)

    # Returning students skip the first-visit survey.
    if not profile.get("onboarding_completed") and await _has_history(student_id):
        profile = await save_profile_dict(student_id, {"onboarding_completed": True})

    return {
        "display_name": display_name(profile),
        "profile": profile,
        "account": await account_service.email_status(student_id),
        "is_staff": await staff_service.is_staff(student_id),
    }


@router.post("/me/email/verification")
async def resend_verification(student_id: str = Student):
    return await account_service.send_verification(student_id)


@router.put("/me/profile")
async def update_profile(updates: dict[str, Any], student_id: str = Student):
    unknown = set(updates) - PROFILE_EDITABLE

    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"These fields can't be edited: {', '.join(sorted(unknown))}",
        )

    for key, value in updates.items():
        if isinstance(value, list):
            updates[key] = [str(item).strip()[:100] for item in value if str(item).strip()][:30]
        elif isinstance(value, str):
            updates[key] = value.strip()

    profile = await save_profile_dict(student_id, updates)

    return {"display_name": display_name(profile), "profile": profile}


class QuizAnswers(BaseModel):
    activities: dict[str, int]
    tradeoffs: dict[str, str]
    settings: list[str] = []
    subjects: list[str] = []
    training: str = "unsure"


@router.get("/interest-quiz")
async def get_interest_quiz(student_id: str = Student):
    profile = await get_profile_dict(student_id)

    return {**interest_quiz.questions(), "result": interest_quiz.result_payload(profile)}


@router.post("/me/interest-quiz")
async def submit_interest_quiz(payload: QuizAnswers, student_id: str = Student):
    scores, details = interest_quiz.score(payload.model_dump())
    profile = await save_profile_dict(
        student_id,
        {
            "interest_scores": scores,
            "interest_quiz": details,
            "interest_quiz_at": interest_quiz.taken_now(),
        },
    )

    return interest_quiz.result_payload(profile)


@router.get("/me/home")
async def get_home(student_id: str = Student):
    return await home_summary(student_id)


# -------------------------------------------------------------------- facts


class FactCreate(BaseModel):
    category: str
    value: str = Field(min_length=1, max_length=300)


class FactUpdate(BaseModel):
    value: str | None = Field(default=None, max_length=300)
    status: str | None = None
    category: str | None = None


class FactIds(BaseModel):
    ids: list[int]


@router.get("/me/facts")
async def get_facts(student_id: str = Student):
    return {
        "facts": await list_facts(student_id),
        "categories": FACT_CATEGORIES,
    }


@router.post("/me/facts")
async def create_fact(payload: FactCreate, student_id: str = Student):
    if payload.category not in FACT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Unknown category.")

    created = await add_facts(
        student_id,
        [{"category": payload.category, "value": payload.value}],
        status="confirmed",
        source_type="student",
        source_id=None,
    )

    if not created:
        raise HTTPException(status_code=409, detail="You already have this saved.")

    return created[0]


@router.patch("/me/facts/{fact_id}")
async def patch_fact(fact_id: int, payload: FactUpdate, student_id: str = Student):
    return await update_fact(
        student_id,
        fact_id,
        value=payload.value,
        status=payload.status,
        category=payload.category,
    )


@router.post("/me/facts/confirm")
async def confirm_facts(payload: FactIds, student_id: str = Student):
    updated = []

    for fact_id in payload.ids[:100]:
        updated.append(await update_fact(student_id, fact_id, status="confirmed"))

    return {"facts": updated}


@router.delete("/me/facts/{fact_id}")
async def remove_fact(fact_id: int, student_id: str = Student):
    await delete_fact(student_id, fact_id)
    return {"status": "deleted"}


# ------------------------------------------------------------ conversations


class CounselorMessage(BaseModel):
    conversation_id: str | None = None
    text: str = Field(min_length=1, max_length=4000)
    action: str | None = None


class RenameConversation(BaseModel):
    title: str = Field(min_length=1, max_length=255)


@router.get("/me/conversations")
async def get_conversations(student_id: str = Student):
    return {"conversations": await conversations.list_conversations(student_id)}


@router.get("/me/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, student_id: str = Student):
    return await conversations.get_conversation_detail(student_id, conversation_id)


@router.patch("/me/conversations/{conversation_id}")
async def rename_conversation(
    conversation_id: str,
    payload: RenameConversation,
    student_id: str = Student,
):
    return await conversations.rename_conversation(student_id, conversation_id, payload.title)


@router.delete("/me/conversations/{conversation_id}")
async def remove_conversation(conversation_id: str, student_id: str = Student):
    await conversations.delete_conversation(student_id, conversation_id)
    return {"status": "deleted"}


@router.post("/me/counselor/messages")
async def send_counselor_message(
    payload: CounselorMessage,
    background: BackgroundTasks,
    student_id: str = Student,
):
    result = await run_turn(
        student_id,
        conversation_id=payload.conversation_id,
        text=payload.text.strip(),
        action=payload.action,
    )
    background.add_task(summarize_if_needed, result["conversation_id"])
    return result


@router.post("/me/conversations/{conversation_id}/retry")
async def retry_counselor_message(
    conversation_id: str,
    background: BackgroundTasks,
    student_id: str = Student,
):
    try:
        result = await run_turn(
            student_id,
            conversation_id=conversation_id,
            text="",
            retry=True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    background.add_task(summarize_if_needed, conversation_id)
    return result


@router.get("/me/earlier-answers")
async def get_earlier_answers(student_id: str = Student):
    """Answers saved by the previous section-based interface (read-only)."""

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(SectionResponse)
                .where(SectionResponse.student_id == student_id)
                .order_by(SectionResponse.created_at.desc())
            )
        ).scalars().all()

    return {
        "answers": [
            {
                "id": row.id,
                "section": row.section,
                "prompt": row.prompt,
                "response": row.response_json,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]
    }


# ---------------------------------------------------------------- documents


@router.get("/me/documents")
async def get_documents(student_id: str = Student):
    return {"documents": await documents.list_documents(student_id)}


@router.post("/me/documents")
async def upload_document(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    student_id: str = Student,
):
    document = await documents.upload_document(student_id, file, doc_type)
    background.add_task(documents.process_document, document["id"])
    return document


@router.get("/me/documents/{document_id}")
async def get_document(document_id: int, student_id: str = Student):
    record = await documents.get_owned_document(student_id, document_id)
    facts = [
        fact
        for fact in await list_facts(student_id)
        if fact["source_type"] == "document" and fact["source_id"] == str(document_id)
    ]

    return {
        **documents.document_to_dict(record, include_details=True),
        "facts": facts,
    }


@router.get("/me/documents/{document_id}/file")
async def get_document_file(
    document_id: int,
    download: bool = Query(default=False),
    student_id: str = Student,
):
    record = await documents.get_owned_document(student_id, document_id)
    path = Path(record.file_path)

    if not path.exists():
        raise HTTPException(status_code=404, detail="The file is missing from storage.")

    return FileResponse(
        path=str(path),
        media_type=record.content_type or "application/octet-stream",
        filename=record.original_filename,
        content_disposition_type="attachment" if download else "inline",
    )


@router.post("/me/documents/{document_id}/process")
async def reprocess_document(
    document_id: int,
    background: BackgroundTasks,
    student_id: str = Student,
):
    document = await documents.mark_for_processing(student_id, document_id)
    background.add_task(documents.process_document, document_id)
    return document


@router.delete("/me/documents/{document_id}")
async def remove_document(document_id: int, student_id: str = Student):
    await documents.delete_document(student_id, document_id)
    return {"status": "deleted"}


# ------------------------------------------------------------------ careers


async def _saved_slugs(student_id: str) -> list[str]:
    async with AsyncSessionLocal() as db:
        return list(
            (
                await db.execute(
                    select(SavedCareer.career_slug)
                    .where(SavedCareer.student_id == student_id)
                    .order_by(SavedCareer.created_at.desc())
                )
            ).scalars().all()
        )


@router.get("/careers/meta")
async def careers_meta(student_id: str = Student):
    catalog = career_catalog.load_catalog()

    return {
        "families": catalog["families"],
        "subjects": career_catalog.all_subjects(),
        "interests": [
            {"key": key, "label": label}
            for key, label in career_catalog.INTEREST_LABELS.items()
        ],
        "source": catalog["source"],
        "count": len(catalog["careers"]),
    }


@router.get("/careers")
async def careers_search(
    q: str = "",
    family: str = "",
    subject: str = "",
    interest: str = "",
    student_id: str = Student,
):
    found = career_catalog.search_careers(
        query=q[:100],
        family=family,
        subject=subject,
        interest=interest,
    )
    saved = set(await _saved_slugs(student_id))

    return {
        "careers": [{**career, "saved": career["slug"] in saved} for career in found["careers"]],
        "suggestion": found["suggestion"],
    }


@router.get("/careers/for-me")
async def careers_for_me(student_id: str = Student):
    profile = await get_profile_dict(student_id)
    enriched = dict(profile)

    for fact in await list_facts(student_id):
        if fact["status"] == "confirmed" and fact["category"] in {
            "interests",
            "hobbies",
            "favorite_subjects",
            "activities",
            "strengths",
            "career_interests",
        }:
            key = "interests" if fact["category"] == "career_interests" else fact["category"]
            enriched[key] = list(enriched.get(key) or []) + [fact["value"]]

    saved = set(await _saved_slugs(student_id))
    matches = career_catalog.match_careers(enriched, limit=9)

    return {
        "careers": [{**career, "saved": career["slug"] in saved} for career in matches],
        "has_signals": bool(matches),
    }


@router.get("/careers/compare")
async def careers_compare(slugs: str, student_id: str = Student):
    selected = []

    for slug in slugs.split(",")[:3]:
        career = career_catalog.get_career(slug.strip())

        if career:
            selected.append(
                {**career, "family_label": career_catalog.family_label(career["family"])}
            )

    return {"careers": selected}


@router.get("/careers/{slug}")
async def career_detail(slug: str, student_id: str = Student):
    career = career_catalog.get_career(slug)

    if career is None:
        raise HTTPException(status_code=404, detail="Career not found.")

    related = [
        career_catalog.summary(item)
        for related_slug in career["related"]
        if (item := career_catalog.get_career(related_slug))
    ]

    return {
        **career,
        "family_label": career_catalog.family_label(career["family"]),
        "related_careers": related,
        "saved": slug in await _saved_slugs(student_id),
        "source": career_catalog.load_catalog()["source"],
    }


INSIGHTS_SCHEMA = {
    "type": "object",
    "properties": {
        "day_to_day": {"type": "string", "maxLength": 600},
        "connection_to_you": {"type": "string", "maxLength": 500},
        "beginner_experiences": {"type": "array", "items": {"type": "string", "maxLength": 200}, "maxItems": 5},
        "alternative_routes": {"type": "array", "items": {"type": "string", "maxLength": 200}, "maxItems": 4},
        "questions_to_consider": {"type": "array", "items": {"type": "string", "maxLength": 200}, "maxItems": 5},
    },
    "required": [
        "day_to_day",
        "connection_to_you",
        "beginner_experiences",
        "alternative_routes",
        "questions_to_consider",
    ],
}


@router.post("/careers/{slug}/insights")
async def career_insights(slug: str, student_id: str = Student):
    career = career_catalog.get_career(slug)

    if career is None:
        raise HTTPException(status_code=404, detail="Career not found.")

    context = await build_context(student_id, None, career["title"])

    facts_block = (
        f"Career: {career['title']}\n"
        f"Description: {career['description']}\n"
        f"Typical tasks: {'; '.join(career['tasks'])}\n"
        f"Important knowledge: {', '.join(career['knowledge'])}\n"
        f"Skills: {', '.join(career['skills'])}\n"
        f"Typical preparation: {career['preparation']}. {career['education_summary']}\n"
        f"Related careers: {', '.join(career['related'])}"
    )

    try:
        insights = await chat_json(
            [
                {
                    "role": "system",
                    "content": (
                        "You help high school students understand a career. Use "
                        "the O*NET facts provided for what the job involves. Write "
                        "for a 9th grader. Do not invent salaries, statistics, "
                        "program names, or admission requirements. Beginner "
                        "experiences must be things a high school student can "
                        "realistically do (clubs, electives, free online courses, "
                        "volunteering, job shadowing, personal projects). "
                        "connection_to_you: relate the career to the student's own "
                        "information; if little is known, say what they could "
                        "notice about themselves instead. Never say they are or "
                        "aren't suited for it.\n\n"
                        + context_block(context)
                    ),
                },
                {"role": "user", "content": facts_block},
            ],
            schema=INSIGHTS_SCHEMA,
            schema_name="career_insights",
            max_tokens=1200,
            temperature=0.4,
        )
    except LLMError:
        raise HTTPException(
            status_code=503,
            detail="The counselor couldn't put this together right now. Please try again.",
        )

    return insights


@router.get("/careers/{slug}/roadmap")
async def get_career_roadmap(slug: str, student_id: str = Student):
    return await roadmaps.get_roadmap(student_id, slug)


@router.post("/careers/{slug}/roadmap")
async def create_career_roadmap(slug: str, student_id: str = Student):
    try:
        return await roadmaps.generate_roadmap(student_id, slug)
    except LLMError:
        raise HTTPException(
            status_code=503,
            detail="Your roadmap couldn't be created just now. Please try again in a moment.",
        )


@router.post("/careers/{slug}/roadmap/track")
async def track_career_roadmap(slug: str, student_id: str = Student):
    return await roadmaps.track_roadmap(student_id, slug)


@router.get("/me/saved-careers")
async def get_saved_careers(student_id: str = Student):
    careers = []

    for slug in await _saved_slugs(student_id):
        career = career_catalog.get_career(slug)

        if career:
            careers.append({**career_catalog.summary(career), "saved": True})

    return {"careers": careers}


@router.put("/me/saved-careers/{slug}")
async def save_career(slug: str, student_id: str = Student):
    if career_catalog.get_career(slug) is None:
        raise HTTPException(status_code=404, detail="Career not found.")

    if slug not in await _saved_slugs(student_id):
        async with AsyncSessionLocal() as db:
            db.add(SavedCareer(student_id=student_id, career_slug=slug))
            await db.commit()

    return {"slug": slug, "saved": True}


@router.delete("/me/saved-careers/{slug}")
async def unsave_career(slug: str, student_id: str = Student):
    async with AsyncSessionLocal() as db:
        await db.execute(
            delete(SavedCareer).where(
                SavedCareer.student_id == student_id,
                SavedCareer.career_slug == slug,
            )
        )
        await db.commit()

    return {"slug": slug, "saved": False}


# -------------------------------------------------------------------- plans


class PlanGenerate(BaseModel):
    career_goal: str = Field(default="", max_length=200)
    instruction: str = Field(default="", max_length=1000)


class PlanRevise(BaseModel):
    instruction: str = Field(default="", max_length=1000)
    career_goal: str = Field(default="", max_length=200)


def _plan_error() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail="Your plan couldn't be created just now. Please try again in a moment.",
    )


@router.get("/me/plans")
async def get_plans(student_id: str = Student):
    return {"plans": await plans.list_plans(student_id)}


@router.post("/me/plans")
async def create_plan(payload: PlanGenerate, student_id: str = Student):
    try:
        return await plans.generate_plan(
            student_id,
            career_goal=payload.career_goal,
            instruction=payload.instruction,
        )
    except LLMError:
        raise _plan_error()


@router.get("/me/plans/{plan_id}")
async def get_plan(plan_id: str, student_id: str = Student):
    return await plans.get_plan_detail(student_id, plan_id)


@router.patch("/me/plans/{plan_id}")
async def patch_plan(plan_id: str, updates: dict[str, Any], student_id: str = Student):
    return await plans.update_plan(student_id, plan_id, updates)


@router.post("/me/plans/{plan_id}/revise")
async def revise_plan(plan_id: str, payload: PlanRevise, student_id: str = Student):
    if not payload.instruction.strip() and not payload.career_goal.strip():
        raise HTTPException(status_code=400, detail="Tell the counselor what to change.")

    try:
        return await plans.revise_plan(
            student_id,
            plan_id,
            instruction=payload.instruction,
            career_goal=payload.career_goal,
        )
    except LLMError:
        raise _plan_error()


@router.post("/me/plans/{plan_id}/save")
async def save_plan(plan_id: str, student_id: str = Student):
    return await plans.save_plan(student_id, plan_id)


@router.delete("/me/plans/{plan_id}")
async def remove_plan(plan_id: str, student_id: str = Student):
    await plans.delete_plan(student_id, plan_id)
    return {"status": "deleted"}


@router.get("/me/plans/{plan_id}/pdf")
async def plan_pdf(plan_id: str, student_id: str = Student):
    plan = await plans.get_plan_detail(student_id, plan_id)
    profile = await get_profile_dict(student_id)

    pdf = render_plan_pdf(
        plan,
        str(profile.get("preferred_name") or profile.get("name") or ""),
        plan["task_status"],
    )

    filename = "neocity-career-plan.pdf"

    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ----------------------------------------------------------------- progress


@router.get("/me/progress")
async def get_progress(student_id: str = Student):
    return await progress.get_progress_board(student_id)


@router.post("/me/progress/timelines")
async def create_timeline(payload: ProgressTimelineCreate, student_id: str = Student):
    return await progress.create_progress_timeline(student_id=student_id, payload=payload)


@router.put("/me/progress/timelines/{timeline_id}")
async def update_timeline(
    timeline_id: int,
    payload: ProgressTimelineUpdate,
    student_id: str = Student,
):
    return await progress.update_progress_timeline(
        student_id=student_id,
        timeline_id=timeline_id,
        payload=payload,
    )


@router.delete("/me/progress/timelines/{timeline_id}")
async def delete_timeline(timeline_id: int, student_id: str = Student):
    return await progress.delete_progress_timeline(student_id=student_id, timeline_id=timeline_id)


@router.post("/me/progress/timelines/{timeline_id}/tasks")
async def create_task(
    timeline_id: int,
    payload: ProgressTaskCreate,
    student_id: str = Student,
):
    return await progress.create_progress_task(
        student_id=student_id,
        timeline_id=timeline_id,
        payload=payload,
    )


@router.put("/me/progress/tasks/{task_id}")
async def update_task(task_id: int, payload: ProgressTaskUpdate, student_id: str = Student):
    return await progress.update_progress_task(
        student_id=student_id,
        task_id=task_id,
        payload=payload,
    )


@router.delete("/me/progress/tasks/{task_id}")
async def delete_task(task_id: int, student_id: str = Student):
    return await progress.delete_progress_task(student_id=student_id, task_id=task_id)
