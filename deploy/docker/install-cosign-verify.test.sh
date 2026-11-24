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
printf '%s\n' "${help_out}" | grep -Fq -- '--allow-candidate' || fail "help missing --allow-candidate
${help_out}"
printf '%s\n' "${help_out}" | grep -Fq -- '--allow-dev' || fail "help missing --allow-dev
${help_out}"
printf '%s\n' "${help_out}" | grep -Fq 'OKKEY_COSIGN_ALLOW_DEV=1' || fail "help missing OKKEY_COSIGN_ALLOW_DEV
${help_out}"
printf '%s\n' "${help_out}" | grep -Fq 'Verification stays on' || fail "help must say verification stays on
${help_out}"
printf '%s\n' "${help_out}" | grep -Fq 'Compatibility no-op' || fail "help must document --allow-candidate as no-op
${help_out}"
head -n 30 "${INSTALL_SH}" | grep -Fq -- '--allow-candidate' || fail "script header missing --allow-candidate"
head -n 30 "${INSTALL_SH}" | grep -Fq -- '--allow-dev' || fail "script header missing --allow-dev"

# Default git ref is the documented release tag, not the dev branch.
grep -Fq 'OKKEY_REF="${OKKEY_REF:-v1.0.0-beta.3}"' "${INSTALL_SH}" || fail "default OKKEY_REF must be v1.0.0-beta.3"
head -n 20 "${INSTALL_SH}" | grep -Fq 'okkey/v1.0.0-beta.3/deploy/docker/install.sh' || fail "header must download install.sh from the release tag"
if head -n 20 "${INSTALL_SH}" | grep -Fq 'okkey/dev/deploy/docker/install.sh'; then
  fail "header must not download install.sh from the dev branch"
fi
grep -Fq 'published only by a manual workflow_dispatch' "${INSTALL_SH}" || fail "pull error must describe manual :dev publishing"
grep -Fq 'OKKEY_COSIGN_ALLOW_DEV=1' "${INSTALL_SH}" || fail "pull/verify errors must mention OKKEY_COSIGN_ALLOW_DEV"
grep -Fq -- '--allow-dev' "${INSTALL_SH}" || fail "pull/verify errors must mention --allow-dev"
if grep -Fq 'published on every push' "${INSTALL_SH}"; then
  fail "pull error must not say :dev is published on every push"
fi

# --- unknown argument fails before docker ---
set +e
unknown_out="$(PATH="/usr/bin:/bin" bash "${INSTALL_SH}" --not-a-flag </dev/null 2>&1)"
unknown_rc=$?
set -e
[[ "${unknown_rc}" -ne 0 ]] || fail "unknown argument should fail"
printf '%s\n' "${unknown_out}" | grep -Fq 'unknown argument' || fail "unknown argument message missing
${unknown_out}"

# --- bypass / identity opt-ins are not lines in env examples ---
for env_file in "${ROOT}/.env.example" "${REPO_ROOT}/.env.example"; do
  if grep -Eq 'SKIP_COSIGN|skip-cosign|ALLOW_CANDIDATE|allow-candidate|COSIGN_ALLOW_DEV|allow-dev' "${env_file}"; then
    fail "bypass or identity opt-in must not appear in ${env_file}"
  fi
done

# --- verify call sits before compose up ---
verify_line="$(grep -n '^verify_pulled_image_signatures "\${skip_pull}"' "${INSTALL_SH}" | head -1 | cut -d: -f1)"
up_line="$(grep -n '^run_compose \.env up -d$' "${INSTALL_SH}" | head -1 | cut -d: -f1)"
[[ -n "${verify_line}" && -n "${up_line}" ]] || fail "could not locate verify / compose up"
[[ "${verify_line}" -lt "${up_line}" ]] || fail "verify (line ${verify_line}) must run before compose up (line ${up_line})"
# Default image tag must match compose (${OKKEY_IMAGE_TAG:-1.0.0-beta.3}).
grep -Fq 'image_tag:-1.0.0-beta.3' "${INSTALL_SH}" || fail "compose_image_tag default must be 1.0.0-beta.3"
grep -Fq 'OKKEY_ENTERPRISE_IMAGE_TAG' "${INSTALL_SH}" || fail "install.sh must honor OKKEY_ENTERPRISE_IMAGE_TAG like compose"

