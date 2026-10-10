#!/usr/bin/env bash
# Okkey Core — one-command self-host installer (Docker Compose).
#
# Until this lands on `dev`, run from the feature branch:
#   OKKEY_REF=cursor/self-host-docker-2ea1 \
#     curl -fsSL "https://raw.githubusercontent.com/okkeyapp/okkey/${OKKEY_REF}/deploy/docker/install.sh" | bash
#
# After merge to `dev`:
#   curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/dev/deploy/docker/install.sh | bash
#
# From a checked-out tree:
#   ./deploy/docker/install.sh
set -euo pipefail

OKKEY_INSTALL_DIR="${OKKEY_INSTALL_DIR:-$HOME/okkey}"
# Alias: OKKEY_RAW_BASE → OKKEY_REPO_RAW_BASE (repo root on raw.githubusercontent.com, no trailing slash).
if [[ -n "${OKKEY_RAW_BASE:-}" ]]; then
  OKKEY_REPO_RAW_BASE="${OKKEY_RAW_BASE}"
fi
OKKEY_REPO_RAW_BASE="${OKKEY_REPO_RAW_BASE:-https://raw.githubusercontent.com/okkeyapp/okkey}"
# Git ref for raw file downloads (branch, tag, or commit SHA). Default `dev` after merge.
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

# When piped to bash (`curl … | bash`), BASH_SOURCE is unset — never expand [0] under `set -u`.
SCRIPT_DIR=""
if [[ ${BASH_SOURCE+x} ]] && [[ ${#BASH_SOURCE[@]} -gt 0 ]] && [[ -n "${BASH_SOURCE[0]}" ]] && [[ -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

# Refs to try for raw downloads. Primary is OKKEY_REF; until merge to `dev`,
# also try the PR branch so `curl …/cursor/…/install.sh | bash` works without env.
resolve_fetch_refs() {
  local -a refs=("${OKKEY_REF}")
  local candidate
  for candidate in cursor/self-host-docker-2ea1 dev; do
    if [[ "${candidate}" != "${OKKEY_REF}" ]]; then
      refs+=("${candidate}")
    fi
  done
  printf '%s\n' "${refs[@]}"
}

fetch_file() {
  local name="$1"
  local dest="$2"
  if [[ -n "${SCRIPT_DIR}" && -f "${SCRIPT_DIR}/${name}" ]]; then
    cp "${SCRIPT_DIR}/${name}" "${dest}"
    return
  fi
  need_cmd curl
  local ref url
  local -a tried=()
  while IFS= read -r ref; do
    [[ -z "${ref}" ]] && continue
    url="${OKKEY_REPO_RAW_BASE}/${ref}/deploy/docker/${name}"
    log "==> Fetching ${name} (ref=${ref})"
    if curl -fsSL "$url" -o "$dest" 2>/dev/null; then
      if [[ "${ref}" != "${OKKEY_REF}" ]]; then
        log "==> Using ref ${ref} for downloads (OKKEY_REF was ${OKKEY_REF})"
        OKKEY_REF="${ref}"
      fi
      return
    fi
    tried+=("${url}")
    rm -f "$dest"
  done < <(resolve_fetch_refs)
  die "failed to download deploy/docker/${name}
tried:
$(printf '  %s\n' "${tried[@]}")
hint: pipe env into bash, e.g.
  curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/cursor/self-host-docker-2ea1/deploy/docker/install.sh \\
    | OKKEY_REF=cursor/self-host-docker-2ea1 bash"
}

need_cmd docker
docker compose version >/dev/null 2>&1 || die "docker compose plugin is required"

mkdir -p "$OKKEY_INSTALL_DIR"
cd "$OKKEY_INSTALL_DIR"

log "==> Installing Okkey into ${OKKEY_INSTALL_DIR}"
log "==> Raw base: ${OKKEY_REPO_RAW_BASE}  ref: ${OKKEY_REF}"
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
# OKKEY_SKIP_PULL=1: use images already present locally (e.g. :local / pre-loaded tags).
if [[ "${OKKEY_SKIP_PULL:-}" == "1" ]]; then
  log "==> Skipping pull (OKKEY_SKIP_PULL=1)"
else
  docker compose -f "./${COMPOSE_FILE_NAME}" --env-file .env pull
fi
docker compose -f "./${COMPOSE_FILE_NAME}" --env-file .env up -d

web_port="$(grep -E '^WEB_PORT=' .env 2>/dev/null | cut -d= -f2- || true)"
api_port="$(grep -E '^API_PORT=' .env 2>/dev/null | cut -d= -f2- || true)"
web_port="${web_port:-8080}"
api_port="${api_port:-4000}"

log ""
log "Okkey is starting."
log "  Web UI:  http://localhost:${web_port}"
log "  API:     http://localhost:${api_port}/health"
log ""
log "Files: ${OKKEY_INSTALL_DIR}/${COMPOSE_FILE_NAME}  ${OKKEY_INSTALL_DIR}/.env"
log "Logs:  docker compose -f ${OKKEY_INSTALL_DIR}/${COMPOSE_FILE_NAME} logs -f"
log "Docs:  https://github.com/okkeyapp/okkey/blob/${OKKEY_REF}/deploy/docker/README.md"
