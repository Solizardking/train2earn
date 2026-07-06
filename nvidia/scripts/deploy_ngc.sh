#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:-check}"

REGISTRY="${NGC_REGISTRY:-nvcr.io}"
ORG="${NGC_ORG:-}"
TEAM="${NGC_TEAM:-}"
IMAGE_NAME="${NGC_IMAGE_NAME:-clawd-nvidia-agent}"
IMAGE_TAG="${NGC_IMAGE_TAG:-local}"
DOCKERFILE="${NGC_DOCKERFILE:-nvidia/Dockerfile.ngc}"
BUILD_CONTEXT="${NGC_BUILD_CONTEXT:-nvidia}"
PLATFORM="${NGC_PLATFORM:-linux/amd64}"
BASE_IMAGE="${NGC_BASE_IMAGE:-python:3.12-slim}"

REF_ORG="${ORG:-<ngc-org>}"

if [[ -n "${TEAM}" ]]; then
  IMAGE_REF="${REGISTRY}/${REF_ORG}/${TEAM}/${IMAGE_NAME}:${IMAGE_TAG}"
else
  IMAGE_REF="${REGISTRY}/${REF_ORG}/${IMAGE_NAME}:${IMAGE_TAG}"
fi

usage() {
  cat <<'MSG'
Usage:
  nvidia/scripts/deploy_ngc.sh check
  nvidia/scripts/deploy_ngc.sh build
  nvidia/scripts/deploy_ngc.sh login
  nvidia/scripts/deploy_ngc.sh push
  nvidia/scripts/deploy_ngc.sh all

Required for login/push/all:
  NGC_ORG       NGC organization name
  NGC_API_KEY   NGC Personal or Service API key, kept in shell only

Optional:
  NGC_TEAM, NGC_IMAGE_NAME, NGC_IMAGE_TAG, NGC_BASE_IMAGE, NGC_PLATFORM
MSG
}

require_docker() {
  command -v docker >/dev/null 2>&1 || {
    echo "ERROR: docker is not installed or not on PATH." >&2
    exit 1
  }
}

require_org() {
  [[ -n "${ORG}" ]] || {
    echo "ERROR: set NGC_ORG before building/pushing an NGC image." >&2
    exit 1
  }
}

require_key() {
  [[ -n "${NGC_API_KEY:-}" ]] || {
    echo "ERROR: set NGC_API_KEY in the shell before logging in or pushing." >&2
    exit 1
  }
}

run_check() {
  python3 "${ROOT_DIR}/nvidia/scripts/verify_ngc_deploy.py"
  echo "[ngc] target image: ${IMAGE_REF}"
}

run_build() {
  python3 "${ROOT_DIR}/nvidia/scripts/verify_ngc_deploy.py" \
    --require-docker-daemon \
    --min-free-gb "${NGC_MIN_FREE_GB:-10}"
  require_docker
  require_org
  docker build \
    --platform "${PLATFORM}" \
    --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
    -f "${ROOT_DIR}/${DOCKERFILE}" \
    -t "${IMAGE_REF}" \
    "${ROOT_DIR}/${BUILD_CONTEXT}"
}

run_login() {
  python3 "${ROOT_DIR}/nvidia/scripts/verify_ngc_deploy.py" \
    --require-credentials \
    --min-free-gb "${NGC_MIN_FREE_GB:-1}"
  require_docker
  require_key
  printf '%s\n' "${NGC_API_KEY}" | docker login "${REGISTRY}" --username '$oauthtoken' --password-stdin
}

run_push() {
  python3 "${ROOT_DIR}/nvidia/scripts/verify_ngc_deploy.py" \
    --require-credentials \
    --require-docker-daemon \
    --min-free-gb "${NGC_MIN_FREE_GB:-10}"
  require_docker
  require_org
  docker push "${IMAGE_REF}"
}

case "${MODE}" in
  check)
    run_check
    ;;
  build)
    run_build
    ;;
  login)
    run_login
    ;;
  push)
    run_push
    ;;
  all)
    run_check
    run_build
    run_login
    run_push
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage
    echo "ERROR: unknown mode ${MODE}" >&2
    exit 2
    ;;
esac
