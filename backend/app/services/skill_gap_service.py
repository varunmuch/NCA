import json
import httpx

from app.core.config import config
from app.models.skill_gap import SkillGapResponse

MODEL_NAME = config["model"]["name"]
VLLM_BASE_URL = config["model"]["base_url"]
TEMPERATURE = config["model"]["temperature"]
TIMEOUT_SECONDS = config["model"]["timeout_seconds"]

SKILL_GAP_MAX_TOKENS = 2200


async def generate_skill_gap(
    question: str,
    profile=None,
    memory_context=None,
) -> SkillGapResponse:
    system_prompt = """
You are the skill-gap analysis component of the Career Intelligence Engine.

You are not a general-purpose assistant.

Your job is to compare a student's current skills, education, interests,
experience, and saved CIE memory against a target role.

Important behavior:
- Focus only on career skill-gap analysis.
- Use the student's latest profile if available.
- Use saved memory if no latest profile is submitted.
- Identify what the student already has.
- Identify what is missing for the target role.
- Prioritize gaps realistically.
- Recommend projects that close the missing skills.
- Do not invent fake experience.
- Do not guarantee jobs, salaries, or outcomes.
- Keep every list concise and practical.

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
Create a skill-gap analysis for the target role or goal mentioned in the
student's question.

Include:
- target role
- current skill summary
- matching skills
- missing core skills
- missing tools or platforms
- priority learning order
- recommended projects to close gaps
- weekly skill plan
- certification alignment
- resume positioning tips
- next steps

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
        "max_tokens": SKILL_GAP_MAX_TOKENS,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "skill_gap",
                "schema": SkillGapResponse.model_json_schema(),
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
            return SkillGapResponse.model_validate_json(content)
        except Exception as exc:
            raise ValueError(
                f"Model returned incomplete or invalid JSON. "
                f"Raw model output was: {content}"
            ) from exc
