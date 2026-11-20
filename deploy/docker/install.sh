#!/usr/bin/env bash
# Okkey Core — one-command self-host installer (Docker Compose).
#
# Release pin (script, compose files, and container tag). Never `:latest`.
#   curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/v1.0.0-beta.2/deploy/docker/install.sh \
#     | OKKEY_REF=v1.0.0-beta.2 OKKEY_IMAGE_TAG=1.0.0-beta.2 bash
#
# Env must be on the right of `|` so bash sees it (`VAR=x curl | bash` does not).
#
# From a checked-out tree:
#   ./deploy/docker/install.sh
#
# Emergency bypass (not for production; prints a loud warning):
#   ./deploy/docker/install.sh --skip-cosign-verify
#
# Default trust: refs/tags/v*, refs/heads/release/*, refs/heads/hotfix/*.
# --allow-candidate is accepted for compatibility (no-op; same as default).
#
# Tracking :dev images (signed from refs/heads/dev). Opt-in; verification stays on:
#   curl -fsSL …/install.sh | OKKEY_COSIGN_ALLOW_DEV=1 OKKEY_IMAGE_TAG=dev bash
#   ./deploy/docker/install.sh --allow-dev
set -euo pipefail

OKKEY_INSTALL_DIR="${OKKEY_INSTALL_DIR:-$HOME/okkey}"
# Alias: OKKEY_RAW_BASE → OKKEY_REPO_RAW_BASE (repo root on raw.githubusercontent.com, no trailing slash).
if [[ -n "${OKKEY_RAW_BASE:-}" ]]; then
  OKKEY_REPO_RAW_BASE="${OKKEY_RAW_BASE}"
fi
OKKEY_REPO_RAW_BASE="${OKKEY_REPO_RAW_BASE:-https://raw.githubusercontent.com/okkeyapp/okkey}"
# Git ref for raw file downloads (branch, tag, or commit SHA).
# Default is the current release tag (v*), matching the documented install pin.
# Not the same as OKKEY_IMAGE_TAG (GHCR container tag; see .env.example).
OKKEY_REF="${OKKEY_REF:-v1.0.0-beta.2}"
# Historical production pin name (first planned SemVer). Not published in GHCR yet —
# OKKEY_CHANNEL=prod is refused until a SemVer exists (or OKKEY_PROD_CHANNEL_FORCE=1).
# Used only when OKKEY_CHANNEL=prod is forced and OKKEY_IMAGE_TAG is unset. Never `:latest`.
OKKEY_PROD_IMAGE_TAG="${OKKEY_PROD_IMAGE_TAG:-1.0.0-beta.2}"
COMPOSE_FILE_NAME="docker-compose.prod.yml"
ENV_EXAMPLE_NAME=".env.example"

log() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: install.sh [--skip-cosign-verify] [--allow-candidate] [--allow-dev]

  --skip-cosign-verify   Emergency bypass: do not verify GHCR cosign signatures
                         before docker compose up. Prints a loud warning.
                         Off by default. Not for production.
  --allow-candidate      Compatibility no-op. Default trust already includes
                         refs/tags/v*, refs/heads/release/*, and
                         refs/heads/hotfix/*. Verification stays on.
                         Process env: OKKEY_ALLOW_CANDIDATE=1 (not read from .env).
  --allow-dev            Also accept publish-images.yml signatures from
                         refs/heads/dev (tracking :dev images).
                         Verification stays on. Does not trust other branches.
                         Off by default. Process env: OKKEY_COSIGN_ALLOW_DEV=1
                         (not read from .env). Required for staging/dev servers
                         that install OKKEY_IMAGE_TAG=dev.
  -h, --help             Show this help
EOF
}

# Set by parse_args. Not read from .env.
SKIP_COSIGN_VERIFY_FLAG=0
ALLOW_CANDIDATE_FLAG=0
ALLOW_DEV_FLAG=0

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-cosign-verify)
        SKIP_COSIGN_VERIFY_FLAG=1
        shift
        ;;
      --allow-candidate)
        ALLOW_CANDIDATE_FLAG=1
        shift
        ;;
      --allow-dev)
        ALLOW_DEV_FLAG=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "unknown argument: $1
Run: install.sh --help"
        ;;
    esac
  done
}

# Strip one layer of matching surrounding quotes (Compose env-file behavior).
strip_env_quotes() {
  local value="$1"
  if [[ "${value}" =~ ^\"(.*)\"$ ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "${value}" =~ ^\'(.*)\'$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi
  printf '%s\n' "${value}"
}

# Read KEY=value from the install-dir .env (no export). Empty if missing.
env_file_value() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" .env 2>/dev/null | cut -d= -f2- || true)"
  strip_env_quotes "${value}"
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

# Resolve required sales inbox into `sales_email` without writing install files.
# Prefer process env, then existing ./.env, then interactive prompt; never invent a default.
# Must run before fetch_file / .env minting so a failed check leaves the install untouched.
resolve_sales_email() {
  sales_email="${OKKEY_SALES_EMAIL:-}"
  if [[ -z "${sales_email}" ]]; then
    sales_email="$(env_file_value OKKEY_SALES_EMAIL)"
  fi
  if [[ -n "${sales_email}" ]] && ! is_valid_sales_email "${sales_email}"; then
    die "OKKEY_SALES_EMAIL is invalid: ${sales_email}
Set a real inbox address (must contain @ and a domain)."
  fi
  if [[ -n "${sales_email}" ]]; then
    return 0
  fi
  # `curl … | bash` makes stdin a pipe (not a TTY). Prefer a usable /dev/tty when a
  # controlling terminal is attached; hard-fail with a clear hint when there is none
  # (CI, cloud-init, setsid, ssh without -t).
  local prompt_tty=""
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
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

# Cosign keyless OIDC identity for Core publish workflow
# (.github/workflows/publish-images.yml on okkeyapp/okkey).
# Default (same shape as Enterprise cosign-identity.sh): refs/tags/v<semver>,
# refs/heads/release/<name>, refs/heads/hotfix/<name>. Not refs/heads/dev.
# --allow-candidate is a compatibility alias of the default (no-op).
# --allow-dev / OKKEY_COSIGN_ALLOW_DEV=1 adds refs/heads/dev only.
# Anchored with ^...$ because cosign matches the regexp as a substring.
# An exported OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP replaces all of these.
OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(?:heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'
OKKEY_COSIGN_DEFAULT_DEV_IDENTITY_REGEXP='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(?:heads/dev|heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'
# Alias kept for callers / tests that still ask for "candidate"; same as default (TSK-302).
OKKEY_COSIGN_CANDIDATE_IDENTITY_REGEXP='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(?:heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'
OKKEY_COSIGN_CANDIDATE_DEV_IDENTITY_REGEXP='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(?:heads/dev|heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'
OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER="${OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER:-https://token.actions.githubusercontent.com}"

# Same precedence as Compose: process env (even when empty) wins over --env-file
# .env. Empty values are returned as empty so callers can apply `:-` defaults
# without falling through to .env (Compose `${VAR:-default}` semantics).
resolve_env_value() {
  local key="$1"
  local value=""
  if [[ -v "${key}" ]]; then
    value="${!key}"
  else
    value="$(env_file_value "${key}")"
  fi
  printf '%s\n' "${value}"
}

# Image tag compose interpolates for api/worker/web:
# ${OKKEY_ENTERPRISE_IMAGE_TAG:-${OKKEY_IMAGE_TAG:-1.0.0-beta.2}}
compose_image_tag() {
  local enterprise_tag image_tag
  enterprise_tag="$(resolve_env_value OKKEY_ENTERPRISE_IMAGE_TAG)"
  if [[ -n "${enterprise_tag}" ]]; then
    printf '%s\n' "${enterprise_tag}"
    return 0
  fi
  image_tag="$(resolve_env_value OKKEY_IMAGE_TAG)"
  printf '%s\n' "${image_tag:-1.0.0-beta.2}"
}

# Resolve image ref compose will run (name + tag, matching compose interpolation).
compose_image_ref() {
  local env_key="$1"
  local default_image="$2"
  local image tag
  image="$(resolve_env_value "${env_key}")"
  image="${image:-${default_image}}"
  tag="$(compose_image_tag)"
  printf '%s:%s\n' "${image}" "${tag}"
}

# Repository name for a name:tag (or name) ref. Handles registry:port/name:tag.
image_ref_repository() {
  local ref="$1"
  if [[ "${ref}" == *@* ]]; then
    printf '%s\n' "${ref%@*}"
    return 0
  fi
  # Tag is the final :<segment> when that segment has no '/'.
  if [[ "${ref}" == *:* && "${ref##*:}" != */* ]]; then
    printf '%s\n' "${ref%:*}"
    return 0
  fi
  printf '%s\n' "${ref}"
}

