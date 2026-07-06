#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_NAME="${FAL_APP_NAME:-clawd-nvidia-agent}"
MODE="${1:-deploy}"

if ! command -v fal >/dev/null 2>&1; then
  echo "ERROR: fal CLI not found. Install it, authenticate, then rerun this script." >&2
  echo "       See: https://fal.ai/docs/documentation/development/getting-started/installation" >&2
  exit 1
fi

if [[ -z "${FAL_KEY:-}" && -n "${FAL_API_KEY:-}" ]]; then
  export FAL_KEY="${FAL_API_KEY}"
fi

if [[ -z "${FAL_KEY:-}" ]]; then
  echo "ERROR: set FAL_API_KEY or FAL_KEY in the shell before deploying." >&2
  exit 1
fi

python3 "${ROOT_DIR}/nvidia/scripts/verify_fal_serverless.py" --deploy

cd "${ROOT_DIR}/nvidia"

fal deploy "${APP_NAME}" --check --yes

if [[ "${MODE}" == "check" ]]; then
  exit 0
fi

fal secrets set FAL_KEY="${FAL_KEY}"
fal deploy "${APP_NAME}"
