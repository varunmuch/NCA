from typing import List
from pydantic import BaseModel


class CertificationResponse(BaseModel):
    target_role: str
    current_level_summary: str
    recommended_first_certification: str
    recommended_certifications: List[str]
    certification_order: List[str]
    certification_reasoning: List[str]
    estimated_timeline: List[str]
    preparation_plan: List[str]
    hands_on_practice_needed: List[str]
    project_alignment: List[str]
    resume_positioning_tips: List[str]
    next_steps: List[str]
