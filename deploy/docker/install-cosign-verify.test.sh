#!/usr/bin/env bash
# install.sh verifies GHCR cosign signatures before compose up.
# Run: bash deploy/docker/install-cosign-verify.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
INSTALL_SH="${ROOT}/install.sh"
REPO_ROOT="$(cd "${ROOT}/../.." && pwd)"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

# --- help mentions the emergency flag and does not need docker ---
help_out="$(PATH="/usr/bin:/bin" bash "${INSTALL_SH}" --help 2>&1)" || fail " --help should exit 0
${help_out}"
printf '%s\n' "${help_out}" | grep -Fq -- '--skip-cosign-verify' || fail "help missing --skip-cosign-verify
${help_out}"

# --- unknown argument fails before docker ---
set +e
unknown_out="$(PATH="/usr/bin:/bin" bash "${INSTALL_SH}" --not-a-flag </dev/null 2>&1)"
unknown_rc=$?
set -e
[[ "${unknown_rc}" -ne 0 ]] || fail "unknown argument should fail"
printf '%s\n' "${unknown_out}" | grep -Fq 'unknown argument' || fail "unknown argument message missing
${unknown_out}"

# --- bypass is not a line in env examples ---
for env_file in "${ROOT}/.env.example" "${REPO_ROOT}/.env.example"; do
  if grep -Eq 'SKIP_COSIGN|skip-cosign' "${env_file}"; then
    fail "bypass must not appear in ${env_file}"
  fi
done

# --- verify call sits before compose up ---
verify_line="$(grep -n '^verify_pulled_image_signatures "\${image_tag}"' "${INSTALL_SH}" | head -1 | cut -d: -f1)"
up_line="$(grep -n '^run_compose \.env up -d$' "${INSTALL_SH}" | head -1 | cut -d: -f1)"
[[ -n "${verify_line}" && -n "${up_line}" ]] || fail "could not locate verify / compose up"
[[ "${verify_line}" -lt "${up_line}" ]] || fail "verify (line ${verify_line}) must run before compose up (line ${up_line})"

# Expected keyless identity: this repo's publish-images workflow, GitHub Actions OIDC.
EXPECTED_IDENTITY='https://github.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(heads/dev|tags/v.+)'
EXPECTED_ISSUER='https://token.actions.githubusercontent.com'

# run_install TAG WITH_COSIGN FAIL_COSIGN [ENV=value...] -- [script args...]
run_install() {
  local tag="$1"
  local with_cosign="$2"
  local fail_cosign="$3"
  shift 3
  local env_extra=()
  local script_args=()
  local seen_dd=0
  local arg
  for arg in "$@"; do
    if [[ "${seen_dd}" == "0" && "${arg}" == "--" ]]; then
      seen_dd=1
      continue
    fi
    if [[ "${seen_dd}" == "0" ]]; then
      env_extra+=("${arg}")
    else
      script_args+=("${arg}")
    fi
  done

  local work fake install_dir
  work="$(mktemp -d "${TMPDIR:-/tmp}/okkey-cosign-install.XXXXXX")"
  fake="${work}/bin"
  install_dir="${work}/install"
  mkdir -p "${fake}" "${install_dir}"
  printf 'OKKEY_IMAGE_TAG=%s\nOKKEY_SALES_EMAIL=sales@example.com\nJWT_SECRET=old\n' "${tag}" > "${install_dir}/.env"

  cat > "${fake}/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${DOCKER_LOG}"
if [[ "${1:-}" == "compose" ]]; then
  for arg in "$@"; do
    case "${arg}" in
      version)
        echo "Docker Compose version v2.29.0"
        exit 0
        ;;
      pull)
        printf 'PULL\n' >> "${SEQUENCE}"
        exit 0
        ;;
      up)
        printf 'UP\n' >> "${SEQUENCE}"
        exit 0
        ;;
      ps)
        echo "cid-api"
        exit 0
        ;;
      down)
        exit 0
        ;;
    esac
  done
fi
if [[ "${1:-}" == "image" && "${2:-}" == "inspect" ]]; then
  ref="${*: -1}"
  name="${ref%%:*}"
  printf '%s@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n' "${name}"
  exit 0
fi
if [[ "${1:-}" == "inspect" ]]; then
  echo "healthy"
  exit 0
fi
printf 'unexpected docker invocation: %s\n' "$*" >&2
exit 99
EOF
  chmod +x "${fake}/docker"

  if [[ "${with_cosign}" == "1" ]]; then
    cat > "${fake}/cosign" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${COSIGN_LOG}"
printf 'COSIGN\n' >> "${SEQUENCE}"
if [[ "${FAIL_COSIGN:-0}" == "1" ]]; then
  echo "stub: signature mismatch" >&2
  exit 1
fi
exit 0
EOF
    chmod +x "${fake}/cosign"
  fi

  : > "${work}/docker.log"
  : > "${work}/cosign.log"
  : > "${work}/sequence"

  set +e
  # shellcheck disable=SC2086
  out="$(
    env -i \
      PATH="${fake}:/usr/bin:/bin" \
      HOME="${HOME}" \
      TMPDIR="${TMPDIR:-/tmp}" \
      DOCKER_LOG="${work}/docker.log" \
      COSIGN_LOG="${work}/cosign.log" \
      SEQUENCE="${work}/sequence" \
      FAIL_COSIGN="${fail_cosign}" \
      OKKEY_INSTALL_DIR="${install_dir}" \
      OKKEY_SALES_EMAIL="sales@example.com" \
      "${env_extra[@]}" \
      bash "${INSTALL_SH}" "${script_args[@]}" </dev/null 2>&1
  )"
  rc=$?
  set -e

  RUN_RC="${rc}"
  RUN_OUT="${out}"
  RUN_DOCKER="$(cat "${work}/docker.log")"
  RUN_COSIGN="$(cat "${work}/cosign.log")"
  RUN_SEQUENCE="$(cat "${work}/sequence")"
  rm -rf "${work}"
}

