from typing import List
from pydantic import BaseModel


class ProjectRoadmapResponse(BaseModel):
    project_title: str
    project_goal: str
    target_role_alignment: str
    student_context_used: List[str]
    prerequisite_skills: List[str]
    tools_and_services: List[str]
    architecture_overview: str
    implementation_phases: List[str]
    weekly_roadmap: List[str]
    portfolio_deliverables: List[str]
    resume_bullets: List[str]
    github_readme_sections: List[str]
    evaluation_criteria: List[str]
    next_steps_after_project: List[str]
