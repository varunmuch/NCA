from typing import Optional
from pydantic import BaseModel

from app.models.profile import StudentProfile


class ResumeMetadata(BaseModel):
    id: int
    student_id: str
    original_filename: str
    content_type: Optional[str] = None
    size_bytes: int
    sha256: str
    is_active: bool
    uploaded_at: Optional[str] = None


class ResumeUploadResponse(BaseModel):
    status: str
    message: str
    student_id: str
    resume: ResumeMetadata
    profile: StudentProfile
