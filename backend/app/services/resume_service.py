import hashlib
import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path

import httpx
from docx import Document
from fastapi import HTTPException, UploadFile
from pypdf import PdfReader
from sqlalchemy import select

from app.core.config import config
from app.core.database import AsyncSessionLocal
from app.db.models import ResumeDocument
from app.models.profile import StudentProfile
from app.services.memory_service import ensure_student, get_profile, save_profile

MODEL_NAME = config["model"]["name"]
VLLM_BASE_URL = config["model"]["base_url"]
TEMPERATURE = config["model"]["temperature"]
TIMEOUT_SECONDS = config["model"]["timeout_seconds"]

MAX_RESUME_BYTES = 8 * 1024 * 1024
MAX_TEXT_CHARS_FOR_LLM = 20000

BACKEND_ROOT = Path(__file__).resolve().parents[2]
STORAGE_ROOT = BACKEND_ROOT / "storage" / "resumes"

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".txt",
}


def safe_student_id(student_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", student_id)


def get_file_extension(filename: str) -> str:
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported resume file type. "
                "Please upload PDF, DOCX, or TXT."
            ),
        )

    return extension


def calculate_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def extract_text_from_pdf(file_path: Path) -> str:
    reader = PdfReader(str(file_path))
    parts: list[str] = []

    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            parts.append(text.strip())

    return "\n\n".join(parts)


def extract_text_from_docx(file_path: Path) -> str:
    document = Document(str(file_path))
    parts: list[str] = []

    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        if text:
            parts.append(text)

    return "\n".join(parts)


def extract_text_from_txt(file_path: Path) -> str:
    return file_path.read_text(encoding="utf-8", errors="ignore")


def extract_resume_text(file_path: Path, extension: str) -> str:
    if extension == ".pdf":
        return extract_text_from_pdf(file_path)

    if extension == ".docx":
        return extract_text_from_docx(file_path)

    if extension == ".txt":
        return extract_text_from_txt(file_path)

    raise HTTPException(
        status_code=400,
        detail="Unsupported resume file type.",
    )


async def parse_resume_to_profile(
    resume_text: str,
    existing_profile: dict | None,
) -> StudentProfile:
    if not resume_text.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not extract readable text from the resume. "
                "Please upload a text-based PDF, DOCX, or TXT file."
            ),
        )

    trimmed_resume_text = resume_text[:MAX_TEXT_CHARS_FOR_LLM]

    if existing_profile is None:
        existing_profile_text = "No existing student profile was found."
    else:
        existing_profile_text = json.dumps(
            existing_profile,
            indent=2,
            default=str,
        )

    system_prompt = """
You are the resume parsing component of the Career Intelligence Engine.

Your job is to extract a student's profile from a resume.

Privacy and safety rules:
- Do not invent fake experience, fake education, fake certifications, or fake skills.
- Use only what is supported by the resume text.
- If a field is missing, use a reasonable neutral value.
- Preserve existing hobbies/interests from the current profile if the resume does not mention them.
- Summarize professional background in additional_context.
- Output valid JSON matching the StudentProfile schema.
"""

    user_prompt = f"""
Existing Student Profile:
{existing_profile_text}

Resume Text:
{trimmed_resume_text}

Task:
Create an updated StudentProfile JSON.

Field guidance:
- name: extract the candidate name if available.
- current_education: extract latest education if available.
- interests: infer only broad professional interests from resume, or keep existing profile interests.
- hobbies: keep existing hobbies if resume does not mention hobbies.
- career_aspiration: infer the most likely target role from the resume.
- skills: extract technical and professional skills from the resume.
- years_of_experience: estimate based on resume dates if possible, otherwise use existing value or 0.
- additional_context: concise summary of resume background, projects, tools, industries, and notable experience.

Return only valid JSON.
Do not include markdown.
Do not include explanation outside JSON.
"""

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ],
        "temperature": TEMPERATURE,
        "max_tokens": 1400,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "student_profile_from_resume",
                "schema": StudentProfile.model_json_schema(),
            },
        },
    }

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"{VLLM_BASE_URL}/v1/chat/completions",
            json=payload,
        )

        response.raise_for_status()

        result = response.json()
        content = result["choices"][0]["message"]["content"]

        try:
            return StudentProfile.model_validate_json(content)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Resume was uploaded, but the model returned invalid "
                    "profile JSON."
                ),
            ) from exc