# Expected keyless identity: this repo's publish-images workflow, GitHub Actions OIDC.
# Default trusts tags/v* + release/* + hotfix/* — refs/heads/dev requires opt-in.
EXPECTED_IDENTITY='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(?:heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'
EXPECTED_DEV_IDENTITY='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(?:heads/dev|heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'
# --allow-candidate is a no-op alias of the default / default+dev sets.
CANDIDATE_IDENTITY="${EXPECTED_IDENTITY}"
CANDIDATE_DEV_IDENTITY="${EXPECTED_DEV_IDENTITY}"
EXPECTED_ISSUER='https://token.actions.githubusercontent.com'

# Structural: default regexp must not trust refs/heads/dev; must trust release/hotfix/tags.
default_re="$(grep -E '^OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP=' "${INSTALL_SH}" | head -1)"
printf '%s\n' "${default_re}" | grep -Fq 'heads/dev' && fail "default identity must not include heads/dev
${default_re}"
printf '%s\n' "${default_re}" | grep -Fq 'tags/v' || fail "default identity must trust SemVer tags
${default_re}"
printf '%s\n' "${default_re}" | grep -Fq 'heads/release' || fail "default identity must trust release/*
${default_re}"
printf '%s\n' "${default_re}" | grep -Fq 'heads/hotfix' || fail "default identity must trust hotfix/*
${default_re}"

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
  if [[ "${FRESH_INSTALL:-0}" == "1" ]]; then
    # Fresh install: no .env yet; install.sh copies .env.example from SCRIPT_DIR.
    :
  else
    {
      printf 'OKKEY_IMAGE_TAG=%s\nOKKEY_SALES_EMAIL=sales@example.com\nJWT_SECRET=old\n' "${tag}"
      if [[ -n "${INSTALL_ENV_EXTRA:-}" ]]; then
        printf '%s\n' "${INSTALL_ENV_EXTRA}"
      fi
    } > "${install_dir}/.env"
  fi

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
if [[ "${1:-}" == "volume" && "${2:-}" == "inspect" ]]; then
  # Fresh install: no existing postgres volume.
  exit 1
