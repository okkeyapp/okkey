#!/usr/bin/env bash
# Static review: SaaS stage+prod overlays + shared nginx template enforce
# hybrid-only TLS (no silent classical downgrade on the default route).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="${ROOT}/../../docker/proxy/nginx/conf.d/okkey.conf.template"
STAGE_ENV="${ROOT}/overlays/stage.env.example"
PROD_ENV="${ROOT}/overlays/prod.env.example"
COMPAT_ENV="${ROOT}/overlays/compat.env.example"
COMPOSE="${ROOT}/docker-compose.edge.yml"
PROXY_POLICY="${ROOT}/../../docker/proxy/policy-compat.sh"

fail() { echo "ERROR: $*" >&2; exit 1; }

echo "==> shared nginx site template: ${TEMPLATE}"
[[ -f "${TEMPLATE}" ]] || fail "missing shared template (self-host q3-2 image)"

grep -q 'ssl_protocols TLSv1.3;' "${TEMPLATE}" \
  || fail "template must set ssl_protocols TLSv1.3 only"
grep -q 'ssl_ecdh_curve X25519MLKEM768;' "${TEMPLATE}" \
  || fail "template must set ssl_ecdh_curve X25519MLKEM768"

# Classical / multi-group lists that would allow silent downgrade
if grep -Eiq 'ssl_ecdh_curve[[:space:]]+[^;]*(X25519|P-256|P-384|secp256|prime256)' "${TEMPLATE}"; then
  # X25519MLKEM768 contains the substring X25519 — allow only the hybrid token alone
  CURVE_LINE="$(grep -E 'ssl_ecdh_curve' "${TEMPLATE}" | head -1)"
  if ! echo "${CURVE_LINE}" | grep -Eq 'ssl_ecdh_curve[[:space:]]+X25519MLKEM768[[:space:]]*;'; then
    fail "template ssl_ecdh_curve is not hybrid-only: ${CURVE_LINE}"
  fi
fi

if grep -Eiq 'ssl_protocols[[:space:]]+.*TLSv1\.[012]' "${TEMPLATE}"; then
  fail "template must not enable TLS ≤ 1.2"
fi

echo "==> compose must not mount an alternate site conf"
if grep -E 'conf\.d|okkey\.conf' "${COMPOSE}" | grep -v '^#' | grep -Eq 'volumes:|/etc/nginx'; then
  # only certs volume is allowed
  if grep -A20 '^[[:space:]]*volumes:' "${COMPOSE}" | grep -Ev 'certs|/etc/nginx/certs' | grep -Eq '/etc/nginx'; then
    fail "compose mounts nginx conf that could override hybrid-only policy"
  fi
fi

echo "==> stage + prod env examples: no curve/protocol overrides"
for f in "${STAGE_ENV}" "${PROD_ENV}"; do
  [[ -f "${f}" ]] || fail "missing ${f}"
  # Ignore comments; only active KEY= assignments may not set TLS knobs.
  if grep -Eiv '^[[:space:]]*#' "${f}" | grep -Eiq \
    'ssl_ecdh_curve|ssl_protocols|SSL_ECDH|TLS_GROUP|CURVE|ssl_ciphers'; then
    fail "${f} must not override TLS curve/protocol (policy is image-baked)"
  fi
  grep -q 'OKKEY_WEB_HOST=' "${f}" || fail "${f} missing OKKEY_WEB_HOST"
  grep -q 'OKKEY_API_HOST=' "${f}" || fail "${f} missing OKKEY_API_HOST"
done

grep -q 'OKKEY_SAAS_ENV=stage' "${STAGE_ENV}" || fail "stage.env.example must set OKKEY_SAAS_ENV=stage"
grep -q 'OKKEY_SAAS_ENV=prod' "${PROD_ENV}" || fail "prod.env.example must set OKKEY_SAAS_ENV=prod"

echo "==> stage/prod examples must not enable compat by default"
for f in "${STAGE_ENV}" "${PROD_ENV}"; do
  if grep -Eiv '^[[:space:]]*#' "${f}" | grep -Eq '^[[:space:]]*OKKEY_COMPAT_ENABLED=1'; then
    fail "${f} must not set OKKEY_COMPAT_ENABLED=1 (compat is opt-in via compat.env.example)"
  fi
done

echo "==> compat overlay example defaults off"
[[ -f "${COMPAT_ENV}" ]] || fail "missing ${COMPAT_ENV}"
grep -q 'OKKEY_COMPAT_ENABLED=0' "${COMPAT_ENV}" \
  || fail "compat.env.example must default OKKEY_COMPAT_ENABLED=0"

grep -q 'OKKEY_COMPAT_ENABLED: \${OKKEY_COMPAT_ENABLED:-0}' "${COMPOSE}" \
  || fail "edge compose must default OKKEY_COMPAT_ENABLED to 0"

echo "==> shared proxy compat policy (isolation / sunset gates)"
[[ -x "${PROXY_POLICY}" ]] || fail "missing ${PROXY_POLICY}"
"${PROXY_POLICY}"

echo "OK: stage+prod SaaS edge configs share hybrid-only X25519MLKEM768 / TLS 1.3 policy"
echo "OK: prod overlay reviewed — no silent downgrade knobs in env examples"
echo "OK: compat classical listeners remain explicit/isolated/time-boxed (off by default)"
