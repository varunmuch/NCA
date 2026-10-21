"""
Shared client for the locally served Qwen model (vLLM, OpenAI-compatible).

The deployed vLLM server has no tool-calling parser enabled, so every
structured interaction uses guided JSON decoding (response_format with a
JSON schema), which has been verified against this deployment.
"""

import json
import logging
import time
from typing import Any

import httpx

from app.core.config import config


logger = logging.getLogger("cie.llm")

MODEL_NAME = config["model"]["name"]
VLLM_BASE_URL = config["model"]["base_url"]
TIMEOUT_SECONDS = config["model"]["timeout_seconds"]
CONTEXT_WINDOW = config["model"]["context_window"]


class LLMError(Exception):
    """Raised when the model is unreachable or returns unusable output."""


class LLMCutOff(LLMError):
    """The response hit max_tokens before the JSON was complete."""


def estimate_tokens(text: str) -> int:
    # Qwen's tokenizer averages a little under 4 characters per token on
    # English text; 3.5 keeps budgets conservative.
    return max(1, int(len(text) / 3.5))


async def chat_completion(
    messages: list[dict[str, Any]],
    *,
    max_tokens: int,
    temperature: float = 0.3,
    schema: dict | None = None,
    schema_name: str = "response",
) -> str:
    payload: dict[str, Any] = {
        "model": MODEL_NAME,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    if schema is not None:
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": schema_name,
                "schema": schema,
            },
        }

    started = time.monotonic()

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{VLLM_BASE_URL}/v1/chat/completions",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        raise LLMError(f"Model request failed: {exc}") from exc

    choice = data["choices"][0]
    usage = data.get("usage") or {}

    # Log sizes and timing only, never prompt or response content.
    logger.info(
        "llm %s prompt=%s completion=%s finish=%s %.1fs",
        schema_name,
        usage.get("prompt_tokens"),
        usage.get("completion_tokens"),
        choice.get("finish_reason"),
        time.monotonic() - started,
    )

    if choice.get("finish_reason") == "length" and schema is not None:
        raise LLMCutOff("The model response was cut off before it finished.")

    return choice["message"]["content"] or ""


async def chat_json(
    messages: list[dict[str, Any]],
    *,
    schema: dict,
    schema_name: str,
    max_tokens: int,
    temperature: float = 0.3,
) -> dict:
    try:
        content = await chat_completion(
            messages,
            max_tokens=max_tokens,
            temperature=temperature,
            schema=schema,
            schema_name=schema_name,
        )
    except LLMCutOff:
        # Sampling occasionally runs on; one cooler retry usually finishes.
        content = await chat_completion(
            messages,
            max_tokens=max_tokens,
            temperature=min(temperature, 0.2),
            schema=schema,
            schema_name=schema_name,
        )

    try:
        # strict=False: the model sometimes copies raw tabs or other control
        # characters from a document into a string, which strict JSON rejects.
        return json.loads(content, strict=False)
    except json.JSONDecodeError as exc:
        raise LLMError("The model returned invalid JSON.") from exc


def untrusted_block(tag: str, text: str) -> str:
    """
    Wrap retrieved or uploaded content so the model treats it as data.

    Any occurrence of the wrapper tag inside the content is neutralized so
    a document cannot close the block early and smuggle instructions.
    """

    cleaned = text.replace(f"<{tag}", f"<​{tag}").replace(
        f"</{tag}", f"<​/{tag}"
    )

    return f"<{tag}>\n{cleaned}\n</{tag}>"
