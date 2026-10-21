"""
Shared client for the locally served Qwen model (vLLM, OpenAI-compatible).

The deployed vLLM server has no tool-calling parser enabled, so every
structured interaction uses guided JSON decoding (response_format with a
JSON schema), which has been verified against this deployment.
"""

import json
import logging
import time
from collections.abc import AsyncIterator
from contextvars import ContextVar
from typing import Any

import httpx

from app.core.config import config


logger = logging.getLogger("cie.llm")

MODEL_NAME = config["model"]["name"]
VLLM_BASE_URL = config["model"]["base_url"]
TIMEOUT_SECONDS = config["model"]["timeout_seconds"]
CONTEXT_WINDOW = config["model"]["context_window"]

# Model calls made in the current request (sizes and timing only, never
# content). None outside a counselor turn; the turn timer sets a list.
llm_calls: ContextVar[list | None] = ContextVar("llm_calls", default=None)


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
    elapsed = time.monotonic() - started

    # Log sizes and timing only, never prompt or response content.
    logger.info(
        "llm %s prompt=%s completion=%s finish=%s %.1fs",
        schema_name,
        usage.get("prompt_tokens"),
        usage.get("completion_tokens"),
        choice.get("finish_reason"),
        elapsed,
    )

    calls = llm_calls.get()

    if calls is not None:
        calls.append(
            {
                "name": schema_name,
                "prompt_tokens": usage.get("prompt_tokens") or 0,
                "completion_tokens": usage.get("completion_tokens") or 0,
                "seconds": round(elapsed, 3),
            }
        )

    if choice.get("finish_reason") == "length" and schema is not None:
        raise LLMCutOff("The model response was cut off before it finished.")

    return choice["message"]["content"] or ""


async def chat_stream(
    messages: list[dict[str, Any]],
    *,
    max_tokens: int,
    temperature: float = 0.3,
    name: str = "stream",
) -> AsyncIterator[str]:
    """Yield the reply's text as vLLM generates it (plain text, no schema)."""

    payload: dict[str, Any] = {
        "model": MODEL_NAME,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
        "stream_options": {"include_usage": True},
    }

    started = time.monotonic()
    first_token = None
    usage: dict = {}
    finish = None

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            async with client.stream(
                "POST", f"{VLLM_BASE_URL}/v1/chat/completions", json=payload
            ) as response:
                response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line.startswith("data: ") or line == "data: [DONE]":
                        continue

                    chunk = json.loads(line[6:])

                    if chunk.get("usage"):
                        usage = chunk["usage"]

                    for choice in chunk.get("choices") or []:
                        finish = choice.get("finish_reason") or finish
                        text = (choice.get("delta") or {}).get("content")

                        if text:
                            if first_token is None:
                                first_token = time.monotonic() - started

                            yield text
    except httpx.HTTPError as exc:
        raise LLMError(f"Model request failed: {exc}") from exc

    elapsed = time.monotonic() - started

    logger.info(
        "llm %s prompt=%s completion=%s finish=%s ttft=%.2fs %.1fs",
        name,
        usage.get("prompt_tokens"),
        usage.get("completion_tokens"),
        finish,
        first_token or elapsed,
        elapsed,
    )

    calls = llm_calls.get()

    if calls is not None:
        calls.append(
            {
                "name": name,
                "prompt_tokens": usage.get("prompt_tokens") or 0,
                "completion_tokens": usage.get("completion_tokens") or 0,
                "seconds": round(elapsed, 3),
                "ttft": round(first_token or elapsed, 3),
            }
        )


# Health is checked often (every chat page load), so the answer is cached.
HEALTH_CACHE_SECONDS = 15
_health: dict = {"checked": 0.0, "ok": False}


async def model_healthy() -> bool:
    """True when vLLM answers its health check within 2 seconds."""

    now = time.monotonic()

    if now - _health["checked"] < HEALTH_CACHE_SECONDS:
        return _health["ok"]

    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{VLLM_BASE_URL}/health")
            ok = response.status_code == 200
    except httpx.HTTPError:
        ok = False

    _health.update(checked=now, ok=ok)
    return ok


async def warm_up(system_prompt: str) -> None:
    """
    One tiny request so the first student after a restart doesn't wait for
    vLLM to wake, sent with the fixed system prompt so its prefix is cached.
    """

    started = time.monotonic()

    try:
        await chat_completion(
            [{"role": "system", "content": system_prompt}, {"role": "user", "content": "hi"}],
            max_tokens=1,
            temperature=0,
            schema_name="warm_up",
        )
    except LLMError as exc:
        logger.warning("Model warm-up failed: %s", exc)
        return

    logger.info("Model warm-up done in %.1fs", time.monotonic() - started)


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
