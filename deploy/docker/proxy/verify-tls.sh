#!/usr/bin/env bash
# Verify default edge listener negotiates X25519MLKEM768 (TLS 1.3 only).
# Client OpenSSL must be ≥ 3.5 to offer/display the hybrid group.
# N4/N6: assert handshake failure via openssl s_client (not curl -f alone);
# also reject classical-only X25519 on the strict listener.
set -euo pipefail

HOST="${1:-${OKKEY_WEB_HOST:-app.example.com}}"
PORT="${2:-${OKKEY_PROXY_HTTPS_PORT:-443}}"

echo "==> openssl version (need ≥ 3.5 on the client for hybrid group)"
command -v openssl >/dev/null 2>&1 || { echo "ERROR: openssl not found (required)" >&2; exit 1; }
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

if ! echo "$OUT" | grep -Eqi 'Negotiated TLS1\.3 group:[[:space:]]*X25519MLKEM768'; then
  echo "ERROR: negotiated group is not X25519MLKEM768" >&2
  exit 1
fi
if ! echo "$OUT" | grep -Eqi 'Cipher is TLS_'; then
  echo "ERROR: hybrid handshake did not complete a TLS cipher" >&2
  exit 1
fi

echo "==> classical-only X25519 must fail on the default (strict) listener (N6)"
CLASSICAL_OUT="$(openssl s_client \
  -connect "${HOST}:${PORT}" \
  -servername "${HOST}" \
  -tls1_3 \
  -groups X25519 \
  </dev/null 2>&1 || true)"
if echo "${CLASSICAL_OUT}" | grep -Eqi 'Negotiated TLS1\.3 group:[[:space:]]*X25519[[:space:]]*$'; then
  echo "ERROR: strict listener negotiated classical X25519" >&2
  exit 1
fi
if echo "${CLASSICAL_OUT}" | grep -Eqi 'Cipher is TLS_'; then
  echo "ERROR: strict listener completed classical-only handshake" >&2
  exit 1
fi
echo "classical-only rejected (expected)."

echo "==> TLS ≤ 1.2 must fail on the default (strict) listener (N4 — openssl, not curl alone)"
TLS12_OUT="$(openssl s_client \
  -connect "${HOST}:${PORT}" \
  -servername "${HOST}" \
  -tls1_2 \
  </dev/null 2>&1 || true)"
echo "${TLS12_OUT}" | grep -E 'Protocol|Cipher|error|alert|VERIFY' || true
if echo "${TLS12_OUT}" | grep -Eqi 'Cipher is (ECDHE|TLS_|AES|CHACHA)' \
  && ! echo "${TLS12_OUT}" | grep -Eqi 'Cipher is \(NONE\)|Cipher[[:space:]]*:[[:space:]]*0000'; then
  # Completed TLS 1.2 with a real cipher = fail
  if echo "${TLS12_OUT}" | grep -Eqi 'Protocol[[:space:]]*:[[:space:]]*TLSv1\.2' \
    && echo "${TLS12_OUT}" | grep -Eqi 'Cipher is ECDHE|Cipher is TLS_|Cipher[[:space:]]*:[[:space:]]*ECDHE'; then
    echo "ERROR: TLS 1.2 unexpectedly succeeded on default listener" >&2
    exit 1
  fi
fi
# Must not show a negotiated non-0000 cipher under TLS 1.2
if echo "${TLS12_OUT}" | grep -Eqi 'Protocol[[:space:]]*:[[:space:]]*TLSv1\.2' \
  && echo "${TLS12_OUT}" | grep -Eqi 'Cipher is ECDHE-RSA-|Cipher is ECDHE-ECDSA-|Cipher is AES'; then
  echo "ERROR: TLS 1.2 handshake completed on strict listener" >&2
  exit 1
fi
echo "TLS 1.2 rejected (expected)."

echo "OK: ${HOST}:${PORT} advertises hybrid group X25519MLKEM768 under TLS 1.3"
