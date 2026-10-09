#!/usr/bin/env bash
# Okkey Core — one-command self-host installer (Docker Compose).
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/dev/deploy/docker/install.sh | bash
# Or from a checked-out tree:
#   ./deploy/docker/install.sh
set -euo pipefail

OKKEY_INSTALL_DIR="${OKKEY_INSTALL_DIR:-$HOME/okkey}"
OKKEY_REPO_RAW_BASE="${OKKEY_REPO_RAW_BASE:-https://raw.githubusercontent.com/okkeyapp/okkey}"
OKKEY_REF="${OKKEY_REF:-dev}"
COMPOSE_FILE_NAME="docker-compose.prod.yml"
ENV_EXAMPLE_NAME=".env.example"

log() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

fetch_file() {
  local name="$1"
  local dest="$2"
  local url="${OKKEY_REPO_RAW_BASE}/${OKKEY_REF}/deploy/docker/${name}"
  if [[ -f "${SCRIPT_DIR}/${name}" ]]; then
    cp "${SCRIPT_DIR}/${name}" "${dest}"
    return
  fi
  need_cmd curl
  curl -fsSL "$url" -o "$dest"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"

need_cmd docker
docker compose version >/dev/null 2>&1 || die "docker compose plugin is required"

mkdir -p "$OKKEY_INSTALL_DIR"
cd "$OKKEY_INSTALL_DIR"

log "==> Installing Okkey into ${OKKEY_INSTALL_DIR}"
fetch_file "$COMPOSE_FILE_NAME" "./${COMPOSE_FILE_NAME}"
fetch_file "$ENV_EXAMPLE_NAME" "./${ENV_EXAMPLE_NAME}"

if [[ ! -f .env ]]; then
  cp "./${ENV_EXAMPLE_NAME}" .env
  JWT="$(gen_secret)"
  SESSION="$(gen_secret)"
  PG_PASS="$(gen_secret)"
  MINIO_PASS="$(gen_secret)"

  # Portable in-place sed (GNU/BSD)
  replace_env() {
    local key="$1"
    local value="$2"
    if sed --version >/dev/null 2>&1; then
      sed -i "s|^${key}=.*|${key}=${value}|" .env
    else
      sed -i '' "s|^${key}=.*|${key}=${value}|" .env
    fi
  }

  replace_env JWT_SECRET "$JWT"
  replace_env SESSION_SECRET "$SESSION"
  replace_env POSTGRES_PASSWORD "$PG_PASS"
  replace_env MINIO_ROOT_PASSWORD "$MINIO_PASS"
  log "==> Generated JWT_SECRET, SESSION_SECRET, POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD"
else
  log "==> Reusing existing .env"
fi

log "==> Pulling images and starting stack"
docker compose -f "./${COMPOSE_FILE_NAME}" --env-file .env pull
docker compose -f "./${COMPOSE_FILE_NAME}" --env-file .env up -d

log ""
log "Okkey is starting."
log "  Web UI:  http://localhost:$(grep -E '^WEB_PORT=' .env | cut -d= -f2- || echo 8080)"
log "  API:     http://localhost:$(grep -E '^API_PORT=' .env | cut -d= -f2- || echo 4000)/health"
log ""
log "Files: ${OKKEY_INSTALL_DIR}/${COMPOSE_FILE_NAME}  ${OKKEY_INSTALL_DIR}/.env"
log "Logs:  docker compose -f ${OKKEY_INSTALL_DIR}/${COMPOSE_FILE_NAME} logs -f"
log "Docs:  https://github.com/okkeyapp/okkey/blob/${OKKEY_REF}/deploy/docker/README.md"
