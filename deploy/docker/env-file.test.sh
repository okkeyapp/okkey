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

eval "$(extract_fn replace_env)"
eval "$(extract_fn tty_usable)"

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
