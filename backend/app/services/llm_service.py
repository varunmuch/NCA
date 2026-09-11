import json
import httpx

from app.models.profile import StudentProfile, ProfileAnalysis


from app.core.config import config


MODEL_NAME = config["model"]["name"]
VLLM_BASE_URL = config["model"]["base_url"]

TEMPERATURE = config["model"]["temperature"]
MAX_TOKENS = config["model"]["max_tokens"]
TIMEOUT_SECONDS = config["model"]["timeout_seconds"]


async def check_llm():
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(
                f"{VLLM_BASE_URL}/v1/models"
            )
            response.raise_for_status()

            return {
                "status": "ok",
                "llm": "available",
                "model": MODEL_NAME
            }

        except Exception as exc:
            return {
                "status": "error",
                "llm": "unavailable",
                "detail": str(exc)
            }


async def analyze_profile(profile: StudentProfile):

    system_prompt = """
You are the profile-analysis component of a Career Intelligence Engine.

Your task at this stage is ONLY to analyze the provided student profile.

Do not invent certifications, jobs, salaries, companies, or career timelines.

Do not create a full career roadmap yet.

Identify:
1. current profile summary
2. likely career role family
3. demonstrated strengths
4. skill areas already present
5. missing information needed before producing a reliable career roadmap
6. immediate next-step recommendations

Return valid JSON only.

Use this exact structure:

{
  "current_profile_summary": "string",
  "likely_role_family": "string",
  "strengths": ["string"],
  "identified_skills": ["string"],
  "missing_information": ["string"],
  "next_step_recommendations": ["string"]
}
"""

    user_prompt = f"""
Student Profile:

{profile.model_dump_json(indent=2)}
"""

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": user_prompt
            }
        ],
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,

    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "profile_analysis",
            "schema": ProfileAnalysis.model_json_schema()
        	}
    	}
    }

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:

        response = await client.post(
            f"{VLLM_BASE_URL}/v1/chat/completions",
            json=payload
        )

        response.raise_for_status()

        result = response.json()

        content = result["choices"][0]["message"]["content"]

        parsed = ProfileAnalysis.model_validate_json(content)

        return {
            "status": "success",
            "analysis": parsed
        }
