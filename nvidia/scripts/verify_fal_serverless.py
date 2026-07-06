#!/usr/bin/env python3
"""Verify fal Serverless wiring without printing secrets."""
from __future__ import annotations

import argparse
import importlib.util
import os
import shutil
import sys
from pathlib import Path
from typing import Any

try:
    import tomllib
except ImportError:  # pragma: no cover
    tomllib = None  # type: ignore[assignment]


NVIDIA_DIR = Path(__file__).resolve().parents[1]
APP_NAME = "clawd-nvidia-agent"
FAL_MODEL = "nvidia/nemotron-3-nano-omni"


def _load_pyproject() -> dict[str, Any]:
    if tomllib is None:
        raise RuntimeError("Python 3.11+ tomllib is required to read pyproject.toml")
    path = NVIDIA_DIR / "pyproject.toml"
    with path.open("rb") as f:
        return tomllib.load(f)


def _has_module(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _has_fal_key() -> bool:
    return bool(os.environ.get("FAL_API_KEY") or os.environ.get("FAL_KEY"))


def check_source_contract() -> list[str]:
    errors: list[str] = []
    required = [
        NVIDIA_DIR / "fal_serverless_app.py",
        NVIDIA_DIR / "integration" / "fal_inference.py",
        NVIDIA_DIR / "integration" / "clawd_nim_bridge.py",
        NVIDIA_DIR / "scripts" / "deploy_fal_serverless.sh",
        NVIDIA_DIR / "scripts" / "fal_assets.py",
        NVIDIA_DIR / "pyproject.toml",
    ]
    for path in required:
        if not path.exists():
            errors.append(f"missing {path.relative_to(NVIDIA_DIR)}")

    try:
        data = _load_pyproject()
    except Exception as exc:
        errors.append(f"pyproject.toml unreadable: {exc}")
        return errors

    app = data.get("tool", {}).get("fal", {}).get("apps", {}).get(APP_NAME)
    if not isinstance(app, dict):
        errors.append(f"pyproject.toml missing tool.fal.apps.{APP_NAME}")
        return errors
    if app.get("ref") != "fal_serverless_app.py::ClawdNvidiaFalApp":
        errors.append(f"{APP_NAME}.ref must point at fal_serverless_app.py::ClawdNvidiaFalApp")
    if app.get("auth") != "private":
        errors.append(f"{APP_NAME}.auth must be private")
    if "FAL_KEY" not in app.get("secrets", []):
        errors.append(f"{APP_NAME}.secrets must include FAL_KEY")
    requirements = set(app.get("requirements", []))
    for dep in {"fal", "fal-client", "httpx>=0.27", "pydantic>=2"}:
        if dep not in requirements:
            errors.append(f"{APP_NAME}.requirements missing {dep}")
    app_files = set(app.get("app_files", []))
    if "integration" not in app_files:
        errors.append(f"{APP_NAME}.app_files must include integration")
    health = app.get("health_check", {})
    if health.get("path") != "/health":
        errors.append(f"{APP_NAME}.health_check.path must be /health")
    return errors


def check_routing_smoke() -> list[str]:
    errors: list[str] = []
    saved = {name: os.environ.get(name) for name in [
        "NVIDIA_API_KEY",
        "HF_TOKEN",
        "FAL_API_KEY",
        "FAL_KEY",
        "CLAWD_INFERENCE_URL",
        "CLAWD_ROUTER_KEY",
        "NVIDIA_MODEL",
        "FAL_MODEL_ID",
    ]}
    try:
        for name in saved:
            os.environ.pop(name, None)
        os.environ["FAL_API_KEY"] = "verify-only-placeholder"
        sys.path.insert(0, str(NVIDIA_DIR / "integration"))
        from clawd_nim_bridge import _resolve_endpoint  # type: ignore
        endpoint, _, model = _resolve_endpoint()
        if endpoint != "fal://queue":
            errors.append(f"FAL routing resolved {endpoint}, expected fal://queue")
        if model != FAL_MODEL:
            errors.append(f"FAL routing resolved {model}, expected {FAL_MODEL}")
    except Exception as exc:
        errors.append(f"FAL routing smoke failed: {exc}")
    finally:
        for name, value in saved.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy", action="store_true", help="Fail when CLI/key needed for deploy are missing")
    parser.add_argument("--local-runtime", action="store_true", help="Fail when local Python fal packages are missing")
    parser.add_argument("--strict", action="store_true", help="Require source, deploy, and local runtime readiness")
    args = parser.parse_args()

    errors = check_source_contract()
    errors.extend(check_routing_smoke())

    fal_cli = shutil.which("fal")
    has_key = _has_fal_key()
    has_fal_pkg = _has_module("fal")
    has_fal_client = _has_module("fal_client")

    print("[fal-serverless]")
    print(f"source_contract: {'ok' if not errors else 'fail'}")
    print(f"fal_cli: {'yes' if fal_cli else 'no'}")
    print(f"fal_key_env: {'yes' if has_key else 'no'}")
    print(f"python_package_fal: {'yes' if has_fal_pkg else 'no'}")
    print(f"python_package_fal_client: {'yes' if has_fal_client else 'no'}")
    print(f"app: {APP_NAME}")
    print(f"model: {FAL_MODEL}")

    if (args.deploy or args.strict) and not fal_cli:
        errors.append("fal CLI not found")
    if (args.deploy or args.strict) and not has_key:
        errors.append("FAL_API_KEY or FAL_KEY not set")
    if (args.local_runtime or args.strict) and not has_fal_pkg:
        errors.append("Python package fal not installed")
    if (args.local_runtime or args.strict) and not has_fal_client:
        errors.append("Python package fal-client not installed")

    if errors:
        for error in errors:
            print(f"FAIL {error}")
        return 1
    print("OK   fal Serverless contract verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
