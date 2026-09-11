from pydantic import BaseModel
from typing import List


class CareerPathResponse(BaseModel):
    target_role: str
    current_stage: str
    recommended_next_roles: List[str]
    key_skills_to_build: List[str]
    recommended_projects: List[str]
    recommended_certifications: List[str]
    estimated_progression: List[str]
