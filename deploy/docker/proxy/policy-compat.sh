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
COMPOSE_COMPAT="${ROOT}/docker-compose.compat.yml"
EDGE_COMPOSE="${ROOT}/../../saas/edge/docker-compose.edge.yml"
EDGE_COMPAT="${ROOT}/../../saas/edge/docker-compose.compat.yml"

fail() { echo "ERROR: $*" >&2; exit 1; }

echo "==> default (strict) template: ${STRICT}"
[[ -f "${STRICT}" ]] || fail "missing strict template"
grep -q 'ssl_protocols TLSv1.3;' "${STRICT}" \
  || fail "strict template must set ssl_protocols TLSv1.3 only"
# N5: every active ssl_ecdh_curve (web + API) must be hybrid-only
while IFS= read -r CURVE_LINE; do
  echo "${CURVE_LINE}" | grep -Eq 'ssl_ecdh_curve[[:space:]]+X25519MLKEM768[[:space:]]*;' \
    || fail "strict ssl_ecdh_curve is not hybrid-only: ${CURVE_LINE}"
done < <(grep -E '^[[:space:]]*ssl_ecdh_curve' "${STRICT}")
STRICT_CURVE_COUNT="$(grep -cE '^[[:space:]]*ssl_ecdh_curve' "${STRICT}" || true)"
[[ "${STRICT_CURVE_COUNT}" -ge 2 ]] \
  || fail "strict template must set ssl_ecdh_curve on both web and API blocks (found ${STRICT_CURVE_COUNT})"
if grep -Eiq 'ssl_protocols[[:space:]]+.*TLSv1\.[012]' "${STRICT}"; then
  fail "strict template must not enable TLS ≤ 1.2"
fi

echo "==> compat template: ${COMPAT}"
[[ -f "${COMPAT}" ]] || fail "missing compat template"
# N5: every active compat ssl_ecdh_curve must be classical X25519 only
while IFS= read -r CURVE_LINE; do
  echo "${CURVE_LINE}" | grep -Eq 'ssl_ecdh_curve[[:space:]]+X25519[[:space:]]*;' \
    || fail "compat ssl_ecdh_curve is not classical-only X25519: ${CURVE_LINE}"
  echo "${CURVE_LINE}" | grep -Eqi 'X25519MLKEM768|P-256|P-384' \
    && fail "compat ssl_ecdh_curve must not list hybrid/P-curve: ${CURVE_LINE}"
done < <(grep -E '^[[:space:]]*ssl_ecdh_curve' "${COMPAT}")
COMPAT_CURVE_COUNT="$(grep -cE '^[[:space:]]*ssl_ecdh_curve' "${COMPAT}" || true)"
[[ "${COMPAT_CURVE_COUNT}" -ge 2 ]] \
  || fail "compat template must set ssl_ecdh_curve on both web and API blocks"
grep -Eq 'ssl_protocols[[:space:]]+TLSv1\.2[[:space:]]+TLSv1\.3;' "${COMPAT}" \
  || fail "compat template should allow TLSv1.2 TLSv1.3 for classical clients"
# N2: ECDHE AEAD ciphers required
grep -Eq '^[[:space:]]*ssl_ciphers[[:space:]]+.*ECDHE-.*GCM' "${COMPAT}" \
  || fail "compat template must set ssl_ciphers ECDHE+AEAD for TLS 1.2 (N2)"
if grep -E '^[[:space:]]*ssl_ciphers' "${COMPAT}" | grep -Eqi 'SHA1|:RC4|:DES|AES128-SHA[^2]|AES256-SHA[^2]'; then
  fail "compat ssl_ciphers must not include static RSA / CBC-SHA1 suites"
fi
grep -q 'OKKEY_COMPAT_WEB_HOST' "${COMPAT}" \
  || fail "compat template must use OKKEY_COMPAT_WEB_HOST (isolation)"
grep -q 'OKKEY_COMPAT_API_HOST' "${COMPAT}" \
  || fail "compat template must use OKKEY_COMPAT_API_HOST (isolation)"
if grep -E 'server_name[[:space:]]+\$\{OKKEY_(WEB|API)_HOST\}' "${COMPAT}"; then
  fail "compat template must not use default OKKEY_WEB_HOST/API_HOST as server_name"
fi
grep -q 'compat-fullchain.pem' "${COMPAT}" \
  || fail "compat template must use dedicated compat-fullchain.pem"
grep -q 'compat-privkey.pem' "${COMPAT}" \
  || fail "compat template must use dedicated compat-privkey.pem"
if grep -E '^[[:space:]]*ssl_certificate' "${COMPAT}" | grep -Eq '/etc/nginx/certs/fullchain\.pem'; then
  fail "compat template must NOT reuse fullchain.pem"
