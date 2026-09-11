import json
import httpx

from app.core.config import config
from app.models.certification import CertificationResponse

MODEL_NAME = config["model"]["name"]
VLLM_BASE_URL = config["model"]["base_url"]
TEMPERATURE = config["model"]["temperature"]
TIMEOUT_SECONDS = config["model"]["timeout_seconds"]

CERTIFICATION_MAX_TOKENS = 2200


async def generate_certification_guidance(
    question: str,
    profile=None,
    memory_context=None,
) -> CertificationResponse:
    system_prompt = """
You are the certification-guidance component of the Career Intelligence Engine.

You are not a general-purpose assistant.

Your job is to recommend practical certifications based on:
1. the student's target role
2. the student's current education
3. the student's current skills
4. the student's experience level
5. the student's saved CIE memory
6. the current certification question

Important behavior:
- Focus only on certifications and career preparation.
- Recommend realistic certifications for the student's current level.
- Explain why each certification fits the target role.
- Give a practical order, not a random list.
- Include hands-on practice needed before or during certification prep.
- Connect certifications to projects, resume positioning, and interviews.
- Do not invent fake credentials.
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
Create certification guidance for the target role or goal mentioned in the
student's question.

Include:
- target role
- current level summary
- recommended first certification
- recommended certifications
- certification order
- certification reasoning
- estimated timeline
- preparation plan
- hands-on practice needed
- project alignment
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
        "max_tokens": CERTIFICATION_MAX_TOKENS,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "certification_guidance",
                "schema": CertificationResponse.model_json_schema(),
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
            return CertificationResponse.model_validate_json(content)
        except Exception as exc:
            raise ValueError(
                f"Model returned incomplete or invalid JSON. "
                f"Raw model output was: {content}"
            ) from exc
