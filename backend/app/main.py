from pathlib import Path
from uuid import uuid4

from fastapi import (
    FastAPI,
    File,
    HTTPException,
    UploadFile,
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.models.profile import (
    StudentProfile,
    ProfileAnalysisResponse,
)

from app.models.question import CareerQuestion

from app.models.progress import (
    ProgressTaskCreate,
    ProgressTaskUpdate,
    ProgressTimelineCreate,
    ProgressTimelineUpdate,
)

from app.services.llm_service import (
    check_llm,
    analyze_profile,
)

from app.services.relevance_guard import (
    check_relevance,
    RelevanceDecision,
    REJECTION_MESSAGE,
)

from app.services.intent_classifier import (
    classify_intent,
    CareerIntent,
)

from app.services.career_path_service import generate_career_path
from app.services.project_service import generate_project_roadmap
from app.services.interview_service import generate_interview_prep
from app.services.skill_gap_service import generate_skill_gap
from app.services.certification_service import generate_certification_guidance

from app.services.section_history_service import (
    get_section_responses,
    save_section_response,
)

from app.services.resume_service import (
    get_active_resume_metadata,
    get_active_resume_record,
    upload_resume_and_update_profile,
)

from app.services.progress_service import (
    create_progress_task,
    create_progress_timeline,
    delete_progress_task,
    delete_progress_timeline,
    get_progress_board,
    update_progress_task,
    update_progress_timeline,
)

from app.services.memory_service import (
    build_student_context,
    ensure_student,
    get_profile,
    save_message,
    save_profile,
)

from app.services.memory_compressor import compress_memory_if_needed


class CreateStudentRequest(BaseModel):
    student_id: str | None = None


class SaveSectionHistoryRequest(BaseModel):
    student_id: str
    section: str
    prompt: str
    backend_prompt: str
    response: dict


app = FastAPI(
    title="Career Intelligence Engine",
    version="0.1.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3001",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "cie-backend",
    }


@app.get("/health/llm")
async def health_llm():
    return await check_llm()


@app.post("/api/v1/students")
async def create_student(request: CreateStudentRequest | None = None):
    if request is not None and request.student_id:
        student_id = request.student_id
    else:
        student_id = str(uuid4())

    await ensure_student(student_id)

    return {
        "status": "success",
        "student_id": student_id,
        "message": "Student created or loaded successfully.",
    }


@app.post(
    "/api/v1/profile/analyze",
    response_model=ProfileAnalysisResponse,
)
async def profile_analyze(profile: StudentProfile):
    return await analyze_profile(profile)


@app.get("/api/v1/students/{student_id}/profile")
async def get_student_profile(student_id: str):
    await ensure_student(student_id)

    profile = await get_profile(student_id)

    if profile is None:
        return {
            "status": "not_found",
            "student_id": student_id,
            "profile": None,
            "message": "No saved profile found for this student.",
        }

    return {
        "status": "success",
        "student_id": student_id,
        "profile": profile,
    }


@app.put("/api/v1/students/{student_id}/profile")
async def update_student_profile(
    student_id: str,
    profile: StudentProfile,
):
    await ensure_student(student_id)

    await save_profile(
        student_id,
        profile,
    )

    return {
        "status": "success",
        "student_id": student_id,
        "message": "Student profile saved successfully.",
        "profile": profile,
    }


@app.post("/api/v1/students/{student_id}/resume/upload")
async def upload_student_resume(
    student_id: str,
    resume: UploadFile = File(...),
):
    return await upload_resume_and_update_profile(
        student_id=student_id,
        resume=resume,
    )


@app.get("/api/v1/students/{student_id}/resume")
async def get_student_resume(student_id: str):
    await ensure_student(student_id)

    resume = await get_active_resume_metadata(student_id)

    if resume is None:
        return {
            "status": "not_found",
            "student_id": student_id,
            "resume": None,
            "message": "No active resume found for this student.",
        }

    return {
        "status": "success",
        "student_id": student_id,
        "resume": resume,
    }


@app.get("/api/v1/students/{student_id}/resume/download")
async def download_student_resume(student_id: str):
    await ensure_student(student_id)

    resume = await get_active_resume_record(student_id)

    if resume is None:
        raise HTTPException(
            status_code=404,
            detail="No active resume found for this student.",
        )

    file_path = Path(resume.file_path)

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Resume file is missing from storage.",
        )

    return FileResponse(
        path=str(file_path),
        media_type=resume.content_type or "application/octet-stream",
        filename=resume.original_filename,
    )


@app.get("/api/v1/students/{student_id}/progress")
async def get_student_progress(student_id: str):
    return await get_progress_board(student_id)


@app.post("/api/v1/students/{student_id}/progress/timelines")
async def create_student_progress_timeline(
    student_id: str,
    payload: ProgressTimelineCreate,
):
    return await create_progress_timeline(
        student_id=student_id,
        payload=payload,
    )


