#!/usr/bin/env bash
# Verify SaaS default edge listener negotiates X25519MLKEM768 (TLS 1.3 only).
# Client OpenSSL must be ≥ 3.5 to offer/display the hybrid group.
set -euo pipefail

HOST="${1:-${OKKEY_WEB_HOST:-app.stage.okkey.app}}"
PORT="${2:-${OKKEY_PROXY_HTTPS_PORT:-443}}"

echo "==> openssl version (need ≥ 3.5 on the client for hybrid group)"
openssl version

if ! openssl list -tls-groups 2>/dev/null | grep -q 'X25519MLKEM768'; then
  echo "ERROR: this openssl does not list X25519MLKEM768 — install OpenSSL ≥ 3.5" >&2
  exit 1
fi

echo "==> TLS 1.3 handshake → expect Negotiated TLS1.3 group: X25519MLKEM768"
OUT="$(openssl s_client \
  -connect "${HOST}:${PORT}" \
  -servername "${HOST}" \
  -tls1_3 \
  -groups X25519MLKEM768 \
  </dev/null 2>&1 || true)"

echo "$OUT" | grep -E 'Protocol|Negotiated|group|Group|Cipher|VERIFY' || true

if ! echo "$OUT" | grep -Eqi 'X25519MLKEM768'; then
  echo "ERROR: negotiated group is not X25519MLKEM768" >&2
  exit 1
fi

echo "==> TLS ≤ 1.2 must fail on the default (strict) listener"
if curl -fsSI --tls-max 1.2 "https://${HOST}:${PORT}/" >/dev/null 2>&1; then
  echo "ERROR: TLS 1.2 unexpectedly succeeded on default listener" >&2
  exit 1
fi
echo "TLS 1.2 rejected (expected)."

echo "OK: ${HOST}:${PORT} advertises hybrid group X25519MLKEM768 under TLS 1.3"
echo "Capture the Protocol/Negotiated lines above for stage evidence (q3-5)."
