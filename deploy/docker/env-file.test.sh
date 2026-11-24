#!/usr/bin/env bash
# Self-contained checks for .env helpers used by install.sh (curl|bash keeps them inlined).
# Run: bash deploy/docker/env-file.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
# Extract the live replace_env / tty_usable bodies from install.sh so the test
# cannot drift from production.
extract_fn() {
  local name="$1"
  awk -v name="${name}" '
    $0 ~ "^" name "\\(\\) \\{$" {printing=1}
    printing {print}
    printing && $0 == "}" {exit}
  ' "${ROOT}/install.sh"
}

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/okkey-env-test.XXXXXX")"
cleanup() { rm -rf "${WORKDIR}"; }
trap cleanup EXIT
cd "${WORKDIR}"

eval "$(extract_fn strip_env_quotes)"
eval "$(extract_fn replace_env)"
eval "$(extract_fn tty_usable)"
eval "$(extract_fn env_file_value)"
eval "$(extract_fn resolve_env_value)"
eval "$(extract_fn compose_image_tag)"
eval "$(extract_fn image_ref_repository)"

# --- strip_env_quotes / env_file_value ---
printf 'OKKEY_API_IMAGE="quoted.example/api"\nOKKEY_WEB_IMAGE='\''quoted.example/web'\''\n' > .env
got="$(env_file_value OKKEY_API_IMAGE)"
[[ "${got}" == 'quoted.example/api' ]] || {
  echo "FAIL: double-quoted .env value not stripped: [${got}]" >&2
  exit 1
}
got="$(env_file_value OKKEY_WEB_IMAGE)"
[[ "${got}" == 'quoted.example/web' ]] || {
  echo "FAIL: single-quoted .env value not stripped: [${got}]" >&2
  exit 1
}

# --- resolve_env_value: empty process env does not fall through to .env ---
printf 'OKKEY_IMAGE_TAG=from-env-file\n' > .env
OKKEY_IMAGE_TAG=
got="$(resolve_env_value OKKEY_IMAGE_TAG)"
[[ "${got}" == "" ]] || {
  echo "FAIL: empty process env fell through to .env: [${got}]" >&2
  exit 1
}
unset OKKEY_IMAGE_TAG
got="$(resolve_env_value OKKEY_IMAGE_TAG)"
[[ "${got}" == "from-env-file" ]] || {
  echo "FAIL: unset process env should read .env: [${got}]" >&2
  exit 1
}

# --- compose_image_tag: ENTERPRISE → IMAGE_TAG → 1.0.0-beta.3 ---
printf 'OKKEY_IMAGE_TAG=1.0.0-beta.3\nOKKEY_ENTERPRISE_IMAGE_TAG=dev\n' > .env
got="$(compose_image_tag)"
[[ "${got}" == "dev" ]] || {
  echo "FAIL: enterprise tag should win: [${got}]" >&2
  exit 1
}
printf 'OKKEY_IMAGE_TAG=1.0.0-beta.3\n' > .env
got="$(compose_image_tag)"
[[ "${got}" == "1.0.0-beta.3" ]] || {
  echo "FAIL: image tag from .env: [${got}]" >&2
  exit 1
}
printf 'OTHER=1\n' > .env
got="$(compose_image_tag)"
[[ "${got}" == "1.0.0-beta.3" ]] || {
  echo "FAIL: compose default tag: [${got}]" >&2
  exit 1
}

# --- image_ref_repository ---
got="$(image_ref_repository 'ghcr.io/okkeyapp/api:1.0.0-beta.2')"
[[ "${got}" == 'ghcr.io/okkeyapp/api' ]] || {
  echo "FAIL: image_ref_repository simple: [${got}]" >&2
  exit 1
}
got="$(image_ref_repository 'localhost:5000/okkey/api:dev')"
[[ "${got}" == 'localhost:5000/okkey/api' ]] || {
  echo "FAIL: image_ref_repository registry:port: [${got}]" >&2
  exit 1
}

# --- replace_env: ampersand and other sed-sensitive chars ---
printf 'OKKEY_SALES_EMAIL=\nOTHER=1\n' > .env
replace_env OKKEY_SALES_EMAIL 'sales&co@corp.example'
got="$(grep -E '^OKKEY_SALES_EMAIL=' .env | cut -d= -f2-)"
[[ "${got}" == 'sales&co@corp.example' ]] || {
  echo "FAIL: ampersand email rewritten incorrectly: [${got}]" >&2
  exit 1
}
grep -Eq '^OTHER=1$' .env || {
  echo "FAIL: neighboring .env keys corrupted" >&2
  exit 1
}

replace_env OKKEY_SALES_EMAIL 'a|b\c@corp.example'
got="$(grep -E '^OKKEY_SALES_EMAIL=' .env | cut -d= -f2-)"
[[ "${got}" == 'a|b\c@corp.example' ]] || {
  echo "FAIL: pipe/backslash email rewritten incorrectly: [${got}]" >&2
  exit 1
}

# Append when missing
rm -f .env
printf 'FOO=1\n' > .env
replace_env OKKEY_SALES_EMAIL 'new@corp.example'
grep -Eq '^OKKEY_SALES_EMAIL=new@corp.example$' .env || {
  echo "FAIL: append path missing key" >&2
  exit 1
}

# --- tty_usable is callable (presence); openability depends on the host ---
if ! declare -F tty_usable >/dev/null; then
  echo "FAIL: tty_usable not defined" >&2
  exit 1
fi
# Must not crash when /dev/tty is missing or unusable.
tty_usable || true

echo "OK: env-file helpers"
