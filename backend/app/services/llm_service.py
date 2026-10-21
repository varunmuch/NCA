import httpx

from app.core.config import config


MODEL_NAME = config["model"]["name"]
VLLM_BASE_URL = config["model"]["base_url"]


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