fi
grep -q 'OKKEY_COMPAT_HTTPS_PORT' "${COMPAT}" \
  || fail "compat template must listen on OKKEY_COMPAT_HTTPS_PORT (not shared :443)"
if grep -E '^[[:space:]]*listen' "${COMPAT}" | grep -Eq '[[:space:]]443[[:space:]]'; then
  fail "compat template must not listen on 443 (shares default SSL_CTX / key_share)"
fi
# N1: catch-all default_server + ssl_reject_handshake on compat port
grep -Eq 'listen[[:space:]]+\$\{OKKEY_COMPAT_HTTPS_PORT\}[[:space:]]+ssl[[:space:]]+default_server' "${COMPAT}" \
  || fail "compat template must mark default_server on compat port (N1 catch-all)"
grep -q 'ssl_reject_handshake on;' "${COMPAT}" \
  || fail "compat template must ssl_reject_handshake on catch-all (N1)"
grep -q 'return 421' "${COMPAT}" \
  || fail "compat template must return 421 for foreign Host (N1)"

echo "==> strict template marks default_server on :443"
grep -Eq 'listen[[:space:]]+443[[:space:]]+ssl[[:space:]]+default_server' "${STRICT}" \
  || fail "strict template must set default_server on 443 ssl (own the hybrid SSL_CTX)"

echo "==> entrypoint gates: ${ENTRY}"
[[ -x "${ENTRY}" ]] || fail "entrypoint missing or not executable"
grep -q 'OKKEY_COMPAT_ENABLED' "${ENTRY}" || fail "entrypoint must gate on OKKEY_COMPAT_ENABLED"
grep -q 'OKKEY_COMPAT_SUNSET' "${ENTRY}" || fail "entrypoint must require sunset"
grep -q 'OKKEY_COMPAT_OWNER' "${ENTRY}" || fail "entrypoint must require owner"
grep -q 'compat hosts must be isolated' "${ENTRY}" \
  || fail "entrypoint must refuse host collision with strict defaults"
grep -q 'compat-fullchain.pem' "${ENTRY}" \
  || fail "entrypoint must require dedicated compat-fullchain.pem when compat enabled"
grep -q 'OKKEY_COMPAT_HTTPS_PORT' "${ENTRY}" \
  || fail "entrypoint must set/validate OKKEY_COMPAT_HTTPS_PORT"
grep -q 'must not be 443' "${ENTRY}" \
  || fail "entrypoint must refuse compat listen port 443"

echo "==> compose defaults compat off; N8 no 8443 on base overlay"
grep -q 'OKKEY_COMPAT_ENABLED: \${OKKEY_COMPAT_ENABLED:-0}' "${COMPOSE}" \
  || fail "compose must default OKKEY_COMPAT_ENABLED to 0"
if grep -E '^[[:space:]]*-' "${COMPOSE}" | grep -Eq '8443|COMPAT_HTTPS'; then
  fail "base docker-compose.proxy.yml must NOT publish compat port 8443 when compat=0 (N8)"
fi
[[ -f "${COMPOSE_COMPAT}" ]] || fail "missing docker-compose.compat.yml (N8 publish overlay)"
grep -Eq '8443|COMPAT_HTTPS_PORT' "${COMPOSE_COMPAT}" \
  || fail "docker-compose.compat.yml must publish OKKEY_COMPAT_HTTPS_PORT"
if [[ -f "${EDGE_COMPOSE}" ]]; then
  if grep -E '^[[:space:]]*-' "${EDGE_COMPOSE}" | grep -Eq '8443|COMPAT_HTTPS'; then
    fail "base saas edge compose must NOT publish compat port when compat=0 (N8)"
  fi
  [[ -f "${EDGE_COMPAT}" ]] || fail "missing saas edge docker-compose.compat.yml (N8)"
fi

echo "==> compat.env.example documents opt-in"
[[ -f "${COMPAT_ENV}" ]] || fail "missing compat.env.example"
grep -q 'OKKEY_COMPAT_ENABLED=0' "${COMPAT_ENV}" \
  || fail "compat.env.example must default ENABLED=0"
grep -q 'OKKEY_COMPAT_HTTPS_PORT=8443' "${COMPAT_ENV}" \
  || fail "compat.env.example must document dedicated port 8443"
grep -Eq 'docker-compose\.compat\.yml|compose\.compat' "${COMPAT_ENV}" \
  || fail "compat.env.example must document docker-compose.compat.yml overlay (N8)"

echo "OK: default route hybrid-only; compat classical listeners are explicit/isolated/time-boxed"