# Resolve a pulled image to a registry digest ref (name@sha256:…).
# Prefer the RepoDigest whose repository matches the verified ref — never
# blindly take index 0 when the image has multiple remotes.
image_digest_ref() {
  local ref="$1"
  local repo digests digest_line digest
  repo="$(image_ref_repository "${ref}")"
  digests="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "${ref}" 2>/dev/null || true)"
  while IFS= read -r digest_line || [[ -n "${digest_line}" ]]; do
    [[ -z "${digest_line}" || "${digest_line}" == "<no value>" ]] && continue
    if [[ "${digest_line}" == "${repo}@sha256:"* ]]; then
      printf '%s\n' "${digest_line}"
      return 0
    fi
  done <<< "${digests}"
  digest="$(docker image inspect --format '{{.Id}}' "${ref}" 2>/dev/null || true)"
  die "cannot resolve matching digest for ${ref} after pull (no RepoDigest for ${repo}; id=${digest}).
hint: re-pull from the registry, or re-run with --skip-cosign-verify only for local/unsigned images."
}

# Loud stderr warning for the emergency signature bypass.
warn_skip_cosign() {
  local why="$1"
  printf '%s\n' \
    "==> WARNING: image signature verification is DISABLED (${why})." \
    "==> WARNING: api, worker, and web will start WITHOUT a cosign check." \
    "==> WARNING: Emergency bypass only. Do not use this for production." >&2
}

# Opt-in for refs/heads/dev signatures (tracking :dev). Verification stays on.
warn_allow_dev() {
  local why="$1"
  printf '%s\n' \
    "==> WARNING: trusting refs/heads/dev signatures (${why})." \
    "==> WARNING: also accepting publish-images signatures from refs/heads/dev." \
    "==> WARNING: Signature verification stays on. This is not a bypass." >&2
}

# Compatibility: --allow-candidate no longer widens trust (already in default).
warn_allow_candidate() {
  local why="$1"
  printf '%s\n' \
    "==> NOTE: ${why} is a no-op; default trust already includes refs/tags/v*, refs/heads/release/*, and refs/heads/hotfix/*." \
    "==> NOTE: Signature verification stays on. This is not a bypass." >&2
}

