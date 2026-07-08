"""
Clawd ↔ NVIDIA NIM bridge.

Provides a unified OpenAI-compatible client that routes requests to:
  - NVIDIA NIM API (when NVIDIA_API_KEY is set)
  - fal Nemotron model API (when FAL_API_KEY or FAL_KEY is set)
  - Local Clawd endpoint (CLAWD_INFERENCE_URL)
  - ClawdRouter free tier (clawd_free_* key)
  - Local Ollama (fallback)

Used by signal-discovery, RAG pipeline, and AIQ evaluator.
"""

from __future__ import annotations

import json
import os
from typing import Iterator

try:
    from .fal_inference import FAL_QUEUE_BASE, fal_chat, resolve_fal_model
except ImportError:  # pragma: no cover - direct script execution path
    from fal_inference import FAL_QUEUE_BASE, fal_chat, resolve_fal_model


NIM_BASE = "https://integrate.api.nvidia.com/v1"
HF_BASE  = "https://api-inference.huggingface.co/v1"

MODEL_NIM_NANO  = "nvidia/nemotron-3-nano-30b-a3b"
MODEL_NIM_ULTRA = "nvidia/nemotron-3-ultra-550b-a55b"
MODEL_HF_ULTRA  = "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16"

SYSTEM_PROMPTS = {
    "trading": (
        "You are Clawd, a sovereign Solana-native AI agent specialized in Phoenix "
        "perpetuals. Analyze signals and recommend paper trades only. Never "
        "recommend live execution without explicit trust gate confirmation."
    ),
    "nemo_clawd": (
        "You are Nemo Clawd, a Solana-native agent runtime architect adapting "
        "NVIDIA NemoClaw concepts to the local Clawd Core AI tree. Produce "
        "sandboxed, paper-safe, secret-safe plans. Treat model outputs as plans, "
        "never transactions. Keep network policy explicit and default-deny."
    ),
}


def _load_env() -> None:
    """
    Best-effort .env loader for dev convenience.

    Walks upward from this file's directory to the filesystem root looking for a
    ``.env`` file, then checks ``~/.env`` and ``~/.env.master``. This is layout
    agnostic so it works in the source tree, inside the NGC container
    (``/app/nvidia/integration/``), and under arbitrary install paths. Runtime
    containers should inject secrets as real environment variables; this loader
    never overwrites variables that are already set.
    """
    from pathlib import Path

    candidates: list[Path] = []
    here = Path(__file__).resolve().parent
    for parent in [here, *here.parents]:
        candidates.append(parent / ".env")
    candidates.extend([Path.home() / ".env", Path.home() / ".env.master"])

    for p in candidates:
        try:
            if not p.is_file():
                continue
        except OSError:
            continue
        try:
            with p.open() as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, _, v = line.partition("=")
                        k = k.strip(); v = v.strip().strip('"').strip("'")
                        if k and k not in os.environ:
                            os.environ[k] = v
        except OSError:
            continue

_load_env()


def _resolve_endpoint() -> tuple[str, str, str]:
    """Returns (base_url, api_key, model). Priority: NIM > HF > fal > Clawd > Ollama."""
    override = os.environ.get("NVIDIA_MODEL", "")
    if key := os.environ.get("NVIDIA_API_KEY"):
        return NIM_BASE, key, override or MODEL_NIM_NANO
    if tok := os.environ.get("HF_TOKEN"):
        return HF_BASE, tok, override or MODEL_HF_ULTRA
    if key := (os.environ.get("FAL_API_KEY") or os.environ.get("FAL_KEY")):
        return FAL_QUEUE_BASE, key, os.environ.get("NVIDIA_MODEL") or resolve_fal_model()
    if url := os.environ.get("CLAWD_INFERENCE_URL"):
        return url, os.environ.get("CLAWD_API_KEY", "none"), "solana-clawd-1.5b"
    if key := os.environ.get("CLAWD_ROUTER_KEY"):
        return "https://clawd-box-router.fly.dev/v1", key, "solana-clawd-1.5b"
    return "http://localhost:11434/v1", "ollama", "solana-clawd-1.5b"


def chat(
    messages: list[dict],
    max_tokens: int = 512,
    temperature: float = 0.1,
    stream: bool = False,
    system_prompt_id: str | None = None,
) -> str | Iterator[str]:
    """Send a chat request through the best available endpoint."""
    base_url, api_key, model = _resolve_endpoint()

    try:
        import httpx
    except ImportError:
        raise ImportError("Run: pip install httpx")

    routed_messages = list(messages)
    if system_prompt_id and SYSTEM_PROMPTS.get(system_prompt_id):
        has_system = any(message.get("role") == "system" for message in routed_messages)
        if not has_system:
            routed_messages = [{"role": "system", "content": SYSTEM_PROMPTS[system_prompt_id]}] + routed_messages

    payload = {
        "model": model,
        "messages": routed_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": stream,
    }

    if base_url == FAL_QUEUE_BASE:
        text = fal_chat(
            routed_messages,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            reasoning=False,
        )
        if stream:
            return iter([text])
        return text

    if stream:
        return _stream(base_url, api_key, payload)

    r = httpx.post(
        f"{base_url}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _stream(base_url: str, api_key: str, payload: dict) -> Iterator[str]:
    import httpx
    with httpx.stream(
        "POST",
        f"{base_url}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}"},
        json=payload,
        timeout=120,
    ) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if line.startswith("data: ") and line != "data: [DONE]":
                try:
                    chunk = json.loads(line[6:])
                    delta = chunk["choices"][0].get("delta", {})
                    if text := delta.get("content"):
                        yield text
                except (json.JSONDecodeError, KeyError):
                    pass


def analyze_signal(market: str, signal_summary: str) -> str:
    """Ask the NIM model to analyze a signal and recommend an action."""
    base_url, _, _ = _resolve_endpoint()
    messages = [
        {
            "role": "system",
            "content": (
                "You are Clawd, a sovereign Solana-native AI agent specialized in Phoenix "
                "perpetuals. Analyze signals and recommend paper trades only. "
                "Never recommend live execution without explicit trust gate confirmation."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Market: {market}-PERP\n\n"
                f"Signal summary:\n{signal_summary}\n\n"
                "Should I enter a position? If yes, specify direction, notional USDC, "
                "and recommended Vulcan command. If no, explain why."
            ),
        },
    ]
    return chat(messages)


def analyze_nemo_clawd_blueprint(question: str, blueprint_summary: dict) -> str:
    """Ask the routed model to review a Nemo Clawd sandbox or lifecycle plan."""
    messages = [
        {
            "role": "user",
            "content": (
                "Review this Nemo Clawd blueprint summary for sandbox, network, "
                "inference, and release-gate risks. Return concise JSON with "
                "`risks`, `required_gates`, and `next_actions`.\n\n"
                f"Question: {question}\n\n"
                f"Blueprint summary:\n{json.dumps(blueprint_summary, indent=2, sort_keys=True)}"
            ),
        }
    ]
    return chat(messages, max_tokens=700, temperature=0.0, system_prompt_id="nemo_clawd")


if __name__ == "__main__":
    print(f"[bridge] endpoint: {_resolve_endpoint()[0]}")
    answer = analyze_signal("SOL", "RSI=28 (oversold), MACD bullish crossover, funding neutral")
    print(f"\n[bridge] answer:\n{answer}")
