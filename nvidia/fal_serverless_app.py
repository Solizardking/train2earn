"""fal Serverless app for the Solana Clawd NVIDIA agent surface."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

try:
    import fal
except ImportError:  # pragma: no cover - lets local checks import without fal installed
    fal = None  # type: ignore[assignment]

try:
    from pydantic import BaseModel, Field
except ImportError:  # pragma: no cover
    BaseModel = object  # type: ignore[assignment,misc]
    Field = lambda default=None, **_: default  # type: ignore[assignment]


HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "integration"))

from clawd_nim_bridge import _resolve_endpoint, chat
from fal_inference import FAL_QUEUE_BASE


class ChatInput(BaseModel):
    prompt: str = Field(..., description="User prompt for the Clawd/NVIDIA agent.")
    system_prompt: str = Field(
        default=(
            "You are Clawd, a concise Solana-native agent. Return practical, "
            "paper-safe answers and never expose or request secrets."
        ),
        description="Optional system instruction.",
    )
    max_tokens: int = Field(default=512, ge=1, le=4096)
    temperature: float = Field(default=0.1, ge=0.0, le=2.0)
    system_prompt_id: str | None = Field(
        default=None,
        description="Optional local system prompt id, e.g. trading or nemo_clawd.",
    )


class ChatOutput(BaseModel):
    output: str
    provider: str
    model: str
    endpoint: str


def _fal_endpoint(path: str):
    if fal is None:
        def decorator(func):
            return func
        return decorator
    return fal.endpoint(path)


_FalBase = fal.App if fal is not None else object


class ClawdNvidiaFalApp(_FalBase):
    """Serverless Clawd/NVIDIA chat endpoint backed by FAL/NIM/HF routing."""

    @_fal_endpoint("/")
    def generate(self, input: ChatInput) -> ChatOutput:
        messages = [
            {"role": "system", "content": input.system_prompt},
            {"role": "user", "content": input.prompt},
        ]
        output = chat(
            messages,
            max_tokens=input.max_tokens,
            temperature=input.temperature,
            stream=False,
            system_prompt_id=input.system_prompt_id,
        )
        endpoint, _, model = _resolve_endpoint()
        return ChatOutput(
            output=str(output),
            provider=_provider_name(endpoint),
            model=model,
            endpoint=endpoint,
        )

    @_fal_endpoint("/health")
    def health(self) -> dict[str, Any]:
        endpoint, _, model = _resolve_endpoint()
        return {
            "ok": True,
            "app": "clawd-nvidia-agent",
            "provider": _provider_name(endpoint),
            "model": model,
            "has_fal_key": bool(os.environ.get("FAL_KEY") or os.environ.get("FAL_API_KEY")),
        }


def _provider_name(endpoint: str) -> str:
    if endpoint == FAL_QUEUE_BASE:
        return "fal"
    if "integrate.api.nvidia.com" in endpoint:
        return "nvidia-nim"
    if "api-inference.huggingface.co" in endpoint:
        return "hf-serverless"
    if "clawd-box-router" in endpoint:
        return "clawd-router"
    if "localhost:11434" in endpoint:
        return "ollama"
    return "custom"
