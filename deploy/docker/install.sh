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

# Compose project name = install directory basename (lowercased) → volume prefix
# e.g. ~/okkey → okkey_okkey-postgres, ~/okkey-qa-1 → okkey-qa-1_okkey-postgres.
# Must match every `docker compose` invocation via `-p` (compose file does not pin `name:`).
compose_project_name() {
  basename "$OKKEY_INSTALL_DIR" | tr '[:upper:]' '[:lower:]'
}

# All compose calls go through here so project name / volumes stay aligned with
# OKKEY_INSTALL_DIR even when the working directory or file path would differ.
run_compose() {
  local env_file="$1"
  shift
  docker compose -p "$(compose_project_name)" -f "./${COMPOSE_FILE_NAME}" --env-file "$env_file" "$@"
}

postgres_data_volume() {
  printf '%s_okkey-postgres\n' "$(compose_project_name)"
}

postgres_volume_exists() {
  docker volume inspect "$(postgres_data_volume)" >/dev/null 2>&1
}

reset_compose_volumes() {
  local env_file project
  project="$(compose_project_name)"
  log "==> OKKEY_RESET_VOLUMES=1 — removing Compose stack + volumes for ${project}"
  if [[ -f .env ]]; then
    env_file=".env"
  else
    env_file="./${ENV_EXAMPLE_NAME}"
  fi
  run_compose "$env_file" down -v >/dev/null 2>&1 || true
  # Belt-and-suspenders if project name / labels drifted.
  docker volume rm -f \
    "${project}_okkey-postgres" \
    "${project}_okkey-redis" \
    "${project}_okkey-minio" >/dev/null 2>&1 || true
}

# Postgres only applies POSTGRES_PASSWORD on first init. Reinstall that
# regenerates .env (or changes the password) while keeping the volume leaves
# api/worker failing with "password authentication failed" / "postgres query failed".
require_fresh_secrets_or_reset() {
  local vol
  vol="$(postgres_data_volume)"
  if ! postgres_volume_exists; then
    return 0
  fi
  if [[ "${OKKEY_RESET_VOLUMES:-}" == "1" ]]; then
    reset_compose_volumes
    return 0
  fi
  die "Postgres data volume already exists (${vol}), but this install would use a new POSTGRES_PASSWORD.
Postgres ignores POSTGRES_PASSWORD after the first init, so api fails with
  password authentication failed for user \"okkey\"
  (logged as \"postgres query failed\") and web/worker never start.

Fix — pick one:
  1) Wipe data and reinstall (destroys DB):
       OKKEY_RESET_VOLUMES=1 OKKEY_REF=${OKKEY_REF} bash deploy/docker/install.sh
     or: docker compose -p $(basename ${OKKEY_INSTALL_DIR} | tr '[:upper:]' '[:lower:]') -f ${OKKEY_INSTALL_DIR}/${COMPOSE_FILE_NAME} --env-file ${OKKEY_INSTALL_DIR}/.env down -v
         then re-run install
  2) Keep data: restore the original .env (same POSTGRES_PASSWORD) and re-run up -d
  3) Keep data + new password: ALTER USER inside postgres to match .env, then restart api"
}

# Resolve a service container id via compose (do not guess "<project>-<service>-1").
compose_service_cid() {
  local service="$1"
  run_compose .env ps -q "$service" 2>/dev/null | head -n1
}

wait_for_api_healthy() {
  local cid status i
  log "==> Waiting for api to become healthy (project=$(compose_project_name))"
  for i in $(seq 1 36); do
    cid="$(compose_service_cid api)"
    if [[ -n "$cid" ]]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
      if [[ "$status" == "healthy" ]]; then
        log "==> API healthy"
        return 0
      fi
      if [[ "$status" == "unhealthy" ]] || [[ "$status" == "exited" ]] || [[ "$status" == "restarting" && "$i" -ge 6 ]]; then
        break
      fi
    fi
    sleep 5
  done
  cid="$(compose_service_cid api)"
  log "error: API did not become healthy (last status: ${status:-unknown})"
  if [[ -n "$cid" ]]; then
    log "--- docker logs api (${cid}) (tail) ---"
    docker logs "$cid" 2>&1 | tail -40 || true
  else
    log "--- api container not found (docker compose ps) ---"
    run_compose .env ps || true
  fi
  local pg_cid
  pg_cid="$(compose_service_cid postgres)"
  if [[ -n "$pg_cid" ]] && docker logs "$pg_cid" 2>&1 | grep -q 'password authentication failed'; then
    log ""
    log "Detected Postgres password mismatch (volume from an earlier install)."
    log "See OKKEY_RESET_VOLUMES=1 / restore original .env in the installer error above."
  fi
  die "stack started but API is not healthy — web/worker depend on api health"
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
  # Refuse to mint a new POSTGRES_PASSWORD over an existing DB volume unless reset.
  require_fresh_secrets_or_reset
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
  if [[ "${OKKEY_RESET_VOLUMES:-}" == "1" ]]; then
    reset_compose_volumes
  fi
fi

log "==> Pulling images and starting stack (compose project=$(compose_project_name))"
# OKKEY_SKIP_PULL=1: use images already present locally (e.g. :local / pre-loaded tags).
if [[ "${OKKEY_SKIP_PULL:-}" == "1" ]]; then
  log "==> Skipping pull (OKKEY_SKIP_PULL=1)"
else
  run_compose .env pull
fi
run_compose .env up -d
wait_for_api_healthy

web_port="$(grep -E '^WEB_PORT=' .env 2>/dev/null | cut -d= -f2- || true)"
api_port="$(grep -E '^API_PORT=' .env 2>/dev/null | cut -d= -f2- || true)"
public_app_url="$(grep -E '^PUBLIC_APP_URL=' .env 2>/dev/null | cut -d= -f2- || true)"
web_port="${web_port:-8080}"
api_port="${api_port:-4000}"
if [[ -n "${public_app_url}" ]]; then
  web_url="${public_app_url}"
else
  web_url="http://localhost:${web_port}"
fi

print_okkey_banner() {
  cat <<'EOF'

 #######  ##    ## ##    ## ######## ##    ##
##     ## ##   ##  ##   ##  ##        ##  ##
##     ## ##  ##   ##  ##   ##         ####
##     ## #####    #####    ######      ##
##     ## ##  ##   ##  ##   ##          ##
##     ## ##   ##  ##   ##  ##          ##
 #######  ##    ## ##    ## ########    ##

EOF
}

print_okkey_banner
log "Install succeeded — Okkey is ready."
log ""
log "  Open:  ${web_url}"
log "  API:   http://localhost:${api_port}/health"
log ""
log "Files: ${OKKEY_INSTALL_DIR}/${COMPOSE_FILE_NAME}  ${OKKEY_INSTALL_DIR}/.env"
log "Logs:  docker compose -p $(compose_project_name) -f ${OKKEY_INSTALL_DIR}/${COMPOSE_FILE_NAME} --env-file ${OKKEY_INSTALL_DIR}/.env logs -f"
log "Docs:  https://github.com/okkeyapp/okkey/blob/${OKKEY_REF}/deploy/docker/README.md"
log ""
log "First-run: with an empty database, enter your email and create the first account"
log "without OTP (no SMTP needed). Later users use normal email verification."