fi
if [[ "${1:-}" == "image" && "${2:-}" == "inspect" ]]; then
  ref="${*: -1}"
  name="${ref}"
  if [[ "${ref}" == *:* && "${ref##*:}" != */* ]]; then
    name="${ref%:*}"
  fi
  # Wrong digest first — install.sh must pick the matching repository, not index 0.
  printf 'other.example/unrelated@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff\n'
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
# Optional: require a specific --certificate-identity-regexp value (Enterprise install).
if [[ -n "${REQUIRE_COSIGN_IDENTITY:-}" ]]; then
  matched=0
  prev=""
  for arg in "$@"; do
    if [[ "${prev}" == "--certificate-identity-regexp" && "${arg}" == "${REQUIRE_COSIGN_IDENTITY}" ]]; then
      matched=1
      break
    fi
    prev="${arg}"
  done
  if [[ "${matched}" != "1" ]]; then
    echo "stub: identity mismatch (expected Enterprise identity)" >&2
    exit 1
  fi
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
      REQUIRE_COSIGN_IDENTITY="${REQUIRE_COSIGN_IDENTITY:-}" \
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
  if [[ -f "${install_dir}/.env" ]]; then
    RUN_ENV="$(cat "${install_dir}/.env")"
  else
    RUN_ENV=""
  fi
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
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'heads/dev' && fail "default identity must not accept heads/dev
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'heads/release' || fail "default identity must accept release branches
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'heads/hotfix' || fail "default identity must accept hotfix branches
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${EXPECTED_ISSUER}" || fail "OIDC issuer missing
${RUN_COSIGN}"
for image in api worker web; do
  printf '%s\n' "${RUN_COSIGN}" | grep -Fq "ghcr.io/okkeyapp/${image}@sha256:" || fail "missing ${image} digest verify
${RUN_COSIGN}"
  printf '%s\n' "${RUN_DOCKER}" | grep -Fq "ghcr.io/okkeyapp/${image}:1.0.0-beta.3" || fail "did not inspect ${image}:1.0.0-beta.3
${RUN_DOCKER}"
done

# Floating :dev still verifies (by digest) but default identity rejects heads/dev.
run_install "dev" 1 0 --
[[ "${RUN_RC}" -eq 0 ]] || fail ":dev install should succeed when cosign stub passes
${RUN_OUT}"
[[ "${RUN_SEQUENCE}" == $'PULL\nCOSIGN\nCOSIGN\nCOSIGN\nUP' ]] || fail ":dev order wrong:
${RUN_SEQUENCE}"
printf '%s\n' "${RUN_DOCKER}" | grep -Fq 'ghcr.io/okkeyapp/api:dev' || fail ":dev tag was not inspected
${RUN_DOCKER}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${EXPECTED_IDENTITY}" || fail ":dev without opt-in must use default (no heads/dev) identity
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'heads/dev' && fail ":dev without opt-in must not trust heads/dev identity
${RUN_COSIGN}"

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

# --allow-candidate is a no-op (same as default) and still verifies (still no heads/dev).
run_install "1.0.0-beta.2-candidate" 1 0 -- --allow-candidate
[[ "${RUN_RC}" -eq 0 ]] || fail "allow-candidate should succeed when cosign passes
${RUN_OUT}"
[[ "${RUN_SEQUENCE}" == $'PULL\nCOSIGN\nCOSIGN\nCOSIGN\nUP' ]] || fail "allow-candidate still must verify before up:
${RUN_SEQUENCE}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'NOTE: --allow-candidate is a no-op' || fail "candidate no-op note missing
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'Signature verification stays on. This is not a bypass.' || fail "candidate note must say verification stays on
${RUN_OUT}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${CANDIDATE_IDENTITY}" || fail "candidate identity regexp missing
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'heads/hotfix/[0-9A-Za-z._-]+' || fail "candidate identity missing hotfix
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'heads/dev' && fail "allow-candidate alone must not trust heads/dev
${RUN_COSIGN}"

# Process env opt-in, same verify path / same default identity.
run_install "1.0.0-beta.2-candidate" 1 0 OKKEY_ALLOW_CANDIDATE=1 --
[[ "${RUN_RC}" -eq 0 ]] || fail "OKKEY_ALLOW_CANDIDATE should succeed when cosign passes
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'NOTE: OKKEY_ALLOW_CANDIDATE=1 is a no-op' || fail "env candidate no-op note missing
${RUN_OUT}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${CANDIDATE_IDENTITY}" || fail "env candidate identity missing
${RUN_COSIGN}"
[[ "${RUN_SEQUENCE}" == $'PULL\nCOSIGN\nCOSIGN\nCOSIGN\nUP' ]] || fail "env candidate skipped verify:
${RUN_SEQUENCE}"

# --allow-dev / OKKEY_COSIGN_ALLOW_DEV=1 adds heads/dev only (verification stays on).
run_install "dev" 1 0 -- --allow-dev
[[ "${RUN_RC}" -eq 0 ]] || fail "allow-dev should succeed when cosign passes
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'WARNING: trusting refs/heads/dev signatures (--allow-dev).' || fail "allow-dev warning missing
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'Signature verification stays on. This is not a bypass.' || fail "allow-dev must say verification stays on
${RUN_OUT}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${EXPECTED_DEV_IDENTITY}" || fail "allow-dev identity missing
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'heads/dev' || fail "allow-dev must include heads/dev
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'heads/release' || fail "allow-dev must keep release/* from the default set
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'heads/hotfix' || fail "allow-dev must keep hotfix/* from the default set
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'heads/main' && fail "allow-dev must not accept arbitrary branches
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'heads/feature' && fail "allow-dev must not accept arbitrary branches
${RUN_COSIGN}"
[[ "${RUN_SEQUENCE}" == $'PULL\nCOSIGN\nCOSIGN\nCOSIGN\nUP' ]] || fail "allow-dev skipped verify:
${RUN_SEQUENCE}"

run_install "dev" 1 0 OKKEY_COSIGN_ALLOW_DEV=1 --
[[ "${RUN_RC}" -eq 0 ]] || fail "OKKEY_COSIGN_ALLOW_DEV should succeed when cosign passes
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'trusting refs/heads/dev signatures (OKKEY_COSIGN_ALLOW_DEV=1)' || fail "env allow-dev warning missing
${RUN_OUT}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${EXPECTED_DEV_IDENTITY}" || fail "env allow-dev identity missing
${RUN_COSIGN}"

# allow-dev + allow-candidate combines both widenings.
run_install "dev" 1 0 OKKEY_COSIGN_ALLOW_DEV=1 OKKEY_ALLOW_CANDIDATE=1 --
[[ "${RUN_RC}" -eq 0 ]] || fail "allow-dev+candidate should succeed
${RUN_OUT}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${CANDIDATE_DEV_IDENTITY}" || fail "combined identity missing
${RUN_COSIGN}"

# OKKEY_COSIGN_ALLOW_DEV in the install .env is ignored.
INSTALL_ENV_EXTRA='OKKEY_COSIGN_ALLOW_DEV=1'
run_install "dev" 1 0 --
unset INSTALL_ENV_EXTRA
[[ "${RUN_RC}" -eq 0 ]] || fail ".env allow-dev line should still install with the default identity
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'trusting refs/heads/dev' && fail ".env must not enable allow-dev
${RUN_OUT}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${EXPECTED_IDENTITY}" || fail ".env allow-dev line changed the identity
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'heads/dev' && fail ".env allow-dev line trusted heads/dev
${RUN_COSIGN}"

# Explicit identity override without heads/dev + allow-dev must fail loudly.
CUSTOM_IDENTITY='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/tags/v1\.2\.3$'
run_install "1.0.0-beta.3" 1 0 \
  OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP="${CUSTOM_IDENTITY}" \
  OKKEY_COSIGN_ALLOW_DEV=1 --
[[ "${RUN_RC}" -ne 0 ]] || fail "allow-dev + override without heads/dev must fail loudly
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'has no effect while OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP is set without heads/dev' \
  || fail "missing loud allow-dev/override conflict error
${RUN_OUT}"
assert_no_up

# Explicit override that already includes heads/dev wins (allow-dev does not rewrite it).
CUSTOM_DEV_IDENTITY='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(?:heads/dev|tags/v1\.2\.3)$'
run_install "1.0.0-beta.3" 1 0 \
  OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP="${CUSTOM_DEV_IDENTITY}" \
  OKKEY_COSIGN_ALLOW_DEV=1 --
[[ "${RUN_RC}" -eq 0 ]] || fail "custom identity with heads/dev should succeed
${RUN_OUT}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${CUSTOM_DEV_IDENTITY}" || fail "custom identity override missing
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${EXPECTED_DEV_IDENTITY}" && fail "allow-dev must not replace an explicit identity override
${RUN_COSIGN}"

# Explicit override alone (no allow-dev) still replaces built-ins.
run_install "1.0.0-beta.3" 1 0 \
  OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP="${CUSTOM_IDENTITY}" --
[[ "${RUN_RC}" -eq 0 ]] || fail "custom identity override should succeed
${RUN_OUT}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${CUSTOM_IDENTITY}" || fail "custom identity override missing
${RUN_COSIGN}"

# A bad signature is still fatal with --allow-candidate.
run_install "1.0.0-beta.2-candidate" 1 1 -- --allow-candidate
[[ "${RUN_RC}" -ne 0 ]] || fail "allow-candidate must not skip a bad signature"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'cosign verify failed' || fail "allow-candidate missing verify-failed error
${RUN_OUT}"
assert_no_up

# OKKEY_ALLOW_CANDIDATE in the install .env is ignored (no no-op note either).
INSTALL_ENV_EXTRA='OKKEY_ALLOW_CANDIDATE=1'
run_install "dev" 1 0 --
unset INSTALL_ENV_EXTRA
[[ "${RUN_RC}" -eq 0 ]] || fail ".env candidate line should still install with the default identity
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'is a no-op' && fail ".env must not enable candidate mode
${RUN_OUT}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${EXPECTED_IDENTITY}" || fail ".env candidate line changed the identity
${RUN_COSIGN}"

# --- Image ref resolution: process env > .env > default (same as compose) ---

# Process-env image names (absent from .env) must be what cosign verifies.
run_install "1.0.0-beta.3" 1 0 \
  OKKEY_API_IMAGE=registry.example/okkey/api \
  OKKEY_WORKER_IMAGE=registry.example/okkey/worker \
  OKKEY_WEB_IMAGE=registry.example/okkey/web --
[[ "${RUN_RC}" -eq 0 ]] || fail "process-env custom images should succeed
${RUN_OUT}"
[[ "${RUN_SEQUENCE}" == $'PULL\nCOSIGN\nCOSIGN\nCOSIGN\nUP' ]] || fail "process-env custom images sequence wrong:
${RUN_SEQUENCE}"
for image in api worker web; do
  printf '%s\n' "${RUN_COSIGN}" | grep -Fq "registry.example/okkey/${image}@sha256:" || fail "cosign must verify process-env ${image}
${RUN_COSIGN}"
  printf '%s\n' "${RUN_DOCKER}" | grep -Fq "registry.example/okkey/${image}:1.0.0-beta.3" || fail "inspect must use process-env ${image}
${RUN_DOCKER}"
  printf '%s\n' "${RUN_COSIGN}" | grep -Fq "ghcr.io/okkeyapp/${image}@sha256:" && fail "must not verify default ghcr ${image} when process env set
${RUN_COSIGN}"
done
# Existing .env is not silently rewritten; note says this run uses process env.
printf '%s\n' "${RUN_OUT}" | grep -Fq 'OKKEY_API_IMAGE / OKKEY_WORKER_IMAGE / OKKEY_WEB_IMAGE set in the process environment — this run uses them for pull/verify, but they are not written to the existing .env' || fail "missing existing-.env image note
${RUN_OUT}"
printf '%s\n' "${RUN_ENV}" | grep -Eq '^OKKEY_API_IMAGE=' && fail "must not rewrite existing .env with process-env images
${RUN_ENV}"

# Existing .env tag A + exported OKKEY_IMAGE_TAG=B → verify inspects tag B.
run_install "1.0.0-beta.3" 1 0 OKKEY_IMAGE_TAG=exported-tag-b --
[[ "${RUN_RC}" -eq 0 ]] || fail "process-env tag override should succeed
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'OKKEY_IMAGE_TAG=exported-tag-b is set in the process environment — this run uses it for pull/verify, but it is not written to the existing .env' || fail "missing existing-.env tag note
${RUN_OUT}"
printf '%s\n' "${RUN_ENV}" | grep -Eq '^OKKEY_IMAGE_TAG=1.0.0-beta.3$' || fail "must not rewrite existing .env tag
${RUN_ENV}"
for image in api worker web; do
  printf '%s\n' "${RUN_DOCKER}" | grep -Fq "ghcr.io/okkeyapp/${image}:exported-tag-b" || fail "inspect must use process-env tag for ${image}
${RUN_DOCKER}"
  printf '%s\n' "${RUN_DOCKER}" | grep -Fq "ghcr.io/okkeyapp/${image}:1.0.0-beta.3" && fail "must not inspect .env tag when process-env tag wins for ${image}
${RUN_DOCKER}"
done

# .env-only image overrides still drive verify when process env is unset.
INSTALL_ENV_EXTRA=$'OKKEY_API_IMAGE=envfile.example/okkey/api\nOKKEY_WORKER_IMAGE=envfile.example/okkey/worker\nOKKEY_WEB_IMAGE=envfile.example/okkey/web'
run_install "1.0.0-beta.3" 1 0 --
unset INSTALL_ENV_EXTRA
[[ "${RUN_RC}" -eq 0 ]] || fail ".env-only custom images should succeed
${RUN_OUT}"
for image in api worker web; do
  printf '%s\n' "${RUN_COSIGN}" | grep -Fq "envfile.example/okkey/${image}@sha256:" || fail "cosign must verify .env-only ${image}
${RUN_COSIGN}"
done

# Process env wins over a conflicting .env image name (compose interpolation order).
INSTALL_ENV_EXTRA='OKKEY_API_IMAGE=envfile.example/okkey/api'
run_install "1.0.0-beta.3" 1 0 OKKEY_API_IMAGE=process.example/okkey/api --
unset INSTALL_ENV_EXTRA
[[ "${RUN_RC}" -eq 0 ]] || fail "process-env over .env should succeed
${RUN_OUT}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'process.example/okkey/api@sha256:' || fail "process env must win over .env for api
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'envfile.example/okkey/api@sha256:' && fail "must not verify .env api when process env wins
${RUN_COSIGN}"
# Unset process-env worker/web still fall through to defaults (not in .env here).
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'ghcr.io/okkeyapp/worker@sha256:' || fail "worker should fall back to default
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'ghcr.io/okkeyapp/web@sha256:' || fail "web should fall back to default
${RUN_COSIGN}"

# Defaults apply when neither process env nor .env sets image names.
run_install "1.0.0-beta.3" 1 0 --
[[ "${RUN_RC}" -eq 0 ]] || fail "default images should succeed
${RUN_OUT}"
for image in api worker web; do
  printf '%s\n' "${RUN_COSIGN}" | grep -Fq "ghcr.io/okkeyapp/${image}@sha256:" || fail "default cosign missing ${image}
${RUN_COSIGN}"
done

# Fresh install persists exported OKKEY_*_IMAGE into .env.
FRESH_INSTALL=1
run_install "1.0.0-beta.3" 1 0 \
  OKKEY_IMAGE_TAG=1.0.0-beta.3 \
  OKKEY_API_IMAGE=registry.example/okkey/api \
  OKKEY_WORKER_IMAGE=registry.example/okkey/worker \
  OKKEY_WEB_IMAGE=registry.example/okkey/web --
unset FRESH_INSTALL
[[ "${RUN_RC}" -eq 0 ]] || fail "fresh install with process-env images should succeed
${RUN_OUT}"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'Wrote custom image names into .env' || fail "fresh install missing persist log
${RUN_OUT}"
printf '%s\n' "${RUN_ENV}" | grep -Eq '^OKKEY_API_IMAGE=registry.example/okkey/api$' || fail "fresh install must persist OKKEY_API_IMAGE
${RUN_ENV}"
printf '%s\n' "${RUN_ENV}" | grep -Eq '^OKKEY_WORKER_IMAGE=registry.example/okkey/worker$' || fail "fresh install must persist OKKEY_WORKER_IMAGE
${RUN_ENV}"
printf '%s\n' "${RUN_ENV}" | grep -Eq '^OKKEY_WEB_IMAGE=registry.example/okkey/web$' || fail "fresh install must persist OKKEY_WEB_IMAGE
${RUN_ENV}"
for image in api worker web; do
  printf '%s\n' "${RUN_COSIGN}" | grep -Fq "registry.example/okkey/${image}@sha256:" || fail "fresh install cosign must verify persisted ${image}
${RUN_COSIGN}"
done

# Empty process-env OKKEY_IMAGE_TAG must not fall through to .env (compose :- semantics).
# .env uses a sentinel tag; compose/install default pin is 1.0.0-beta.3.
run_install "from-env-should-not-win" 1 0 OKKEY_IMAGE_TAG= --
[[ "${RUN_RC}" -eq 0 ]] || fail "empty process-env tag should still install with compose default
${RUN_OUT}"
for image in api worker web; do
  printf '%s\n' "${RUN_DOCKER}" | grep -Fq "ghcr.io/okkeyapp/${image}:1.0.0-beta.3" || fail "empty process tag must use compose default for ${image}
${RUN_DOCKER}"
  printf '%s\n' "${RUN_DOCKER}" | grep -Fq "ghcr.io/okkeyapp/${image}:from-env-should-not-win" && fail "empty process tag must not use .env tag for ${image}
${RUN_DOCKER}"
done

# Quoted .env image names are stripped like compose.
INSTALL_ENV_EXTRA=$'OKKEY_API_IMAGE="quoted.example/okkey/api"\nOKKEY_WORKER_IMAGE=\'quoted.example/okkey/worker\'\nOKKEY_WEB_IMAGE="quoted.example/okkey/web"'
run_install "1.0.0-beta.3" 1 0 --
unset INSTALL_ENV_EXTRA
[[ "${RUN_RC}" -eq 0 ]] || fail "quoted .env image names should succeed
${RUN_OUT}"
for image in api worker web; do
  printf '%s\n' "${RUN_COSIGN}" | grep -Fq "quoted.example/okkey/${image}@sha256:" || fail "quoted .env must strip quotes for ${image}
${RUN_COSIGN}"
done

# OKKEY_ENTERPRISE_IMAGE_TAG in .env wins over OKKEY_IMAGE_TAG (compose order).
# Unsigned enterprise :dev must fail closed before compose up (stops on first image).
INSTALL_ENV_EXTRA=$'OKKEY_ENTERPRISE_IMAGE_TAG=dev\nOKKEY_API_IMAGE=ghcr.io/example/okkey-enterprise/api\nOKKEY_WORKER_IMAGE=ghcr.io/example/okkey-enterprise/worker\nOKKEY_WEB_IMAGE=ghcr.io/example/okkey-enterprise/web'
run_install "1.0.0-beta.3" 1 1 --
unset INSTALL_ENV_EXTRA
[[ "${RUN_RC}" -ne 0 ]] || fail "unsigned enterprise tag override must fail"
printf '%s\n' "${RUN_OUT}" | grep -Fq 'cosign verify failed' || fail "enterprise override missing verify-failed error
${RUN_OUT}"
assert_no_up
printf '%s\n' "${RUN_DOCKER}" | grep -Fq 'ghcr.io/example/okkey-enterprise/api:dev' || fail "enterprise override must inspect api:dev
${RUN_DOCKER}"
printf '%s\n' "${RUN_DOCKER}" | grep -Fq 'ghcr.io/example/okkey-enterprise/api:1.0.0-beta.3' && fail "enterprise override must not inspect api with OKKEY_IMAGE_TAG
${RUN_DOCKER}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'ghcr.io/example/okkey-enterprise/api@sha256:' || fail "enterprise override cosign must target api:dev digest
${RUN_COSIGN}"
# Cosign must not verify the unrelated RepoDigests[0] decoy.
printf '%s\n' "${RUN_COSIGN}" | grep -Fq 'other.example/unrelated@sha256:' && fail "must not verify unmatched RepoDigests[0]
${RUN_COSIGN}"

# Matching enterprise override with a good signature still verifies :dev.
INSTALL_ENV_EXTRA=$'OKKEY_ENTERPRISE_IMAGE_TAG=dev\nOKKEY_API_IMAGE=ghcr.io/example/okkey-enterprise/api\nOKKEY_WORKER_IMAGE=ghcr.io/example/okkey-enterprise/worker\nOKKEY_WEB_IMAGE=ghcr.io/example/okkey-enterprise/web'
run_install "1.0.0-beta.3" 1 0 --
unset INSTALL_ENV_EXTRA
[[ "${RUN_RC}" -eq 0 ]] || fail "signed enterprise override should succeed
${RUN_OUT}"
[[ "${RUN_SEQUENCE}" == $'PULL\nCOSIGN\nCOSIGN\nCOSIGN\nUP' ]] || fail "enterprise override sequence wrong:
${RUN_SEQUENCE}"
for image in api worker web; do
  printf '%s\n' "${RUN_DOCKER}" | grep -Fq "ghcr.io/example/okkey-enterprise/${image}:dev" || fail "signed enterprise override inspect :dev for ${image}
${RUN_DOCKER}"
done

# Enterprise install: both Core + Enterprise identity vars set, ENTERPRISE_IMAGE_TAG
# pins the compose images → verify must use the Enterprise identity (not Core).
EXPECTED_ENTERPRISE_IDENTITY='^https://github\.com/okkeyapp/okkey-enterprise/\.github/workflows/publish-images\.yml@refs/(?:heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'
CORE_OVERRIDE_IDENTITY='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/tags/v9\.9\.9$'
INSTALL_ENV_EXTRA="OKKEY_ENTERPRISE_IMAGE_TAG=1.2.3
OKKEY_API_IMAGE=ghcr.io/example/okkey-enterprise/api
OKKEY_WORKER_IMAGE=ghcr.io/example/okkey-enterprise/worker
OKKEY_WEB_IMAGE=ghcr.io/example/okkey-enterprise/web
OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP=${CORE_OVERRIDE_IDENTITY}
OKKEY_ENTERPRISE_COSIGN_CERTIFICATE_IDENTITY_REGEXP=${EXPECTED_ENTERPRISE_IDENTITY}"
REQUIRE_COSIGN_IDENTITY="${EXPECTED_ENTERPRISE_IDENTITY}" \
  run_install "1.0.0-beta.3" 1 0 --
unset INSTALL_ENV_EXTRA REQUIRE_COSIGN_IDENTITY
[[ "${RUN_RC}" -eq 0 ]] || fail "Enterprise install with both identities must verify with Enterprise identity
${RUN_OUT}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${EXPECTED_ENTERPRISE_IDENTITY}" || fail "Enterprise install missing Enterprise identity on cosign
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${CORE_OVERRIDE_IDENTITY}" && fail "Enterprise install must not verify compose images with Core identity
${RUN_COSIGN}"
for image in api worker web; do
  printf '%s\n' "${RUN_DOCKER}" | grep -Fq "ghcr.io/example/okkey-enterprise/${image}:1.2.3" || fail "Enterprise install inspect :1.2.3 for ${image}
${RUN_DOCKER}"
done

# Both identities set but no ENTERPRISE_IMAGE_TAG → Core compose images keep Core identity.
INSTALL_ENV_EXTRA="OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP=${CORE_OVERRIDE_IDENTITY}
OKKEY_ENTERPRISE_COSIGN_CERTIFICATE_IDENTITY_REGEXP=${EXPECTED_ENTERPRISE_IDENTITY}"
REQUIRE_COSIGN_IDENTITY="${CORE_OVERRIDE_IDENTITY}" \
  run_install "1.0.0-beta.3" 1 0 --
unset INSTALL_ENV_EXTRA REQUIRE_COSIGN_IDENTITY
[[ "${RUN_RC}" -eq 0 ]] || fail "Core install with both identities must keep Core identity
${RUN_OUT}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${CORE_OVERRIDE_IDENTITY}" || fail "Core install missing Core identity on cosign
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${EXPECTED_ENTERPRISE_IDENTITY}" && fail "Core install must not use Enterprise identity without ENTERPRISE_IMAGE_TAG
${RUN_COSIGN}"

# OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP in .env overrides the default (process env still wins).
OVERRIDE_IDENTITY='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/heads/dev$'
INSTALL_ENV_EXTRA="OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP=${OVERRIDE_IDENTITY}"
run_install "dev" 1 0 --
unset INSTALL_ENV_EXTRA
[[ "${RUN_RC}" -eq 0 ]] || fail ".env identity override should succeed
${RUN_OUT}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${OVERRIDE_IDENTITY}" || fail ".env identity override missing
${RUN_COSIGN}"
printf '%s\n' "${RUN_COSIGN}" | grep -Fq -- "${EXPECTED_IDENTITY}" && fail ".env identity override did not replace default
${RUN_COSIGN}"

echo "OK: install.sh cosign verify"
