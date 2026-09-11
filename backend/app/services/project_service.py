import json
import httpx

from app.core.config import config
from app.models.project import ProjectRoadmapResponse

MODEL_NAME = config["model"]["name"]
VLLM_BASE_URL = config["model"]["base_url"]
TEMPERATURE = config["model"]["temperature"]
TIMEOUT_SECONDS = config["model"]["timeout_seconds"]

# Project roadmaps are longer than simple career-path responses.
# Use a larger token limit so the JSON does not get cut off.
PROJECT_MAX_TOKENS = 2200


async def generate_project_roadmap(
    question: str,
    profile=None,
    memory_context=None,
) -> ProjectRoadmapResponse:
    system_prompt = """
You are the project-roadmap component of the Career Intelligence Engine.

You are not a general-purpose assistant.

Your job is to convert a student's project-related question into a detailed,
career-relevant implementation roadmap.

Use:
1. the student's latest submitted profile
2. the student's saved profile from memory
3. the previous CIE conversation context
4. the current project question

Important behavior:
- Do not repeat a generic career roadmap.
- Do not simply recommend the same list of projects again.
- If the student asks for a roadmap for a specific project, give a detailed roadmap for that project.
- Use the student's saved career goal, skills, education, and previous context.
- The latest submitted profile wins if it conflicts with memory.
- If no current profile is submitted, use the saved profile from memory.
- Do not invent guaranteed outcomes, salaries, job offers, or fake credentials.

Keep each list concise.
Each list should contain 4 to 7 items maximum.
Each item should be one clear sentence.

The output must be valid JSON matching the required schema.
"""

    if profile is not None:
        profile_context = profile.model_dump_json(indent=2)
    else:
        profile_context = "No latest profile was submitted in this request."

    if memory_context is not None:
        memory_context_text = json.dumps(memory_context, indent=2, default=str)
    else:
        memory_context_text = "No previous student memory was found."

    user_prompt = f"""
Current Student Question:
{question}

Latest Student Profile From Current Request:
{profile_context}

Student Saved Memory And Recent Conversation:
{memory_context_text}

Task:
Create a detailed implementation roadmap for the specific project mentioned
in the current question.

The roadmap should be practical for the student's level and useful for:
- GitHub portfolio
- resume bullet points
- interview discussion
- career progression toward the target role

For this project, include:
- project title
- project goal
- target role alignment
- student context used
- prerequisite skills
- tools and AWS services
- architecture overview
- implementation phases
- weekly roadmap
- portfolio deliverables
- resume bullets
- GitHub README sections
- evaluation criteria
- next steps after the project

Return only valid JSON.
Do not include markdown.
Do not include explanation outside JSON.
"""

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ],
        "temperature": TEMPERATURE,
        "max_tokens": PROJECT_MAX_TOKENS,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "project_roadmap",
                "schema": ProjectRoadmapResponse.model_json_schema(),
            },
        },
    }

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"{VLLM_BASE_URL}/v1/chat/completions",
            json=payload,
        )

        response.raise_for_status()

        result = response.json()
        content = result["choices"][0]["message"]["content"]

        try:
            return ProjectRoadmapResponse.model_validate_json(content)
        except Exception as exc:
            raise ValueError(
                f"Model returned incomplete or invalid JSON. "
                f"Raw model output was: {content}"
            ) from exc

