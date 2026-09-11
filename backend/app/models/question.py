from typing import Optional

from pydantic import BaseModel, Field

from app.models.profile import StudentProfile


class CareerQuestion(BaseModel):
    student_id: str = Field(
        ...,
        min_length=1,
        max_length=128
    )

    question: str = Field(
        ...,
        min_length=3,
        max_length=2000
    )

    profile: Optional[StudentProfile] = None
