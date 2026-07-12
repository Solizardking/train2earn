"""Production gate tests for model-kit API health and deploy defaults.

Drives the real FastAPI app and asserts health + monorepo defaults.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure backend package root is importable when pytest runs from repo root.
BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main  # noqa: E402


@pytest.fixture()
def client() -> TestClient:
    return TestClient(main.app)


def test_health_returns_ok_status(client: TestClient) -> None:
    """First health hit: explicit ok field and non-empty body."""
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body.get("ok") is True
    assert body.get("protocol")
    assert body.get("time")
    assert body.get("registry_api")


def test_health_consistent_on_second_request(client: TestClient) -> None:
    """Second consecutive health hit must still be healthy."""
    first = client.get("/api/health")
    second = client.get("/api/health")
    assert first.status_code == 200
    assert second.status_code == 200
    first_body = first.json()
    second_body = second.json()
    assert first_body.get("ok") is True
    assert second_body.get("ok") is True
    assert first_body.get("protocol") == second_body.get("protocol")
    assert first_body.get("registry_api") == second_body.get("registry_api")


def test_default_github_repo_is_train2earn() -> None:
    """Public default must point at Solizardking/train2earn, not a stale ai-training root."""
    assert "train2earn" in main.GITHUB_REPO
    assert "ai-training" not in main.GITHUB_REPO


def test_cloudbuild_contexts_match_repo_layout() -> None:
    """Cloud Build image contexts must match monorepo layout used in production."""
    cloudbuild = (REPO_ROOT / "cloudbuild.yaml").read_text(encoding="utf-8")
    assert re.search(r"(?m)^\s+- 'model-kit/backend'\s*$", cloudbuild)
    assert re.search(r"(?m)^\s+- 'site'\s*$", cloudbuild)
    assert "MODEL_KIT_GITHUB_REPO=https://github.com/Solizardking/train2earn" in cloudbuild
    assert "ai-training/model-kit" not in cloudbuild


def test_render_rootdir_is_monorepo_backend() -> None:
    """Render blueprint rootDir must be model-kit/backend under train2earn."""
    render = (REPO_ROOT / "model-kit" / "render.yaml").read_text(encoding="utf-8")
    assert "rootDir: model-kit/backend" in render
    assert "rootDir: ai-training/" not in render
    assert "MODEL_KIT_GITHUB_REPO" in render
    assert "Solizardking/train2earn" in render


def test_dockerignore_files_exclude_caches() -> None:
    """Ship contexts must ignore local caches and secrets."""
    backend_ignore = (BACKEND_DIR / ".dockerignore").read_text(encoding="utf-8")
    site_ignore = (REPO_ROOT / "site" / ".dockerignore").read_text(encoding="utf-8")
    for text in (backend_ignore, site_ignore):
        assert "__pycache__" in text or "node_modules" in text
        assert ".env" in text
    assert "__pycache__" in backend_ignore
    assert ".mypy_cache" in backend_ignore
    assert "wandb" in backend_ignore
    assert "node_modules" in site_ignore
    assert "dist" in site_ignore


def test_status_exposes_github_and_cli_paths(client: TestClient) -> None:
    response = client.get("/api/model-kit/status")
    assert response.status_code == 200
    body = response.json()
    assert body.get("ok") is True
    assert "train2earn" in body.get("github_repo", "")
    cli = body.get("one_shot", {}).get("cli", "")
    assert cli.startswith("model-kit/")
    assert "ai-training/" not in cli