assert_no_up() {
  printf '%s\n' "${RUN_SEQUENCE}" | grep -Fxq 'UP' && fail "compose up ran:
sequence:
${RUN_SEQUENCE}
output:
${RUN_OUT}"
  return 0
}

# SemVer tag: verify identity, then compose up.
run_install "1.0.0-beta.3" 1 0 --
[[ "${RUN_RC}" -eq 0 ]] || fail "SemVer install should succeed
${RUN_OUT}"
[[ "${RUN_SEQUENCE}" == $'PULL\nCOSIGN\nCOSIGN\nCOSIGN\nUP' ]] || fail "SemVer order wrong:
${RUN_SEQUENCE}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${EXPECTED_IDENTITY}" || fail "identity regexp missing
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${EXPECTED_ISSUER}" || fail "OIDC issuer missing
${RUN_COSIGN}"
for image in api worker web; do
  printf '%s\n' "${RUN_COSIGN}" | grep -Fq "ghcr.io/okkeyapp/${image}@sha256:" || fail "missing ${image} digest verify
${RUN_COSIGN}"
  printf '%s\n' "${RUN_DOCKER}" | grep -Fq "ghcr.io/okkeyapp/${image}:1.0.0-beta.3" || fail "did not inspect ${image}:1.0.0-beta.3
${RUN_DOCKER}"
done

# Floating :dev is verified the same way.
run_install "dev" 1 0 --
[[ "${RUN_RC}" -eq 0 ]] || fail ":dev install should succeed
${RUN_OUT}"
[[ "${RUN_SEQUENCE}" == $'PULL\nCOSIGN\nCOSIGN\nCOSIGN\nUP' ]] || fail ":dev order wrong:
${RUN_SEQUENCE}"
printf '%s\n' "${RUN_DOCKER}" | grep -Fq 'ghcr.io/okkeyapp/api:dev' || fail ":dev tag was not inspected
${RUN_DOCKER}"

# Foreign / missing signature stops before compose up.
run_install "1.0.0-beta.3" 1 1 --
[[ "${RUN_RC}" -ne 0 ]] || fail "bad signature should fail"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'cosign verify failed' || fail "missing verify-failed error
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'Refusing to start' || fail "missing refuse-to-start error
${RUN_OUT}"
assert_no_up

# cosign missing: clear error, no compose up.
run_install "dev" 0 0
[[ "${RUN_RC}" -ne 0 ]] || fail "missing cosign should fail"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'cosign is not installed' || fail "missing cosign instructions
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'https://docs.sigstore.dev/cosign/system_config/installation/' || fail "missing install URL
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq -- '--skip-cosign-verify' || fail "missing bypass hint
${RUN_OUT}"
assert_no_up

# Explicit CLI bypass prints a loud warning and skips cosign.
run_install "1.0.0-beta.3" 0 0 -- --skip-cosign-verify
[[ "${RUN_RC}" -eq 0 ]] || fail "CLI bypass should succeed
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'WARNING: image signature verification is DISABLED (--skip-cosign-verify).' || fail "CLI warning missing
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'Emergency bypass only. Do not use this for production.' || fail "CLI warning not loud enough
${RUN_OUT}"
[[ "${RUN_SEQUENCE}" == $'PULL\nUP' ]] || fail "CLI bypass sequence wrong:
${RUN_SEQUENCE}"
[[ -z "${RUN_COSIGN}" ]] || fail "CLI bypass invoked cosign
${RUN_COSIGN}"

# Process-env alias still warns (documented), and is not the default.
run_install "dev" 0 0 OKKEY_SKIP_COSIGN_VERIFY=1 --
[[ "${RUN_RC}" -eq 0 ]] || fail "env bypass should succeed
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'DISABLED (OKKEY_SKIP_COSIGN_VERIFY=1)' || fail "env warning missing
${RUN_OUT}"
[[ "${RUN_SEQUENCE}" == $'PULL\nUP' ]] || fail "env bypass sequence wrong:
${RUN_SEQUENCE}"

# Local images that skip pull do not require cosign unless forced.
run_install "dev" 0 0 OKKEY_SKIP_PULL=1
[[ "${RUN_RC}" -eq 0 ]] || fail "skip-pull should succeed without cosign
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'OKKEY_SKIP_PULL=1' || fail "skip-pull warning missing
${RUN_OUT}"
[[ "${RUN_SEQUENCE}" == $'UP' ]] || fail "skip-pull sequence wrong:
${RUN_SEQUENCE}"

run_install "dev" 0 0 OKKEY_SKIP_PULL=1 OKKEY_FORCE_COSIGN_VERIFY=1 --
[[ "${RUN_RC}" -ne 0 ]] || fail "forced verify should fail without cosign"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'cosign is not installed' || fail "forced verify missing cosign error
${RUN_OUT}"
assert_no_up

echo "OK: install.sh cosign verify"
