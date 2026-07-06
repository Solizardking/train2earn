#!/usr/bin/env python3
"""Build and optionally upload a sanitized FAL asset manifest."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


NVIDIA_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = NVIDIA_DIR.parent
DEFAULT_OUTPUT = NVIDIA_DIR / "outputs" / "fal_asset_manifest.json"
DEFAULT_UPLOAD_OUTPUT = NVIDIA_DIR / "outputs" / "fal_asset_upload.json"
FAL_MODEL = "nvidia/nemotron-3-nano-omni"
FAL_APP = "clawd-nvidia-agent"

ARTIFACT_PATHS = [
    "README.md",
    "NEMOTRON_ULTRA_AGENT.md",
    "LOCAL_MAC_STACK.md",
    "pyproject.toml",
    "fal_serverless_app.py",
    "configs/aiq_config.yaml",
    "configs/nemo_clawd_factory.yaml",
    "configs/nim_config.yaml",
    "configs/pretrain_financial_decoder.yaml",
    "configs/pretrain_solana_decoder.yaml",
    "configs/solana_tx_foundation.yaml",
    "integration/fal_inference.py",
    "integration/clawd_nim_bridge.py",
    "integration/nemo_clawd.py",
    "scripts/deploy_fal_serverless.sh",
    "scripts/verify_fal_serverless.py",
]

SECRET_PATTERNS = {
    "fal_key": re.compile(r"\b[0-9a-f]{8}-[0-9a-f-]{27,}:[A-Za-z0-9_-]{20,}\b", re.IGNORECASE),
    "nvidia_api_key": re.compile(r"\bnvapi-[A-Za-z0-9_-]{20,}\b"),
    "hf_token": re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"),
    "private_key": re.compile("-----" + "BEGIN " + r"(?:RSA |EC |OPENSSH |)?" + "PRIVATE " + "KEY-----"),
    "wandb_key": re.compile(r"\bwandb_v1_[A-Za-z0-9_-]{20,}\b"),
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def scan_secret_text(text: str) -> list[str]:
    return [name for name, pattern in SECRET_PATTERNS.items() if pattern.search(text)]


def scan_secret_file(path: Path) -> list[str]:
    return scan_secret_text(path.read_text(encoding="utf-8", errors="ignore"))


def artifact_kind(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".yaml", ".yml", ".toml", ".json"}:
        return "config"
    if suffix in {".py", ".sh"}:
        return "deploy-code"
    if suffix == ".md":
        return "docs"
    return "artifact"


def extract_model_ids() -> list[str]:
    candidates: set[str] = {FAL_MODEL}
    provider_prefixes = "nvidia|solanaclawd|ordlibrary|NousResearch|Qwen|meta|fal-ai"
    model_pattern = re.compile(rf"(?<![A-Za-z0-9_.-])((?:{provider_prefixes})/[A-Za-z0-9_.:-]+)")
    for rel in ("README.md", "configs/nim_config.yaml", "configs/solana_tx_foundation.yaml"):
        path = NVIDIA_DIR / rel
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for match in model_pattern.findall(text):
            model_id = match.rstrip(".,;:)`")
            if model_id.startswith("nvidia/"):
                suffix = model_id.split("/", 1)[1]
                if not suffix.startswith(("NVIDIA-Nemotron", "nemotron-", "nv-")):
                    continue
            candidates.add(model_id)
    return sorted(candidates)


def build_manifest() -> dict[str, Any]:
    artifacts: list[dict[str, Any]] = []
    missing: list[str] = []
    secret_findings: list[dict[str, Any]] = []

    for rel in ARTIFACT_PATHS:
        path = NVIDIA_DIR / rel
        if not path.exists():
            missing.append(rel)
            continue
        hits = scan_secret_file(path)
        if hits:
            secret_findings.append({"path": f"nvidia/{rel}", "patterns": hits})
        artifacts.append({
            "path": f"nvidia/{rel}",
            "kind": artifact_kind(path),
            "size_bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        })

    return {
        "schema": "solana-clawd.nvidia.fal-assets.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": ROOT_DIR.as_posix(),
        "fal": {
            "model_api": FAL_MODEL,
            "serverless_app": FAL_APP,
            "key_env": ["FAL_API_KEY", "FAL_KEY"],
            "cdn_upload_public": True,
        },
        "model_ids": extract_model_ids(),
        "artifacts": artifacts,
        "missing": missing,
        "secret_findings": secret_findings,
    }


def write_manifest(path: Path) -> dict[str, Any]:
    manifest = build_manifest()
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    hits = scan_secret_text(text)
    if hits:
        raise RuntimeError(f"manifest contains secret-like patterns: {hits}")
    path.write_text(text, encoding="utf-8")
    return manifest


def upload_manifest(path: Path) -> str:
    key = os.environ.get("FAL_KEY") or os.environ.get("FAL_API_KEY")
    if not key:
        raise EnvironmentError("FAL_API_KEY or FAL_KEY must be set to upload FAL assets")
    if not os.environ.get("FAL_KEY"):
        os.environ["FAL_KEY"] = key
    try:
        import fal_client
    except ImportError as exc:
        raise ImportError("fal-client is required; install with: python3 -m pip install --user fal-client") from exc
    return str(fal_client.upload_file(path.as_posix()))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=DEFAULT_OUTPUT.as_posix(), help="Manifest JSON path")
    parser.add_argument("--upload", action="store_true", help="Upload the sanitized manifest to FAL CDN")
    parser.add_argument("--upload-output", default=DEFAULT_UPLOAD_OUTPUT.as_posix(), help="Upload receipt JSON path")
    args = parser.parse_args()

    output = Path(args.output)
    manifest = write_manifest(output)
    if manifest["missing"]:
        print(f"[fal-assets] WARN missing artifacts: {manifest['missing']}", file=sys.stderr)
    if manifest["secret_findings"]:
        print(f"[fal-assets] FAIL secret-like patterns: {manifest['secret_findings']}", file=sys.stderr)
        return 1

    print(f"[fal-assets] wrote {output}")
    print(f"[fal-assets] artifacts={len(manifest['artifacts'])} models={len(manifest['model_ids'])}")

    if args.upload:
        url = upload_manifest(output)
        receipt = {
            "schema": "solana-clawd.nvidia.fal-assets-upload.v1",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "manifest_path": output.as_posix(),
            "manifest_sha256": sha256_file(output),
            "url": url,
            "public": True,
        }
        upload_output = Path(args.upload_output)
        upload_output.parent.mkdir(parents=True, exist_ok=True)
        upload_output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"[fal-assets] uploaded manifest: {url}")
        print(f"[fal-assets] wrote {upload_output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
