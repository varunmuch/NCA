from typing import List
from pydantic import BaseModel


class InterviewPrepResponse(BaseModel):
    target_role: str
    interview_type: str
    preparation_summary: str
    student_context_used: List[str]
    core_topics_to_prepare: List[str]
    technical_questions_to_practice: List[str]
    scenario_questions_to_practice: List[str]
    behavioral_questions_to_practice: List[str]
    project_stories_to_prepare: List[str]
    study_plan: List[str]
    mock_interview_plan: List[str]
    resume_positioning_tips: List[str]
    next_steps: List[str]
