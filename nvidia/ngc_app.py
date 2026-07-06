"""HTTP entrypoint for the Clawd NVIDIA agent container.

The container is intended for NGC Private Registry, NVCF, DGX Cloud, or any
GPU-capable runtime that can run an HTTP service. It keeps model/provider
credentials in environment variables and reuses integration/clawd_nim_bridge.py.
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from integration.clawd_nim_bridge import _resolve_endpoint, chat
from integration.fal_inference import FAL_QUEUE_BASE


APP_NAME = "clawd-nvidia-agent"


class ChatRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    system_prompt: str = Field(
        default=(
            "You are Clawd, a concise Solana-native agent. Return practical, "
            "paper-safe answers and never expose or request secrets."
        )
    )
    max_tokens: int = Field(default=512, ge=1, le=4096)
    temperature: float = Field(default=0.1, ge=0.0, le=2.0)
    system_prompt_id: str | None = Field(default=None)


class ChatResponse(BaseModel):
    output: str
    provider: str
    model: str
    endpoint: str


app = FastAPI(
    title="Clawd NVIDIA Agent",
    version="0.1.0",
    description="NGC/NVIDIA deployable HTTP surface for the Clawd NVIDIA agent.",
)


@app.get("/health")
def health() -> dict[str, Any]:
    endpoint, _, model = _resolve_endpoint()
    return {
        "ok": True,
        "app": APP_NAME,
        "provider": _provider_name(endpoint),
        "model": model,
        "has_nvidia_key": bool(os.environ.get("NVIDIA_API_KEY")),
        "has_fal_key": bool(os.environ.get("FAL_API_KEY") or os.environ.get("FAL_KEY")),
    }


@app.post("/generate", response_model=ChatResponse)
def generate(request: ChatRequest) -> ChatResponse:
    messages = [
        {"role": "system", "content": request.system_prompt},
        {"role": "user", "content": request.prompt},
    ]
    output = chat(
        messages,
        max_tokens=request.max_tokens,
        temperature=request.temperature,
        stream=False,
        system_prompt_id=request.system_prompt_id,
    )
    endpoint, _, model = _resolve_endpoint()
    return ChatResponse(
        output=str(output),
        provider=_provider_name(endpoint),
        model=model,
        endpoint=endpoint,
    )


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


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("CLAWD_NGC_APP_HOST", "0.0.0.0")
    port = int(os.environ.get("CLAWD_NGC_APP_PORT", "8000"))
    uvicorn.run("ngc_app:app", host=host, port=port)
