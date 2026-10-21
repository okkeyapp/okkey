#!/usr/bin/env bash
# Static review: classical-only compat listeners are explicit / isolated / time-boxed,
# and the default route stays hybrid-only (no silent downgrade).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
STRICT="${ROOT}/nginx/conf.d/okkey.conf.template"
COMPAT="${ROOT}/nginx/conf.d/okkey-compat.conf.template"
ENTRY="${ROOT}/nginx/docker-entrypoint.sh"
COMPAT_ENV="${ROOT}/compat.env.example"
COMPOSE="${ROOT}/docker-compose.proxy.yml"

fail() { echo "ERROR: $*" >&2; exit 1; }

echo "==> default (strict) template: ${STRICT}"
[[ -f "${STRICT}" ]] || fail "missing strict template"
grep -q 'ssl_protocols TLSv1.3;' "${STRICT}" \
  || fail "strict template must set ssl_protocols TLSv1.3 only"
grep -q 'ssl_ecdh_curve X25519MLKEM768;' "${STRICT}" \
  || fail "strict template must set ssl_ecdh_curve X25519MLKEM768"
if grep -Eiq 'ssl_protocols[[:space:]]+.*TLSv1\.[012]' "${STRICT}"; then
  fail "strict template must not enable TLS ≤ 1.2"
fi
CURVE_LINE="$(grep -E 'ssl_ecdh_curve' "${STRICT}" | head -1)"
echo "${CURVE_LINE}" | grep -Eq 'ssl_ecdh_curve[[:space:]]+X25519MLKEM768[[:space:]]*;' \
  || fail "strict ssl_ecdh_curve is not hybrid-only: ${CURVE_LINE}"

echo "==> compat template: ${COMPAT}"
[[ -f "${COMPAT}" ]] || fail "missing compat template"
grep -q 'ssl_ecdh_curve X25519;' "${COMPAT}" \
  || fail "compat template must set classical ssl_ecdh_curve X25519"
# Active ssl_ecdh_curve lines only (ignore comments)
if grep -E '^[[:space:]]*ssl_ecdh_curve' "${COMPAT}" | grep -Eqi 'X25519MLKEM768|P-256|P-384'; then
  fail "compat template ssl_ecdh_curve must be classical X25519 only"
fi
COMPAT_CURVE="$(grep -E '^[[:space:]]*ssl_ecdh_curve' "${COMPAT}" | head -1)"
echo "${COMPAT_CURVE}" | grep -Eq 'ssl_ecdh_curve[[:space:]]+X25519[[:space:]]*;' \
  || fail "compat ssl_ecdh_curve is not classical-only X25519: ${COMPAT_CURVE}"
grep -Eq 'ssl_protocols[[:space:]]+TLSv1\.2[[:space:]]+TLSv1\.3;' "${COMPAT}" \
  || fail "compat template should allow TLSv1.2 TLSv1.3 for classical clients"
grep -q 'OKKEY_COMPAT_WEB_HOST' "${COMPAT}" \
  || fail "compat template must use OKKEY_COMPAT_WEB_HOST (isolation)"
grep -q 'OKKEY_COMPAT_API_HOST' "${COMPAT}" \
  || fail "compat template must use OKKEY_COMPAT_API_HOST (isolation)"
# Must not bind default host vars as server_name on compat servers
if grep -E 'server_name[[:space:]]+\$\{OKKEY_(WEB|API)_HOST\}' "${COMPAT}"; then
  fail "compat template must not use default OKKEY_WEB_HOST/API_HOST as server_name"
fi

echo "==> entrypoint gates: ${ENTRY}"
[[ -x "${ENTRY}" ]] || fail "entrypoint missing or not executable"
grep -q 'OKKEY_COMPAT_ENABLED' "${ENTRY}" || fail "entrypoint must gate on OKKEY_COMPAT_ENABLED"
grep -q 'OKKEY_COMPAT_SUNSET' "${ENTRY}" || fail "entrypoint must require sunset"
grep -q 'OKKEY_COMPAT_OWNER' "${ENTRY}" || fail "entrypoint must require owner"
grep -q 'compat hosts must be isolated' "${ENTRY}" \
  || fail "entrypoint must refuse host collision with strict defaults"

echo "==> compose defaults compat off"
grep -q 'OKKEY_COMPAT_ENABLED: \${OKKEY_COMPAT_ENABLED:-0}' "${COMPOSE}" \
  || fail "compose must default OKKEY_COMPAT_ENABLED to 0"

echo "==> compat.env.example documents opt-in"
[[ -f "${COMPAT_ENV}" ]] || fail "missing compat.env.example"
grep -q 'OKKEY_COMPAT_ENABLED=0' "${COMPAT_ENV}" \
  || fail "compat.env.example must default ENABLED=0"

echo "OK: default route hybrid-only; compat classical listeners are explicit/isolated/time-boxed"
