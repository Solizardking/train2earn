#!/usr/bin/env python3
"""Batch register all skills from this repo into the Google Cloud Skill Registry.

Usage:
  python3 scripts/register_all_skills.py --project x402-477302 --location us-central1
  python3 scripts/register_all_skills.py --project x402-477302 --location us-central1 --dry-run
  python3 scripts/register_all_skills.py  # uses GCP_PROJECT_ID and GCP_LOCATION env vars
"""

import argparse
import base64
import io
import json
import os
import sys
import urllib.error
import urllib.request
import zipfile

import google.auth
from google.auth.transport.requests import Request


def get_access_token():
    credentials, _ = google.auth.default()
    credentials.refresh(Request())
    return credentials.token


EXCLUDED_DIRS = {
    ".git",
    "node_modules",
    "target",     # Rust build artifacts
    ".surfpool",
    ".vercel",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    "venv",
    ".venv",
    # solana-clawd-agents over 10MB limit
    "public",
    "locales",
}

EXCLUDED_FILES = {
    ".DS_Store",
    "package-lock.json",
}

def zip_directory(directory_path):
    """Zip a directory into memory and return the bytes.

    Skips large build artifacts and hidden files to stay under the 10MB limit.
    """
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(directory_path):
            # Skip excluded and hidden directories
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS and not d.startswith(".")]
            for file in files:
                if file in EXCLUDED_FILES or file.startswith("."):
                    continue
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, directory_path)
                zf.write(file_path, arcname)
    return zip_buffer.getvalue()


def derive_skill_id(slug):
    """Derive a valid Skill Registry skill_id from a catalog slug.

    Constraints:
    - 1-63 characters
    - Start with a letter, end with a letter or number
    - Only lowercase letters, numbers, and hyphens
    """
    skill_id = slug.replace("/", "-").replace("_", "-").lower()
    if skill_id.startswith("gcp-"):
        skill_id = "x-" + skill_id
    if not skill_id[0].isalpha():
        skill_id = "s-" + skill_id
    # Truncate to 63 chars, ensuring it still ends with letter or number
    if len(skill_id) > 63:
        # Keep last 4 chars to preserve some identity, truncate middle
        max_len = 60 if not skill_id[-1].isalnum() else 63
        if len(skill_id) > max_len:
            # Take first part + hash suffix to keep unique
            import hashlib
            suffix = hashlib.md5(skill_id.encode()).hexdigest()[:8]
            truncated = skill_id[:max_len - len(suffix) - 1] + "-" + suffix
            skill_id = truncated
        # Ensure ends with letter or number
        if not skill_id[-1].isalnum():
            skill_id = skill_id[:-1] + "0"
    return skill_id


def call_api(url, payload, token, method="POST"):
    """Make an API call and return (success, status_code, response_text)."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")

    try:
        resp = urllib.request.urlopen(req)
        return (True, resp.status, resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return (False, e.code, e.read().decode("utf-8")[:300])
    except urllib.error.URLError as e:
        return (False, 0, str(e))


def main():
    parser = argparse.ArgumentParser(description="Batch register skills in Skill Registry")
    parser.add_argument("--project", default=os.environ.get("GCP_PROJECT_ID", ""))
    parser.add_argument("--location", default=os.environ.get("GCP_LOCATION", "us-central1"))
    parser.add_argument("--dry-run", action="store_true", help="Print what would be done without making API calls")
    parser.add_argument("--catalog", default="", help="Path to catalog.json (default: auto-detect)")
    args = parser.parse_args()

    project = args.project
    location = args.location
    dry_run = args.dry_run

    if not project:
        # Try to get from gcloud config
        import subprocess
        result = subprocess.run(
            ["gcloud", "config", "get-value", "project"],
            capture_output=True, text=True, check=False
        )
        project = result.stdout.strip() if result.returncode == 0 else ""

    if not project:
        print("ERROR: GCP_PROJECT_ID not set. Provide --project or set GCP_PROJECT_ID env var.")
        sys.exit(1)

    print("=" * 50)
    print("  Skill Registry Batch Upload")
    print(f"  Project:   {project}")
    print(f"  Location:  {location}")
    print(f"  Dry Run:   {dry_run}")
    print("=" * 50)
    print()

    # Determine catalog path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(script_dir, ".."))
    catalog_path = args.catalog or os.path.join(repo_root, "catalog.json")

    if not os.path.exists(catalog_path):
        print(f"ERROR: Catalog not found at {catalog_path}")
        sys.exit(1)

    with open(catalog_path) as f:
        catalog = json.load(f)

    print(f"Found {len(catalog)} skills in catalog.")
    print()

    # Get auth token
    if not dry_run:
        print("Getting authentication token...")
        token = get_access_token()
        print("Authentication OK.")
        print()

    endpoint = f"https://{location}-aiplatform.googleapis.com"
    total = len(catalog)
    success = 0
    skipped = 0
    failed = 0

    for idx, entry in enumerate(catalog, 1):
        slug = entry["slug"]
        name = entry["name"]
        desc = entry["description"]
        skill_id = derive_skill_id(slug)
        src_dir = os.path.join(repo_root, "skills", slug)

        print(f"[{idx}/{total}] {slug}")

        if not os.path.isdir(src_dir):
            print(f"  SKIP - source directory not found at {src_dir}")
            skipped += 1
            continue

        if not os.path.isfile(os.path.join(src_dir, "SKILL.md")):
            print(f"  SKIP - no SKILL.md found")
            skipped += 1
            continue

        if dry_run:
            print(f"  DRY-RUN: would upload as skill_id={skill_id}")
            success += 1
            continue

        # Zip the skill directory
        try:
            zip_bytes = zip_directory(src_dir)
        except Exception as e:
            print(f"  ERROR - failed to zip directory: {e}")
            failed += 1
            continue

        zipped_filesystem = base64.b64encode(zip_bytes).decode("utf-8")
        print(f"  zip size: {len(zip_bytes)} bytes")

        payload = {
            "displayName": name,
            "description": desc,
            "zippedFilesystem": zipped_filesystem,
        }

        # Try to create the skill
        create_url = (
            f"{endpoint}/v1beta1/projects/{project}/locations/{location}/skills"
            f"?skillId={skill_id}"
        )

        ok, status_code, response_text = call_api(create_url, payload, token, method="POST")

        if ok and status_code in (200, 201):
            print(f"  CREATED (HTTP {status_code})")
            success += 1
        elif not ok and status_code == 409:
            # Already exists - try update
            print("  Already exists, attempting update...")
            update_url = (
                f"{endpoint}/v1beta1/projects/{project}/locations/{location}/skills/{skill_id}"
                f"?updateMask=displayName,description,zippedFilesystem"
            )
            ok2, status_code2, response_text2 = call_api(update_url, payload, token, method="PATCH")

            if ok2 and status_code2 == 200:
                print(f"  UPDATED (HTTP {status_code2})")
                success += 1
            else:
                print(f"  UPDATE FAILED (HTTP {status_code2}): {response_text2}")
                failed += 1
        else:
            print(f"  FAILED (HTTP {status_code}): {response_text}")
            failed += 1

    print()
    print("=" * 50)
    print("  Summary")
    print(f"  Project:  {project}")
    print(f"  Location: {location}")
    print(f"  Total:    {total}")
    print(f"  Success:  {success}")
    print(f"  Skipped:  {skipped}")
    print(f"  Failed:   {failed}")
    print("=" * 50)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())