@app.put("/api/v1/students/{student_id}/progress/timelines/{timeline_id}")
async def update_student_progress_timeline(
    student_id: str,
    timeline_id: int,
    payload: ProgressTimelineUpdate,
):
    return await update_progress_timeline(
        student_id=student_id,
        timeline_id=timeline_id,
        payload=payload,
    )


@app.delete("/api/v1/students/{student_id}/progress/timelines/{timeline_id}")
async def delete_student_progress_timeline(
    student_id: str,
    timeline_id: int,
):
    return await delete_progress_timeline(
        student_id=student_id,
        timeline_id=timeline_id,
    )


@app.post("/api/v1/students/{student_id}/progress/timelines/{timeline_id}/tasks")
async def create_student_progress_task(
    student_id: str,
    timeline_id: int,
    payload: ProgressTaskCreate,
):
    return await create_progress_task(
        student_id=student_id,
        timeline_id=timeline_id,
        payload=payload,
    )


@app.put("/api/v1/students/{student_id}/progress/tasks/{task_id}")
async def update_student_progress_task(
    student_id: str,
    task_id: int,
    payload: ProgressTaskUpdate,
):
    return await update_progress_task(
        student_id=student_id,
        task_id=task_id,
        payload=payload,
    )


@app.delete("/api/v1/students/{student_id}/progress/tasks/{task_id}")
async def delete_student_progress_task(
    student_id: str,
    task_id: int,
):
    return await delete_progress_task(
        student_id=student_id,
        task_id=task_id,
    )


@app.get("/api/v1/students/{student_id}/sections/{section}/history")
async def get_student_section_history(
    student_id: str,
    section: str,
):
    await ensure_student(student_id)

    history = await get_section_responses(
        student_id=student_id,
        section=section,
    )

    return {
        "status": "success",
        "student_id": student_id,
        "section": section,
        "history": history,
    }


@app.post("/api/v1/section-history")
async def create_section_history(
    request: SaveSectionHistoryRequest,
):
    await ensure_student(request.student_id)

    await save_section_response(
        student_id=request.student_id,
        section=request.section,
        prompt=request.prompt,
        backend_prompt=request.backend_prompt,
        response_json=request.response,
    )

    return {
        "status": "success",
        "student_id": request.student_id,
        "section": request.section,
        "message": "Section response saved successfully.",
    }


@app.post("/api/v1/career/question")
async def career_question(request: CareerQuestion):
    decision, reason = check_relevance(request.question)

    if decision == RelevanceDecision.REJECT:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "SECURITY_REJECTED",
                "message": REJECTION_MESSAGE,
                "reason": reason,
            },
        )

    intent = classify_intent(request.question)

    if intent == CareerIntent.OUT_OF_SCOPE:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "OUT_OF_SCOPE",
                "message": REJECTION_MESSAGE,
                "reason": (
                    "The request does not match a supported "
                    "career-guidance intent."
                ),
            },
        )

    await ensure_student(request.student_id)

    if request.profile is not None:
        await save_profile(
            request.student_id,
            request.profile,
        )

    await save_message(
        request.student_id,
        "user",
        request.question,
    )

    memory_context = await build_student_context(
        request.student_id
    )

    if (
        memory_context.get("latest_profile") is None
        and request.profile is None
    ):
        return {
            "status": "needs_profile",
            "student_id": request.student_id,
            "intent": intent.value,
            "message": (
                "I need the student's profile before giving personalized "
                "career guidance. Please provide education, skills, "
                "interests, experience, and target career role."
            ),
            "required_fields": [
                "current_education",
                "skills",
                "interests",
                "career_aspiration",
                "years_of_experience",
            ],
        }

    if intent == CareerIntent.PROJECTS:
        result = await generate_project_roadmap(
            request.question,
            request.profile,
            memory_context,
        )

    elif intent == CareerIntent.INTERVIEW:
        result = await generate_interview_prep(
            request.question,
            request.profile,
            memory_context,
        )

    elif intent == CareerIntent.SKILL_GAP:
        result = await generate_skill_gap(
            request.question,
            request.profile,
            memory_context,
        )

    elif intent == CareerIntent.CERTIFICATION:
        result = await generate_certification_guidance(
            request.question,
            request.profile,
            memory_context,
        )

    elif intent == CareerIntent.CAREER_PATH:
        result = await generate_career_path(
            request.question,
            request.profile,
            memory_context,
        )

    else:
        return {
            "status": "accepted",
            "student_id": request.student_id,
            "intent": intent.value,
            "question": request.question,
            "message": "This career intent is valid but not implemented yet.",
        }

    await save_message(
        request.student_id,
        "assistant",
        result.model_dump_json(),
    )

    await compress_memory_if_needed(
        request.student_id
    )

    return {
        "status": "success",
        "student_id": request.student_id,
        "intent": intent.value,
        "result": result,
    }