async def deactivate_existing_active_resumes(
    db,
    student_id: str,
) -> None:
    result = await db.execute(
        select(ResumeDocument).where(
            ResumeDocument.student_id == student_id,
            ResumeDocument.is_active.is_(True),
        )
    )

    existing_resumes = result.scalars().all()

    for resume in existing_resumes:
        resume.is_active = False
        resume.replaced_at = datetime.utcnow()

        try:
            old_path = Path(resume.file_path)
            if old_path.exists():
                old_path.unlink()
        except OSError:
            pass


def resume_record_to_dict(record: ResumeDocument) -> dict:
    return {
        "id": record.id,
        "student_id": record.student_id,
        "original_filename": record.original_filename,
        "content_type": record.content_type,
        "size_bytes": record.size_bytes,
        "sha256": record.sha256,
        "is_active": record.is_active,
        "uploaded_at": record.uploaded_at.isoformat()
        if record.uploaded_at
        else None,
    }


async def upload_resume_and_update_profile(
    student_id: str,
    resume: UploadFile,
) -> dict:
    await ensure_student(student_id)

    if not resume.filename:
        raise HTTPException(
            status_code=400,
            detail="Resume filename is missing.",
        )

    extension = get_file_extension(resume.filename)
    file_bytes = await resume.read()

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=400,
            detail="Uploaded resume file is empty.",
        )

    if len(file_bytes) > MAX_RESUME_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Resume file is too large. Maximum allowed size is 8 MB.",
        )

    file_hash = calculate_sha256(file_bytes)
    safe_id = safe_student_id(student_id)

    student_storage_dir = STORAGE_ROOT / safe_id
    student_storage_dir.mkdir(parents=True, exist_ok=True)

    os.chmod(student_storage_dir, 0o700)

    stored_filename = f"{uuid.uuid4().hex}{extension}"
    stored_path = student_storage_dir / stored_filename

    stored_path.write_bytes(file_bytes)
    os.chmod(stored_path, 0o600)

    resume_text = extract_resume_text(stored_path, extension)

    existing_profile = await get_profile(student_id)

    updated_profile = await parse_resume_to_profile(
        resume_text=resume_text,
        existing_profile=existing_profile,
    )

    async with AsyncSessionLocal() as db:
        await deactivate_existing_active_resumes(
            db=db,
            student_id=student_id,
        )

        record = ResumeDocument(
            student_id=student_id,
            original_filename=Path(resume.filename).name,
            stored_filename=stored_filename,
            file_path=str(stored_path),
            content_type=resume.content_type,
            size_bytes=len(file_bytes),
            sha256=file_hash,
            is_active=True,
            parsed_profile_json=updated_profile.model_dump(),
        )

        db.add(record)
        await db.commit()
        await db.refresh(record)

    await save_profile(
        student_id=student_id,
        profile=updated_profile,
    )

    return {
        "status": "success",
        "message": (
            "Resume uploaded, parsed, and student profile updated successfully."
        ),
        "student_id": student_id,
        "resume": resume_record_to_dict(record),
        "profile": updated_profile.model_dump(),
    }


async def get_active_resume_metadata(student_id: str) -> dict | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ResumeDocument)
            .where(
                ResumeDocument.student_id == student_id,
                ResumeDocument.is_active.is_(True),
            )
            .order_by(ResumeDocument.id.desc())
            .limit(1)
        )

        record = result.scalar_one_or_none()

        if record is None:
            return None

        return resume_record_to_dict(record)


async def get_active_resume_record(student_id: str) -> ResumeDocument | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ResumeDocument)
            .where(
                ResumeDocument.student_id == student_id,
                ResumeDocument.is_active.is_(True),
            )
            .order_by(ResumeDocument.id.desc())
            .limit(1)
        )

        return result.scalar_one_or_none()
