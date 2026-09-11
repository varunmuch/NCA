import json
import httpx

from app.core.config import config
from app.models.interview import InterviewPrepResponse

MODEL_NAME = config["model"]["name"]
VLLM_BASE_URL = config["model"]["base_url"]
TEMPERATURE = config["model"]["temperature"]
TIMEOUT_SECONDS = config["model"]["timeout_seconds"]

INTERVIEW_MAX_TOKENS = 2200


async def generate_interview_prep(
    question: str,
    profile=None,
    memory_context=None,
) -> InterviewPrepResponse:
    system_prompt = """
You are the interview-preparation component of the Career Intelligence Engine.

You are not a general-purpose assistant.

Your job is to help students prepare for interviews based on:
1. their target role
2. their current education
3. their current skills
4. their previous CIE memory
5. the current interview-preparation question

Important behavior:
- Give interview preparation guidance, not a generic career roadmap.
- Use the student's saved profile and previous context.
- If the current question mentions a new target role, focus on that target role.
- If saved memory conflicts with the current question, prioritize the current question.
- Do not invent fake experience.
- Do not guarantee job outcomes.
- Keep each list concise and practical.

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
Create a practical interview preparation plan for the role or interview type
mentioned in the student's question.

Include:
- target role
- interview type
- preparation summary
- student context used
- core topics to prepare
- technical questions to practice
- scenario questions to practice
- behavioral questions to practice
- project stories to prepare
- study plan
- mock interview plan
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
        "max_tokens": INTERVIEW_MAX_TOKENS,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "interview_prep",
                "schema": InterviewPrepResponse.model_json_schema(),
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

        return InterviewPrepResponse.model_validate_json(content)
