from enum import Enum


class CareerIntent(str, Enum):
    CAREER_PATH = "career_path"
    SKILL_GAP = "skill_gap"
    CERTIFICATION = "certification"
    RESUME = "resume"
    PROJECTS = "projects"
    JOB_SEARCH = "job_search"
    INTERVIEW = "interview"
    EDUCATION = "education"
    ROLE_COMPARISON = "role_comparison"
    CAREER_PROGRESSION = "career_progression"
    OUT_OF_SCOPE = "out_of_scope"


CAREER_ROLE_TERMS = [
    "engineer",
    "developer",
    "analyst",
    "architect",
    "scientist",
    "administrator",
    "consultant",
    "specialist",
    "manager",
    "lead",
    "intern",
    "cloud",
    "data",
    "software",
    "devops",
    "network",
    "security",
    "cybersecurity",
    "machine learning",
    "ai",
    "full stack",
    "backend",
    "frontend",
    "database",
    "business analyst",
    "product manager",
]

INTENT_KEYWORDS = {
    CareerIntent.CAREER_PATH: [
        "career path",
        "career roadmap",
        "roadmap",
        "road map",
        "path",
        "learning path",
        "become a",
        "become an",
        "how do i become",
        "how can i become",
        "how to become",
        "career transition",
        "career direction",
        "career guidance",
        "growth plan",
        "plan to become",
        "route to become",
    ],
    CareerIntent.SKILL_GAP: [
        "skill gap",
        "skills gap",
        "skills missing",
        "missing skills",
        "what skills",
        "skills required",
        "need to learn",
        "skills do i need",
        "compare my skills",
        "gap analysis",
    ],
    CareerIntent.CERTIFICATION: [
        "certification",
        "certifications",
        "certificate",
        "certified",
        "which cert",
        "aws cert",
        "azure cert",
        "google cloud cert",
        "databricks cert",
        "snowflake cert",
    ],
    CareerIntent.RESUME: [
        "resume",
        "cv",
        "resume review",
        "resume analysis",
        "ats",
        "bullet",
        "linkedin",
        "profile summary",
    ],
    CareerIntent.PROJECTS: [
        "project",
        "projects",
        "portfolio",
        "github project",
        "build",
        "deploy",
        "implementation roadmap",
        "project roadmap",
        "roadmap for this project",
    ],
    CareerIntent.JOB_SEARCH: [
        "job search",
        "job posting",
        "job description",
        "open roles",
        "jobs",
        "companies hiring",
        "apply",
        "application",
    ],
    CareerIntent.INTERVIEW: [
        "interview",
        "interview preparation",
        "interview questions",
        "mock interview",
        "behavioral",
        "technical round",
        "coding round",
    ],
    CareerIntent.EDUCATION: [
        "course",
        "courses",
        "degree",
        "education",
        "training",
        "learning",
        "study plan",
    ],
    CareerIntent.ROLE_COMPARISON: [
        "compare roles",
        "difference between",
        "which role",
        "role comparison",
        "better role",
    ],
    CareerIntent.CAREER_PROGRESSION: [
        "promotion",
        "career growth",
        "career progression",
        "senior",
        "lead",
        "manager",
        "next role",
        "next position",
    ],
}


def classify_intent(text: str) -> CareerIntent:
    normalized = text.lower().strip()

    # Project-specific questions should route to project service first.
    for keyword in INTENT_KEYWORDS[CareerIntent.PROJECTS]:
        if keyword in normalized:
            return CareerIntent.PROJECTS

    # Direct keyword matching.
    for intent, keywords in INTENT_KEYWORDS.items():
        if intent == CareerIntent.PROJECTS:
            continue

        if any(keyword in normalized for keyword in keywords):
            return intent

    # Fallback: if the question mentions a career role and a planning word,
    # treat it as a career-path request.
    planning_terms = [
        "roadmap",
        "road map",
        "path",
        "plan",
        "guide",
        "steps",
        "learn",
        "become",
        "career",
    ]

    has_role_term = any(term in normalized for term in CAREER_ROLE_TERMS)
    has_planning_term = any(term in normalized for term in planning_terms)

    if has_role_term and has_planning_term:
        return CareerIntent.CAREER_PATH

    return CareerIntent.OUT_OF_SCOPE
