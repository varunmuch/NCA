from typing import List
from pydantic import BaseModel


class SkillGapResponse(BaseModel):
    target_role: str
    current_skill_summary: str
    matching_skills: List[str]
    missing_core_skills: List[str]
    missing_tools_or_platforms: List[str]
    priority_learning_order: List[str]
    recommended_projects_to_close_gaps: List[str]
    weekly_skill_plan: List[str]
    certification_alignment: List[str]
    resume_positioning_tips: List[str]
    next_steps: List[str]
