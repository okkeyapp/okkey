#!/usr/bin/env bash
# Okkey Core — one-command self-host installer (Docker Compose).
#
# Tracking / QA (default image tag `dev`):
#   curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/dev/deploy/docker/install.sh | bash
#
# Production — pin a SemVer image (never `:latest`):
#   curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/dev/deploy/docker/install.sh \
#     | OKKEY_IMAGE_TAG=1.0.0-beta.2 bash
#
# Env must be on the right of `|` so bash sees it (`VAR=x curl | bash` does not).
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
# Git ref for raw file downloads (branch, tag, or commit SHA). Default `dev`.
# Not the same as OKKEY_IMAGE_TAG (GHCR container tag; see .env.example).
OKKEY_REF="${OKKEY_REF:-dev}"
# Historical production pin name (first planned SemVer). Not published in GHCR yet —
# OKKEY_CHANNEL=prod is refused until a SemVer exists (or OKKEY_PROD_CHANNEL_FORCE=1).
# Used only when OKKEY_CHANNEL=prod is forced and OKKEY_IMAGE_TAG is unset. Never `:latest`.
OKKEY_PROD_IMAGE_TAG="${OKKEY_PROD_IMAGE_TAG:-1.0.0-beta.2}"
COMPOSE_FILE_NAME="docker-compose.prod.yml"
ENV_EXAMPLE_NAME=".env.example"

log() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Read KEY=value from the install-dir .env (no export). Empty if missing.
env_file_value() {
  local key="$1"
  grep -E "^${key}=" .env 2>/dev/null | cut -d= -f2- || true
}

# Rewrite KEY=value in ./.env without sed (sed treats `&` `\` in the replacement).
# Safe for RFC-valid emails and other values with metacharacters.
replace_env() {
  local key="$1"
  local value="$2"
  local tmp
  if [[ -f .env ]] && grep -Eq "^${key}=" .env 2>/dev/null; then
    tmp="$(mktemp "${TMPDIR:-/tmp}/okkey-env.XXXXXX")"
    # Preserve final newline behavior; rewrite matching KEY= lines only.
    while IFS= read -r line || [[ -n "${line}" ]]; do
      if [[ "${line}" == "${key}="* ]]; then
        printf '%s=%s\n' "${key}" "${value}"
      else
        printf '%s\n' "${line}"
      fi
    done < .env > "${tmp}"
    mv "${tmp}" .env
  else
    printf '%s=%s\n' "${key}" "${value}" >> .env
  fi
}

# True when /dev/tty can actually be opened (controlling tty present).
# `-r/-w /dev/tty` can pass in CI/cloud-init/setsid without a usable ctty.
tty_usable() {
  { : </dev/tty; } 2>/dev/null
}

