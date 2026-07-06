"""fal.ai inference helpers for the NVIDIA/Clawd routing layer.

The fal marketplace Nemotron endpoint is not OpenAI-compatible, so this module
adapts chat-style messages into the schema used by nvidia/nemotron-3-nano-omni.
"""
from __future__ import annotations

import json
import os
from typing import Any


FAL_QUEUE_BASE = "fal://queue"
FAL_MODEL_NEMOTRON_NANO = "nvidia/nemotron-3-nano-omni"


def get_fal_key() -> str:
    """Return the configured fal key without logging or persisting it."""
    return os.environ.get("FAL_API_KEY") or os.environ.get("FAL_KEY") or ""


def ensure_fal_key_env() -> str:
    """Normalize FAL_API_KEY into FAL_KEY for fal-client compatibility."""
    key = get_fal_key()
    if key and not os.environ.get("FAL_KEY"):
        os.environ["FAL_KEY"] = key
    return key


def resolve_fal_model(default: str = FAL_MODEL_NEMOTRON_NANO) -> str:
    """Return the fal model/app id to call."""
    return os.environ.get("FAL_MODEL_ID") or os.environ.get("FAL_MODEL") or default


def messages_to_fal_arguments(
    messages: list[dict[str, Any]],
    *,
    max_tokens: int = 512,
    temperature: float = 0.1,
    reasoning: bool = False,
    top_p: float | None = None,
) -> dict[str, Any]:
    """Convert OpenAI-style chat messages to fal's Nemotron input schema."""
    system_parts: list[str] = []
    turns: list[str] = []
    for message in messages:
        role = str(message.get("role") or "user").strip().lower()
        content = _content_to_text(message.get("content", ""))
        if not content:
            continue
        if role == "system":
            system_parts.append(content)
        else:
            turns.append(f"{role}: {content}")

    prompt = "\n\n".join(turns).strip()
    system_prompt = "\n\n".join(system_parts).strip()
    if not prompt:
        prompt = system_prompt or "Return ok."
        system_prompt = ""

    arguments: dict[str, Any] = {
        "prompt": prompt,
        "reasoning_mode": "think" if reasoning else "no_think",
        "max_tokens": int(max_tokens),
        "temperature": float(temperature),
        "top_p": float(top_p if top_p is not None else os.environ.get("FAL_TOP_P", "0.95")),
    }
    if system_prompt:
        arguments["system_prompt"] = system_prompt
    return arguments


def fal_chat_payload(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    max_tokens: int = 512,
    temperature: float = 0.1,
    reasoning: bool = False,
    client_timeout: int | float | None = None,
    with_logs: bool = False,
) -> dict[str, Any]:
    """Call fal and return a normalized payload with text plus raw response."""
    key = ensure_fal_key_env()
    if not key:
        raise EnvironmentError("FAL_API_KEY or FAL_KEY must be set to use fal inference")

    try:
        import fal_client
    except ImportError as exc:  # pragma: no cover - depends on optional package
        raise ImportError("fal-client is required for FAL_API_KEY routing; install fal-client") from exc

    application = model or resolve_fal_model()
    arguments = messages_to_fal_arguments(
        messages,
        max_tokens=max_tokens,
        temperature=temperature,
        reasoning=reasoning,
    )
    client = fal_client.SyncClient(key=key)
    result = client.subscribe(
        application,
        arguments=arguments,
        with_logs=with_logs,
        client_timeout=client_timeout,
    )
    return {
        "output": extract_fal_output(result),
        "model": application,
        "provider": "fal",
        "raw": result,
    }


def fal_chat(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    max_tokens: int = 512,
    temperature: float = 0.1,
    reasoning: bool = False,
    client_timeout: int | float | None = None,
) -> str:
    """Call fal and return only generated text."""
    payload = fal_chat_payload(
        messages,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        reasoning=reasoning,
        client_timeout=client_timeout,
    )
    return str(payload["output"])


def extract_fal_output(result: Any) -> str:
    """Extract text from fal response shapes used by model APIs and apps."""
    if isinstance(result, dict):
        for key in ("output", "text", "answer", "result"):
            value = result.get(key)
            if isinstance(value, str):
                return value
        data = result.get("data")
        if isinstance(data, dict):
            for key in ("output", "text", "answer", "result"):
                value = data.get(key)
                if isinstance(value, str):
                    return value
        if "choices" in result:
            try:
                return result["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError):
                pass
    if isinstance(result, str):
        return result
    return json.dumps(result, sort_keys=True)


def _content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if text:
                    parts.append(str(text))
            elif item is not None:
                parts.append(str(item))
        return "\n".join(parts).strip()
    if content is None:
        return ""
    return str(content).strip()