# Verify cosign keyless signatures for api/web/worker before compose up.
# Default trusts refs/tags/v*, refs/heads/release/*, refs/heads/hotfix/*.
# :dev needs --allow-dev / OKKEY_COSIGN_ALLOW_DEV=1.
# Emergency bypass is the CLI flag --skip-cosign-verify (or the equivalent
# process env OKKEY_SKIP_COSIGN_VERIFY=1). Local installs that skip pull also
# skip verify unless OKKEY_FORCE_COSIGN_VERIFY=1.
verify_pulled_image_signatures() {
  local skip_pull="${1:-0}"
  local allow_candidate=0
  local allow_dev=0

  # Process env only. A line in the install .env does not enable these.
  if [[ "${ALLOW_CANDIDATE_FLAG}" == "1" || "${OKKEY_ALLOW_CANDIDATE:-}" == "1" ]]; then
    allow_candidate=1
  fi
  if [[ "${ALLOW_DEV_FLAG}" == "1" || "${OKKEY_COSIGN_ALLOW_DEV:-}" == "1" ]]; then
    allow_dev=1
  fi

  if [[ "${SKIP_COSIGN_VERIFY_FLAG}" == "1" ]]; then
    warn_skip_cosign "--skip-cosign-verify"
    return 0
  fi
  if [[ "${OKKEY_SKIP_COSIGN_VERIFY:-}" == "1" ]]; then
    warn_skip_cosign "OKKEY_SKIP_COSIGN_VERIFY=1"
    return 0
  fi
  if [[ "${skip_pull}" == "1" && "${OKKEY_FORCE_COSIGN_VERIFY:-}" != "1" ]]; then
    log "==> WARNING: skipping image signature verify (OKKEY_SKIP_PULL=1; set OKKEY_FORCE_COSIGN_VERIFY=1 to require cosign)"
    return 0
  fi

  if ! command -v cosign >/dev/null 2>&1; then
    die "cosign is not installed, so GHCR image signatures cannot be verified.
Install cosign and re-run:
  https://docs.sigstore.dev/cosign/system_config/installation/
Emergency bypass (prints a warning; not for production):
  ./deploy/docker/install.sh --skip-cosign-verify
  curl -fsSL …/install.sh | bash -s -- --skip-cosign-verify"
  fi
  need_cmd docker

  # Explicit override replaces the built-in sets. When --allow-dev is also set,
  # the override must already include heads/dev (Enterprise wrapper expands its
  # identity before export); otherwise fail loudly instead of silently ignoring.
  local identity_regexp="${OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP:-}"
  if [[ -n "${identity_regexp}" ]]; then
    if [[ "${allow_dev}" == "1" && "${identity_regexp}" != *heads/dev* ]]; then
      die "--allow-dev / OKKEY_COSIGN_ALLOW_DEV=1 has no effect while OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP is set without heads/dev.
Include heads/dev in that regexp, or unset the override so the built-in allow-dev set applies."
    fi
  elif [[ "${allow_dev}" == "1" ]]; then
    identity_regexp="${OKKEY_COSIGN_DEFAULT_DEV_IDENTITY_REGEXP}"
  else
    identity_regexp="${OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP}"
  fi

  if [[ "${allow_candidate}" == "1" ]]; then
    if [[ "${ALLOW_CANDIDATE_FLAG}" == "1" ]]; then
      warn_allow_candidate "--allow-candidate"
    else
      warn_allow_candidate "OKKEY_ALLOW_CANDIDATE=1"
    fi
  fi
  if [[ "${allow_dev}" == "1" && -z "${OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP:-}" ]]; then
    if [[ "${ALLOW_DEV_FLAG}" == "1" ]]; then
      warn_allow_dev "--allow-dev"
    else
      warn_allow_dev "OKKEY_COSIGN_ALLOW_DEV=1"
    fi
  fi

  # compose_image_ref resolves name+tag the same way compose does
  # (ENTERPRISE_IMAGE_TAG → IMAGE_TAG → 1.0.0-beta.2).
  local refs=()
  refs+=("$(compose_image_ref OKKEY_API_IMAGE ghcr.io/okkeyapp/api)")
  refs+=("$(compose_image_ref OKKEY_WORKER_IMAGE ghcr.io/okkeyapp/worker)")
  refs+=("$(compose_image_ref OKKEY_WEB_IMAGE ghcr.io/okkeyapp/web)")

  local ref digest_ref
  for ref in "${refs[@]}"; do
    digest_ref="$(image_digest_ref "${ref}")"
    log "==> Verifying cosign signature: ${digest_ref}"
    if ! cosign verify \
      --certificate-identity-regexp "${identity_regexp}" \
      --certificate-oidc-issuer "${OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER}" \
      "${digest_ref}"; then
      die "cosign verify failed for ${digest_ref}.
The image is unsigned or was not signed by this repo's publish-images workflow
(GitHub Actions OIDC). Refusing to start the stack.
hint: Core images must be signed keyless by .github/workflows/publish-images.yml.
  For OKKEY_IMAGE_TAG=dev / refs/heads/dev signatures: pass --allow-dev or set OKKEY_COSIGN_ALLOW_DEV=1 (process env, not .env).
  Install cosign: https://docs.sigstore.dev/cosign/system_config/installation/
  Emergency bypass only: install.sh --skip-cosign-verify (prints a warning; not for prod)."
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
  curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/v1.0.0-beta.2/deploy/docker/install.sh \\
    | OKKEY_REF=v1.0.0-beta.2 bash"
}

parse_args "$@"

need_cmd docker
docker compose version >/dev/null 2>&1 || die "docker compose plugin is required"

mkdir -p "$OKKEY_INSTALL_DIR"
cd "$OKKEY_INSTALL_DIR"

log "==> Installing Okkey into ${OKKEY_INSTALL_DIR}"
log "==> Raw base: ${OKKEY_REPO_RAW_BASE}  ref: ${OKKEY_REF}"

