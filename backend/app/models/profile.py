from typing import List, Optional
from pydantic import BaseModel, Field


class StudentProfile(BaseModel):
    name: str = Field(..., min_length=1)

    current_education: str = Field(..., min_length=1)

    interests: List[str] = Field(default_factory=list)

    hobbies: List[str] = Field(default_factory=list)

    career_aspiration: str = Field(..., min_length=1)

    skills: List[str] = Field(default_factory=list)

    years_of_experience: Optional[float] = Field(
        default=None,
        ge=0
    )

    additional_context: Optional[str] = None


class ProfileAnalysis(BaseModel):
    current_profile_summary: str
    likely_role_family: str
    strengths: List[str]
    identified_skills: List[str]
    missing_information: List[str]
    next_step_recommendations: List[str]


class ProfileAnalysisResponse(BaseModel):
    status: str
    analysis: ProfileAnalysis
