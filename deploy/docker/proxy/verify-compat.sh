#!/usr/bin/env bash
# Live verify: default host rejects classical-only; optional compat host accepts classical.
# Client OpenSSL must be ≥ 3.5.
set -euo pipefail

STRICT_HOST="${1:-${OKKEY_WEB_HOST:-app.example.com}}"
STRICT_PORT="${2:-${OKKEY_PROXY_HTTPS_PORT:-443}}"
COMPAT_HOST="${3:-${OKKEY_COMPAT_WEB_HOST:-}}"
COMPAT_PORT="${4:-${STRICT_PORT}}"

echo "==> openssl version (need ≥ 3.5)"
openssl version
if ! openssl list -tls-groups 2>/dev/null | grep -q 'X25519MLKEM768'; then
  echo "ERROR: this openssl does not list X25519MLKEM768 — install OpenSSL ≥ 3.5" >&2
  exit 1
fi

echo "==> strict ${STRICT_HOST}:${STRICT_PORT} — hybrid X25519MLKEM768 must succeed"
HYBRID_OUT="$(openssl s_client \
  -connect "${STRICT_HOST}:${STRICT_PORT}" \
  -servername "${STRICT_HOST}" \
  -tls1_3 \
  -groups X25519MLKEM768 \
  </dev/null 2>&1 || true)"
echo "${HYBRID_OUT}" | grep -E 'Protocol|Negotiated|group|Group|Cipher|VERIFY' || true
echo "${HYBRID_OUT}" | grep -Eqi 'X25519MLKEM768' \
  || { echo "ERROR: strict listener did not negotiate X25519MLKEM768" >&2; exit 1; }

echo "==> strict ${STRICT_HOST}:${STRICT_PORT} — classical-only X25519 must fail"
CLASSICAL_OUT="$(openssl s_client \
  -connect "${STRICT_HOST}:${STRICT_PORT}" \
  -servername "${STRICT_HOST}" \
  -tls1_3 \
  -groups X25519 \
  </dev/null 2>&1 || true)"
if echo "${CLASSICAL_OUT}" | grep -Eqi 'Verify return code: 0|Negotiated TLS1.3 group: X25519[[:space:]]*$'; then
  # Accept only if handshake clearly completed with classical X25519 (not hybrid).
  if echo "${CLASSICAL_OUT}" | grep -Eqi 'Negotiated TLS1.3 group: X25519[^M]'; then
    echo "ERROR: strict listener accepted classical-only X25519 (silent downgrade)" >&2
    exit 1
  fi
fi
if echo "${CLASSICAL_OUT}" | grep -Eqi 'X25519MLKEM768'; then
  echo "ERROR: unexpected hybrid negotiate when client offered only X25519" >&2
  exit 1
fi
# Handshake should fail (no shared group) or not show a successful classical group.
if echo "${CLASSICAL_OUT}" | grep -Eqi 'Negotiated TLS1.3 group:'; then
  NEG="$(echo "${CLASSICAL_OUT}" | grep -Ei 'Negotiated TLS1.3 group:' | head -1)"
  echo "ERROR: strict listener negotiated a group with classical-only client: ${NEG}" >&2
  exit 1
fi
echo "classical-only rejected on strict host (expected)."

if [[ -z "${COMPAT_HOST}" ]]; then
  echo "OK: strict isolation verified (compat host not supplied — skip compat positive path)"
  echo "    Enable compat and re-run: $0 <strict-host> <port> <compat-host> [compat-port]"
  exit 0
fi

echo "==> compat ${COMPAT_HOST}:${COMPAT_PORT} — classical X25519 must succeed"
COMPAT_OUT="$(openssl s_client \
  -connect "${COMPAT_HOST}:${COMPAT_PORT}" \
  -servername "${COMPAT_HOST}" \
  -tls1_3 \
  -groups X25519 \
  </dev/null 2>&1 || true)"
echo "${COMPAT_OUT}" | grep -E 'Protocol|Negotiated|group|Group|Cipher|VERIFY|X-Okkey' || true
echo "${COMPAT_OUT}" | grep -Eqi 'Negotiated TLS1.3 group: X25519' \
  || { echo "ERROR: compat listener did not negotiate classical X25519" >&2; exit 1; }
if echo "${COMPAT_OUT}" | grep -Eqi 'X25519MLKEM768'; then
  echo "ERROR: compat listener negotiated hybrid (must be classical-only)" >&2
  exit 1
fi

echo "OK: strict rejects classical-only; compat host ${COMPAT_HOST} accepts classical X25519"