# Obtain a valid sales inbox before any install file rewrite (compose / .env.example /
# secrets). Failed checks must leave an existing install untouched.
sales_email=""
resolve_sales_email

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

  # Persist installer-provided ports / public URLs into .env.
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

  # Persist custom image names so later `compose --env-file .env` and the update
  # agent keep the same refs the installer verified (process env wins at runtime;
  # .env.example leaves OKKEY_*_IMAGE commented out).
  if [[ -n "${OKKEY_API_IMAGE:-}" ]]; then
    replace_env OKKEY_API_IMAGE "${OKKEY_API_IMAGE}"
  fi
  if [[ -n "${OKKEY_WORKER_IMAGE:-}" ]]; then
    replace_env OKKEY_WORKER_IMAGE "${OKKEY_WORKER_IMAGE}"
  fi
  if [[ -n "${OKKEY_WEB_IMAGE:-}" ]]; then
    replace_env OKKEY_WEB_IMAGE "${OKKEY_WEB_IMAGE}"
  fi
  if [[ -n "${OKKEY_API_IMAGE:-}" || -n "${OKKEY_WORKER_IMAGE:-}" || -n "${OKKEY_WEB_IMAGE:-}" ]]; then
    log "==> Wrote custom image names into .env (OKKEY_API_IMAGE=${OKKEY_API_IMAGE:-}, OKKEY_WORKER_IMAGE=${OKKEY_WORKER_IMAGE:-}, OKKEY_WEB_IMAGE=${OKKEY_WEB_IMAGE:-})"
  fi

  log "==> Generated JWT_SECRET, SESSION_SECRET, EMAIL_DEAD_LETTER_SEAL_KEY, POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD"
else
  log "==> Reusing existing .env"
  # Process env still wins for this run (same as compose), but is not written into .env.
  if [[ -n "${OKKEY_IMAGE_TAG:-}" ]]; then
    log "==> Note: OKKEY_IMAGE_TAG=${OKKEY_IMAGE_TAG} is set in the process environment — this run uses it for pull/verify, but it is not written to the existing .env"
  elif [[ -n "${OKKEY_CHANNEL:-}" ]]; then
    log "==> Note: OKKEY_CHANNEL set but .env already exists — OKKEY_CHANNEL only applies on a fresh install; edit OKKEY_IMAGE_TAG in .env to change the persisted tag"
  fi
  if [[ -n "${OKKEY_API_IMAGE:-}" || -n "${OKKEY_WORKER_IMAGE:-}" || -n "${OKKEY_WEB_IMAGE:-}" ]]; then
    log "==> Note: OKKEY_API_IMAGE / OKKEY_WORKER_IMAGE / OKKEY_WEB_IMAGE set in the process environment — this run uses them for pull/verify, but they are not written to the existing .env"
  fi
  if [[ "${OKKEY_RESET_VOLUMES:-}" == "1" ]]; then
    reset_compose_volumes
  fi
fi

replace_env OKKEY_SALES_EMAIL "${sales_email}"
log "==> OKKEY_SALES_EMAIL=${sales_email}"

update_agent_token="$(env_file_value OKKEY_UPDATE_AGENT_TOKEN)"
if [[ -z "${update_agent_token}" ]]; then
  update_agent_token="$(gen_secret)"
  replace_env OKKEY_UPDATE_AGENT_TOKEN "${update_agent_token}"
  log "==> Generated OKKEY_UPDATE_AGENT_TOKEN"
fi
replace_env OKKEY_COMPOSE_PROJECT "$(compose_project_name)"
replace_env OKKEY_HOST_INSTALL_DIR "${OKKEY_INSTALL_DIR}"

# Same tag compose uses for api/worker/web image refs.
image_tag="$(compose_image_tag)"
log "==> Pulling images and starting stack (compose project=$(compose_project_name), image tag=${image_tag})"
# OKKEY_SKIP_PULL=1: use images already present locally (e.g. :local / pre-loaded tags).
skip_pull=0
if [[ "${OKKEY_SKIP_PULL:-}" == "1" ]]; then
  skip_pull=1
  log "==> Skipping pull (OKKEY_SKIP_PULL=1)"
else
  if ! run_compose .env pull; then
    die "docker compose pull failed (OKKEY_IMAGE_TAG=${image_tag}).
hint: the tag must exist in GHCR (ghcr.io/okkeyapp/{api,web,worker}).
  Tracking channel: OKKEY_IMAGE_TAG=dev (published only by a manual workflow_dispatch of .github/workflows/publish-images.yml on refs/heads/dev; a push to the dev branch does not publish :dev).
  Cosign identity for :dev: pass --allow-dev or set OKKEY_COSIGN_ALLOW_DEV=1 (process env, not .env).
  Production: pin a published SemVer with OKKEY_IMAGE_TAG=<semver> (OKKEY_CHANNEL=prod is gated until SemVer exists).
  Or set OKKEY_SKIP_PULL=1 with local images."
  fi
fi
# Signature check before compose up — unsigned / mismatched digest stops install.
verify_pulled_image_signatures "${skip_pull}"
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