# Loose email check: must contain one @ and a dot in the domain; no spaces.
is_valid_sales_email() {
  local email="$1"
  [[ -n "${email}" ]] || return 1
  [[ "${email}" != *[[:space:]]* ]] || return 1
  [[ "${email}" == *@*.* ]] || return 1
  [[ "${email}" != *@*@* ]] || return 1
  [[ "${#email}" -le 320 ]] || return 1
  return 0
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

# Cosign keyless OIDC identity for Core publish workflow
# (.github/workflows/publish-images.yml on okkeyapp/okkey).
OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP="${OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP:-https://github.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(heads/dev|tags/v.+)}"
OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER="${OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER:-https://token.actions.githubusercontent.com}"

# Resolve image ref used by compose for a service (env override → default GHCR).
compose_image_ref() {
  local env_key="$1"
  local default_image="$2"
  local tag="$3"
  local image
  image="$(env_file_value "${env_key}")"
  image="${image:-${default_image}}"
  printf '%s:%s\n' "${image}" "${tag}"
}

# Resolve a pulled image to a registry digest ref (name@sha256:…).
image_digest_ref() {
  local ref="$1"
  local digest_line digest
  digest_line="$(docker image inspect --format '{{index .RepoDigests 0}}' "${ref}" 2>/dev/null || true)"
  if [[ -z "${digest_line}" || "${digest_line}" == "<no value>" ]]; then
    die "cannot resolve digest for ${ref} after pull (RepoDigests empty).
hint: re-pull from GHCR, or set OKKEY_SKIP_COSIGN_VERIFY=1 only for local/unsigned images."
  fi
  # RepoDigests is already name@sha256:…
  if [[ "${digest_line}" == *@sha256:* ]]; then
    printf '%s\n' "${digest_line}"
    return 0
  fi
  digest="$(docker image inspect --format '{{.Id}}' "${ref}" 2>/dev/null || true)"
  die "unexpected RepoDigests format for ${ref}: ${digest_line} (id=${digest})"
}

# Verify cosign keyless signatures for api/web/worker before compose up.
# Skip only with an explicit flag (default: verify on). Local/preloaded
# installs that skip pull also skip verify unless OKKEY_FORCE_COSIGN_VERIFY=1.
verify_pulled_image_signatures() {
  local tag="$1"
  local skip_pull="${2:-0}"

  if [[ "${OKKEY_SKIP_COSIGN_VERIFY:-}" == "1" ]]; then
    log "==> WARNING: skipping image signature verify (OKKEY_SKIP_COSIGN_VERIFY=1)"
    return 0
  fi
  if [[ "${skip_pull}" == "1" && "${OKKEY_FORCE_COSIGN_VERIFY:-}" != "1" ]]; then
    log "==> WARNING: skipping image signature verify (OKKEY_SKIP_PULL=1; set OKKEY_FORCE_COSIGN_VERIFY=1 to require cosign)"
    return 0
  fi

  need_cmd cosign
  need_cmd docker

  local refs=()
  refs+=("$(compose_image_ref OKKEY_API_IMAGE ghcr.io/okkeyapp/api "${tag}")")
  refs+=("$(compose_image_ref OKKEY_WORKER_IMAGE ghcr.io/okkeyapp/worker "${tag}")")
  refs+=("$(compose_image_ref OKKEY_WEB_IMAGE ghcr.io/okkeyapp/web "${tag}")")

  local ref digest_ref
  for ref in "${refs[@]}"; do
    digest_ref="$(image_digest_ref "${ref}")"
    log "==> Verifying cosign signature: ${digest_ref}"
    if ! cosign verify \
      --certificate-identity-regexp "${OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP}" \
      --certificate-oidc-issuer "${OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER}" \
      "${digest_ref}"; then
      die "cosign verify failed for ${digest_ref}.
hint: Core images must be signed keyless by .github/workflows/publish-images.yml.
  Install cosign (https://docs.sigstore.dev/cosign/system_config/installation/).
  Emergency bypass only: OKKEY_SKIP_COSIGN_VERIFY=1 (prints a warning; not for prod)."
    fi
  done
  log "==> Image signatures OK (api, worker, web)"
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

# Resolve effective GHCR tag for a fresh install.
# Precedence: OKKEY_IMAGE_TAG env → OKKEY_CHANNEL=prod pin → .env.example default (`1.0.0-beta.2`).
resolve_image_tag_for_fresh_install() {
  if [[ -n "${OKKEY_IMAGE_TAG:-}" ]]; then
    printf '%s\n' "${OKKEY_IMAGE_TAG}"
    return
  fi
  case "${OKKEY_CHANNEL:-}" in
    prod|production)
      # Guard: refuse OKKEY_CHANNEL=prod until SemVer exists in GHCR.
      # .env.example already pins 1.0.0-beta.2 (never :latest); tag publishes with v1.0.0-beta.2.
      if [[ "${OKKEY_PROD_CHANNEL_FORCE:-}" != "1" ]]; then
        die "OKKEY_CHANNEL=prod is not available yet: no SemVer image tag in GHCR (only :dev).
Use tracking images:
  OKKEY_IMAGE_TAG=dev
Or pin the prod SemVer when published:
  OKKEY_IMAGE_TAG=1.0.0-beta.2
To force the pin ${OKKEY_PROD_IMAGE_TAG} anyway (pull will fail if missing):
  OKKEY_PROD_CHANNEL_FORCE=1 OKKEY_CHANNEL=prod"
      fi
      printf '%s\n' "${OKKEY_PROD_IMAGE_TAG}"
      ;;
    *)
      # Leave empty → keep .env.example value (1.0.0-beta.2).
      printf '\n'
      ;;
  esac
}

# When piped to bash (`curl … | bash`), BASH_SOURCE is unset — never expand [0] under `set -u`.
SCRIPT_DIR=""
if [[ ${BASH_SOURCE+x} ]] && [[ ${#BASH_SOURCE[@]} -gt 0 ]] && [[ -n "${BASH_SOURCE[0]}" ]] && [[ -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

fetch_file() {
  local name="$1"
  local dest="$2"
  if [[ -n "${SCRIPT_DIR}" && -f "${SCRIPT_DIR}/${name}" ]]; then
    cp "${SCRIPT_DIR}/${name}" "${dest}"
    return
  fi
  need_cmd curl
  local url="${OKKEY_REPO_RAW_BASE}/${OKKEY_REF}/deploy/docker/${name}"
  log "==> Fetching ${name} (ref=${OKKEY_REF})"
  if curl -fsSL "$url" -o "$dest" 2>/dev/null; then
    return
  fi
  rm -f "$dest"
  die "failed to download deploy/docker/${name}
tried:
  ${url}
hint: set OKKEY_REF on the right of \`|\` so bash sees it, e.g.
  curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/dev/deploy/docker/install.sh \\
    | OKKEY_REF=dev bash"
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
  EMAIL_DEAD_SEAL="$(gen_secret)"
  PG_PASS="$(gen_secret)"
  MINIO_PASS="$(gen_secret)"

  replace_env JWT_SECRET "$JWT"
  replace_env SESSION_SECRET "$SESSION"
  replace_env EMAIL_DEAD_LETTER_SEAL_KEY "$EMAIL_DEAD_SEAL"
  replace_env POSTGRES_PASSWORD "$PG_PASS"
  replace_env MINIO_ROOT_PASSWORD "$MINIO_PASS"

  resolved_tag="$(resolve_image_tag_for_fresh_install)"
  if [[ -n "${resolved_tag}" ]]; then
    replace_env OKKEY_IMAGE_TAG "${resolved_tag}"
    log "==> OKKEY_IMAGE_TAG=${resolved_tag}"
  fi

  # Persist installer-provided ports / public URLs into .env (enterprise#38 / #56).
  # Process env wins; when only WEB_PORT / API_PORT are set, derive matching URL defaults
  # so config.js and a later `compose --env-file .env` stay consistent.
  if [[ -n "${WEB_PORT:-}" ]]; then
    replace_env WEB_PORT "${WEB_PORT}"
  fi
  if [[ -n "${API_PORT:-}" ]]; then
    replace_env API_PORT "${API_PORT}"
  fi

  if [[ -n "${PUBLIC_APP_URL:-}" ]]; then
    replace_env PUBLIC_APP_URL "${PUBLIC_APP_URL}"
  elif [[ -n "${WEB_PORT:-}" ]]; then
    replace_env PUBLIC_APP_URL "http://localhost:${WEB_PORT}"
  fi

  if [[ -n "${OKKEY_API_PUBLIC_URL:-}" ]]; then
    replace_env OKKEY_API_PUBLIC_URL "${OKKEY_API_PUBLIC_URL}"
  elif [[ -n "${API_PORT:-}" ]]; then
    replace_env OKKEY_API_PUBLIC_URL "http://localhost:${API_PORT}"
  fi

  if [[ -n "${CORS_ORIGIN:-}" ]]; then
    replace_env CORS_ORIGIN "${CORS_ORIGIN}"
  elif [[ -n "${WEB_PORT:-}" ]]; then
    replace_env CORS_ORIGIN "http://localhost:${WEB_PORT}"
  fi

  if [[ -n "${WEBAUTHN_ORIGINS:-}" ]]; then
    replace_env WEBAUTHN_ORIGINS "${WEBAUTHN_ORIGINS}"
  elif [[ -n "${WEB_PORT:-}" ]]; then
    replace_env WEBAUTHN_ORIGINS "http://localhost:${WEB_PORT}"
  fi

  if [[ -n "${WEBAUTHN_RP_ID:-}" ]]; then
    replace_env WEBAUTHN_RP_ID "${WEBAUTHN_RP_ID}"
  fi
  if [[ -n "${WEBAUTHN_RP_NAME:-}" ]]; then
    replace_env WEBAUTHN_RP_NAME "${WEBAUTHN_RP_NAME}"
  fi

  if [[ -n "${WEB_PORT:-}" || -n "${API_PORT:-}" || -n "${PUBLIC_APP_URL:-}" || -n "${OKKEY_API_PUBLIC_URL:-}" ]]; then
    log "==> Wrote custom ports/URLs into .env (WEB_PORT=${WEB_PORT:-}, API_PORT=${API_PORT:-})"
  fi

  log "==> Generated JWT_SECRET, SESSION_SECRET, EMAIL_DEAD_LETTER_SEAL_KEY, POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD"
else
  log "==> Reusing existing .env"
  if [[ -n "${OKKEY_IMAGE_TAG:-}" ]] || [[ -n "${OKKEY_CHANNEL:-}" ]]; then
    log "==> Note: OKKEY_IMAGE_TAG / OKKEY_CHANNEL set but .env already exists — edit OKKEY_IMAGE_TAG in .env or remove .env to apply"
  fi
  if [[ "${OKKEY_RESET_VOLUMES:-}" == "1" ]]; then
    reset_compose_volumes
  fi
fi

# api + worker require OKKEY_SALES_EMAIL (no default). Prefer process env, then .env,
# then interactive prompt; never invent a placeholder address.
sales_email="${OKKEY_SALES_EMAIL:-}"
if [[ -z "${sales_email}" ]]; then
  sales_email="$(env_file_value OKKEY_SALES_EMAIL)"
fi
if [[ -n "${sales_email}" ]] && ! is_valid_sales_email "${sales_email}"; then
  die "OKKEY_SALES_EMAIL is invalid: ${sales_email}
Set a real inbox address (must contain @ and a domain)."
fi
if [[ -z "${sales_email}" ]]; then
  # `curl … | bash` makes stdin a pipe (not a TTY). Prefer a usable /dev/tty when a
  # controlling terminal is attached; hard-fail with a clear hint when there is none
  # (CI, cloud-init, setsid, ssh without -t). Do not start/rewrite compose until set.
  prompt_tty=""
  if tty_usable; then
    prompt_tty="/dev/tty"
  elif [[ -t 0 ]]; then
    prompt_tty=""
  else
    die "OKKEY_SALES_EMAIL is required (non-interactive install).
Pass it on the right of \`|\` or set it in ${OKKEY_INSTALL_DIR}/.env before re-running, e.g.
  curl -fsSL …/install.sh | OKKEY_SALES_EMAIL=sales@your-company.example bash
There is no built-in default address."
  fi
  log "==> OKKEY_SALES_EMAIL is required (license / plan-change request recipient; no default)."
  while true; do
    if [[ -n "${prompt_tty}" ]]; then
      printf 'OKKEY_SALES_EMAIL: ' >"${prompt_tty}"
      # shellcheck disable=SC2162
      read -r sales_email <"${prompt_tty}" || true
    else
      printf 'OKKEY_SALES_EMAIL: ' >&2
      read -r sales_email || true
    fi
    sales_email="$(printf '%s' "${sales_email}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if is_valid_sales_email "${sales_email}"; then
      break
    fi
    if [[ -n "${prompt_tty}" ]]; then
      printf '%s\n' "error: enter a valid email address (example: sales@your-company.example)" >"${prompt_tty}"
    else
      log "error: enter a valid email address (example: sales@your-company.example)" >&2
    fi
  done
fi
replace_env OKKEY_SALES_EMAIL "${sales_email}"
log "==> OKKEY_SALES_EMAIL=${sales_email}"

image_tag="$(env_file_value OKKEY_IMAGE_TAG)"
image_tag="${image_tag:-dev}"
log "==> Pulling images and starting stack (compose project=$(compose_project_name), OKKEY_IMAGE_TAG=${image_tag})"
# OKKEY_SKIP_PULL=1: use images already present locally (e.g. :local / pre-loaded tags).
skip_pull=0
if [[ "${OKKEY_SKIP_PULL:-}" == "1" ]]; then
  skip_pull=1
  log "==> Skipping pull (OKKEY_SKIP_PULL=1)"
else
  if ! run_compose .env pull; then
    die "docker compose pull failed (OKKEY_IMAGE_TAG=${image_tag}).
hint: the tag must exist in GHCR (ghcr.io/okkeyapp/{api,web,worker}).
  Tracking channel: OKKEY_IMAGE_TAG=dev (published on every push to the \`dev\` branch after CI lands).
  Production: pin a published SemVer with OKKEY_IMAGE_TAG=<semver> (OKKEY_CHANNEL=prod is gated until SemVer exists).
  Or set OKKEY_SKIP_PULL=1 with local images."
  fi
fi
# Signature check before compose up — unsigned / mismatched digest stops install.
verify_pulled_image_signatures "${image_tag}" "${skip_pull}"
run_compose .env up -d
wait_for_api_healthy

# Effective host ports: same precedence as Compose interpolation
# (process env > --env-file/.env > defaults in docker-compose.prod.yml).
web_port="${WEB_PORT:-}"
if [[ -z "${web_port}" ]]; then
  web_port="$(env_file_value WEB_PORT)"
fi
web_port="${web_port:-8080}"

api_port="${API_PORT:-}"
if [[ -z "${api_port}" ]]; then
  api_port="$(env_file_value API_PORT)"
fi
api_port="${api_port:-4000}"

# PUBLIC_APP_URL from the process environment always wins. If WEB_PORT was
# overridden via env, ignore a stale PUBLIC_APP_URL from .env so Open: matches
# the published port. Otherwise keep a custom PUBLIC_APP_URL from .env.
if [[ -n "${PUBLIC_APP_URL:-}" ]]; then
  web_url="${PUBLIC_APP_URL}"
elif [[ -n "${WEB_PORT:-}" ]]; then
  web_url="http://localhost:${web_port}"
else
  public_app_url="$(env_file_value PUBLIC_APP_URL)"
  if [[ -n "${public_app_url}" ]]; then
    web_url="${public_app_url}"
  else
    web_url="http://localhost:${web_port}"
  fi
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
