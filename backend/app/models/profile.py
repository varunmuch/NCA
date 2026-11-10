from typing import Optional

from pydantic import BaseModel, Field


class StudentProfile(BaseModel):
    """
    Student profile persisted by CIE.

    Profile fields may be saved incrementally, so editable fields
    are allowed to be empty. Individual career services can decide
    which fields are required for a particular analysis.
    """

    name: str = ""

    email: Optional[str] = None

    current_education: str = ""

    interests: list[str] = Field(
        default_factory=list
    )

    hobbies: list[str] = Field(
        default_factory=list
    )

    career_aspiration: str = ""

    skills: list[str] = Field(
        default_factory=list
    )

    years_of_experience: Optional[float] = 0

    additional_context: Optional[str] = ""

    # Student-first fields (added with the counselor redesign).

    preferred_name: str = Field(default="", max_length=80)

    grade_level: str = Field(default="", max_length=40)

    school: str = Field(default="", max_length=160)

    country: str = Field(default="", max_length=80)

    favorite_subjects: list[str] = Field(
        default_factory=list
    )

    strengths: list[str] = Field(
        default_factory=list
    )

    activities: list[str] = Field(
        default_factory=list
    )

    # "have_goal", "exploring", or "" when unanswered.
    career_status: str = Field(default="", max_length=20)

    academic_goals: str = Field(default="", max_length=1000)

    learning_style: str = Field(default="", max_length=200)

    onboarding_completed: bool = False

    # Interest quiz: RIASEC type -> 0-100, the other answers (work settings,
    # subjects, training), and when it was taken.
    interest_scores: dict[str, int] = Field(default_factory=dict)
    interest_quiz: dict = Field(default_factory=dict)
    # Focused quiz within the student's goal field (field_quiz.py); no longer
    # offered, kept so older profiles still validate.
    field_quiz: dict = Field(default_factory=dict)
    # What the student told us that their documents may not show: SAT, ACT,
    # service hours, paid work hours, the major they want, interests
    # (student_record.py).
    academic_profile: dict = Field(default_factory=dict)
    # The quiz's major and minor suggestions (major_agent.py).
    major_minor: dict = Field(default_factory=dict)
    # A college the student chose as their target ({"id", "name"}); empty
    # until they name one. The app never picks it for them.
    target_college: dict = Field(default_factory=dict)
    interest_quiz_at: str = ""
    # Home visits, for "Since last time" (ISO times, set by home_service).
    home_seen_at: str = ""
    home_prev_seen_at: str = ""
