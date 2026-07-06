#!/usr/bin/env python3
"""Verify local readiness for NGC private-registry deployment."""
from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]

REQUIRED_FILES = [
    "nvidia/configs/ngc_deploy.yaml",
    "nvidia/Dockerfile.ngc",
    "nvidia/Dockerfile.ngc.dockerignore",
    "nvidia/ngc_app.py",
    "nvidia/integration/clawd_nim_bridge.py",
    "nvidia/integration/fal_inference.py",
    "nvidia/scripts/deploy_ngc.sh",
]

SECRET_PATTERNS = {
    "ngc_api_key": re.compile(r"\bnvapi-[A-Za-z0-9_-]{20,}\b"),
    "hf_token": re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"),
    "private_key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----"),
    "bearer_token": re.compile(r"\bBearer\s+[A-Za-z0-9._-]{24,}\b"),
}


def _image_ref() -> str:
    org = os.environ.get("NGC_ORG", "<ngc-org>")
    team = os.environ.get("NGC_TEAM", "").strip("/")
    image = os.environ.get("NGC_IMAGE_NAME", "clawd-nvidia-agent")
    tag = os.environ.get("NGC_IMAGE_TAG", "local")
    namespace = f"{org}/{team}" if team else org
    return f"nvcr.io/{namespace}/{image}:{tag}"


def _available_gb(path: Path) -> float:
    usage = shutil.disk_usage(path)
    return usage.free / (1024**3)


def _run_quiet(cmd: list[str], timeout: int = 10) -> tuple[bool, str]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=BASE_DIR,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            check=False,
        )
    except Exception as exc:  # pragma: no cover - environment dependent
        return False, str(exc)
    output = proc.stdout.strip()
    return proc.returncode == 0, output


def _scan_for_secrets(paths: list[Path]) -> list[str]:
    findings: list[str] = []
    for path in paths:
        text = path.read_text(encoding="utf-8", errors="ignore")
        for name, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                findings.append(f"{path.relative_to(BASE_DIR)} matched {name}")
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict", action="store_true", help="Require credentials and Docker for an immediate push.")
    parser.add_argument("--require-credentials", action="store_true", help="Require NGC_ORG and NGC_API_KEY.")
    parser.add_argument("--require-docker-daemon", action="store_true", help="Require Docker daemon health, not only Docker CLI presence.")
    parser.add_argument("--min-free-gb", type=float, default=10.0, help="Minimum host free disk GB needed for Docker build/push.")
    args = parser.parse_args()

    ok = True
    print("[ngc-files]")
    for rel in REQUIRED_FILES:
        path = BASE_DIR / rel
        if path.exists():
            print(f"OK   {rel}")
        else:
            ok = False
            print(f"FAIL {rel}: missing")

    print("[ngc-tools]")
    docker = shutil.which("docker")
    ngc = shutil.which("ngc")
    docker_required = args.strict or args.require_docker_daemon
    print(f"{'OK' if docker else ('FAIL' if docker_required else 'WARN')} docker: {docker or 'not found'}")
    print(f"{'OK' if ngc else 'WARN'} ngc: {ngc or 'not found; needed for org/team registry listing, not for docker push'}")
    if docker_required and not docker:
        ok = False

    print("[ngc-disk]")
    free_gb = _available_gb(BASE_DIR)
    disk_ok = free_gb >= args.min_free_gb
    disk_required = args.strict or args.require_docker_daemon
    print(f"{'OK' if disk_ok else ('FAIL' if disk_required else 'WARN')} host_free_gb: {free_gb:.2f} (min {args.min_free_gb:.2f})")
    if disk_required:
        ok = disk_ok and ok

    print("[ngc-docker-daemon]")
    if docker and (args.strict or args.require_docker_daemon):
        info_ok, info_output = _run_quiet(["docker", "info", "--format", "{{.ServerVersion}}"])
        print(f"{'OK' if info_ok else 'FAIL'} docker info: {info_output or 'no output'}")
        system_df_ok, system_df_output = _run_quiet(["docker", "system", "df"])
        print(f"{'OK' if system_df_ok else 'FAIL'} docker system df: {system_df_output.splitlines()[0] if system_df_output else 'no output'}")
        ok = info_ok and system_df_ok and ok
    elif docker:
        print("INFO docker daemon: skipped; pass --require-docker-daemon or --strict to validate build/push readiness")
    else:
        print("WARN docker daemon: skipped because docker CLI is unavailable")

    print("[ngc-env]")
    required_env = ["NGC_ORG", "NGC_API_KEY"]
    optional_env = ["NGC_TEAM", "NGC_IMAGE_NAME", "NGC_IMAGE_TAG", "NVIDIA_API_KEY"]
    credentials_required = args.strict or args.require_credentials
    for name in required_env:
        present = bool(os.environ.get(name))
        print(f"{'OK' if present else ('FAIL' if credentials_required else 'WARN')} {name}: {'set' if present else 'missing'}")
        if credentials_required and not present:
            ok = False
    for name in optional_env:
        print(f"INFO {name}: {'set' if os.environ.get(name) else 'unset'}")

    print("[ngc-image]")
    print(f"INFO target: {_image_ref()}")

    print("[ngc-secrets]")
    scan_paths = [BASE_DIR / rel for rel in REQUIRED_FILES if (BASE_DIR / rel).is_file()]
    findings = _scan_for_secrets(scan_paths)
    if findings:
        ok = False
        for finding in findings:
            print(f"FAIL {finding}")
    else:
        print("OK   no credential-like values found in NGC deploy files")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
