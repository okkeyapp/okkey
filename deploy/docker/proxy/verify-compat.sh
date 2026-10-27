#!/usr/bin/env bash
# Live verify: default host rejects classical-only; optional compat host accepts classical.
# When compat is enabled, re-assert that the *strict* host still negotiates hybrid only
# (negative test for SSL_CTX / listen-socket bleed).
# Client OpenSSL must be ≥ 3.5.
#
# Usage:
#   ./verify-compat.sh <strict-host> [strict-port] [compat-host] [compat-port]
# compat-port defaults to OKKEY_COMPAT_HTTPS_PORT / 8443 (must differ from strict :443).
set -euo pipefail

STRICT_HOST="${1:-${OKKEY_WEB_HOST:-app.example.com}}"
STRICT_PORT="${2:-${OKKEY_PROXY_HTTPS_PORT:-443}}"
COMPAT_HOST="${3:-${OKKEY_COMPAT_WEB_HOST:-}}"
COMPAT_PORT="${4:-${OKKEY_COMPAT_HTTPS_PORT:-8443}}"

echo "==> openssl version (need ≥ 3.5)"
openssl version
if ! openssl list -tls-groups 2>/dev/null | grep -q 'X25519MLKEM768'; then
  echo "ERROR: this openssl does not list X25519MLKEM768 — install OpenSSL ≥ 3.5" >&2
  exit 1
fi

assert_negotiated_group() {
  local label="$1"
  local out="$2"
  local expect="$3"
  local line peer
  line="$(echo "${out}" | grep -Ei 'Negotiated TLS1\.3 group:' | head -1 || true)"
  peer="$(echo "${out}" | grep -Ei 'Peer Temp Key:' | head -1 || true)"
  if [[ "${expect}" = "X25519MLKEM768" ]]; then
    if [[ -z "${line}" ]]; then
      echo "ERROR: ${label}: missing 'Negotiated TLS1.3 group:' line" >&2
      echo "${out}" | grep -Ei 'Protocol|Cipher|VERIFY|error|alert|group|Peer Temp' || true
      exit 1
    fi
    echo "${label}: ${line}"
    echo "${line}" | grep -Eqi 'Negotiated TLS1\.3 group:[[:space:]]*X25519MLKEM768[[:space:]]*$' \
      || { echo "ERROR: ${label}: expected X25519MLKEM768, got: ${line}" >&2; exit 1; }
  elif [[ "${expect}" = "X25519" ]]; then
    # OpenSSL 3.5 prints "Negotiated TLS1.3 group: X25519" for some builds and
    # "Peer Temp Key: X25519, 253 bits" for others — accept either classical signal.
    echo "${label}: ${line:-"(no Negotiated line)"} / ${peer:-"(no Peer Temp Key)"}"
    if echo "${out}" | grep -Eqi 'X25519MLKEM768'; then
      echo "ERROR: ${label}: hybrid leaked into classical expect" >&2
      exit 1
    fi
    if echo "${line}" | grep -Eqi 'Negotiated TLS1\.3 group:[[:space:]]*X25519[[:space:]]*$'; then
      return 0
    fi
    if echo "${peer}" | grep -Eqi 'Peer Temp Key:[[:space:]]*X25519[[:space:]]*,'; then
      echo "${out}" | grep -Eqi 'Cipher is TLS_' \
        || { echo "ERROR: ${label}: Peer Temp Key X25519 but handshake incomplete" >&2; exit 1; }
      return 0
    fi
    echo "ERROR: ${label}: expected classical X25519 (Negotiated group or Peer Temp Key)" >&2
    echo "${out}" | grep -Ei 'Protocol|Cipher|VERIFY|error|alert|group|Peer Temp' || true
    exit 1
  else
    echo "ERROR: unknown expect group ${expect}" >&2
    exit 1
  fi
}

echo "==> strict ${STRICT_HOST}:${STRICT_PORT} — hybrid X25519MLKEM768 must succeed"
HYBRID_OUT="$(openssl s_client \
  -connect "${STRICT_HOST}:${STRICT_PORT}" \
  -servername "${STRICT_HOST}" \
  -tls1_3 \
  -groups X25519MLKEM768 \
  </dev/null 2>&1 || true)"
echo "${HYBRID_OUT}" | grep -E 'Protocol|Negotiated|group|Group|Cipher|VERIFY' || true
assert_negotiated_group "strict/hybrid" "${HYBRID_OUT}" "X25519MLKEM768"

echo "==> strict ${STRICT_HOST}:${STRICT_PORT} — classical-only X25519 must fail (no silent downgrade)"
CLASSICAL_OUT="$(openssl s_client \
  -connect "${STRICT_HOST}:${STRICT_PORT}" \
  -servername "${STRICT_HOST}" \
  -tls1_3 \
  -groups X25519 \
  </dev/null 2>&1 || true)"
if echo "${CLASSICAL_OUT}" | grep -Eqi 'Negotiated TLS1\.3 group:[[:space:]]*X25519[[:space:]]*$'; then
  NEG="$(echo "${CLASSICAL_OUT}" | grep -Ei 'Negotiated TLS1\.3 group:' | head -1)"
  echo "ERROR: strict listener negotiated classical X25519: ${NEG}" >&2
  exit 1
fi
if echo "${CLASSICAL_OUT}" | grep -Eqi 'Cipher is TLS_'; then
  echo "ERROR: strict listener completed classical-only handshake" >&2
  exit 1
fi
echo "classical-only rejected on strict host (expected)."

echo "==> strict ${STRICT_HOST}:${STRICT_PORT} — TLS 1.2 must fail"
if curl -fsSk --tls-max 1.2 --connect-timeout 5 "https://${STRICT_HOST}:${STRICT_PORT}/" >/dev/null 2>&1; then
  echo "ERROR: TLS 1.2 unexpectedly succeeded on strict host" >&2
  exit 1
fi
echo "TLS 1.2 rejected on strict host (expected)."

if [[ -z "${COMPAT_HOST}" ]]; then
  echo "OK: strict isolation verified (compat host not supplied — skip compat positive path)"
  echo "    Enable compat and re-run: $0 <strict-host> <strict-port> <compat-host> [compat-port]"
  exit 0
fi

if [[ "${COMPAT_PORT}" = "${STRICT_PORT}" ]] || [[ "${COMPAT_PORT}" = "443" && "${STRICT_PORT}" = "443" ]]; then
  echo "ERROR: compat port (${COMPAT_PORT}) must differ from strict port (${STRICT_PORT}) / not share 443" >&2
  exit 1
fi

echo "==> compat ${COMPAT_HOST}:${COMPAT_PORT} — classical X25519 (TLS 1.3) must succeed"
COMPAT_OUT="$(openssl s_client \
  -connect "${COMPAT_HOST}:${COMPAT_PORT}" \
  -servername "${COMPAT_HOST}" \
  -tls1_3 \
  -groups X25519 \
  </dev/null 2>&1 || true)"
echo "${COMPAT_OUT}" | grep -E 'Protocol|Negotiated|group|Group|Cipher|VERIFY|X-Okkey' || true
assert_negotiated_group "compat/classical-tls13" "${COMPAT_OUT}" "X25519"
if echo "${COMPAT_OUT}" | grep -Eqi 'X25519MLKEM768'; then
  echo "ERROR: compat listener negotiated hybrid (must be classical-only)" >&2
  exit 1
fi

echo "==> compat ${COMPAT_HOST}:${COMPAT_PORT} — TLS 1.2 must succeed (compat purpose)"
COMPAT12_OUT="$(openssl s_client \
  -connect "${COMPAT_HOST}:${COMPAT_PORT}" \
  -servername "${COMPAT_HOST}" \
  -tls1_2 \
  -groups X25519 \
  </dev/null 2>&1 || true)"
echo "${COMPAT12_OUT}" | grep -E 'Protocol|Cipher|VERIFY|group|Group|error|alert' || true
echo "${COMPAT12_OUT}" | grep -Eqi 'Protocol[[:space:]]*:[[:space:]]*TLSv1\.2' \
  || { echo "ERROR: compat listener did not complete TLS 1.2 handshake" >&2; exit 1; }
if echo "${COMPAT12_OUT}" | grep -Eqi 'Protocol[[:space:]]*:[[:space:]]*TLSv1\.3'; then
  echo "ERROR: expected TLS 1.2 on compat, got TLS 1.3" >&2
  exit 1
fi
echo "TLS 1.2 accepted on compat host (expected)."

echo "==> negative (compat enabled): strict ${STRICT_HOST}:${STRICT_PORT} still hybrid-only"
CLASSICAL2_OUT="$(openssl s_client \
  -connect "${STRICT_HOST}:${STRICT_PORT}" \
  -servername "${STRICT_HOST}" \
  -tls1_3 \
  -groups X25519 \
  </dev/null 2>&1 || true)"
if echo "${CLASSICAL2_OUT}" | grep -Eqi 'Negotiated TLS1\.3 group:[[:space:]]*X25519[[:space:]]*$'; then
  NEG="$(echo "${CLASSICAL2_OUT}" | grep -Ei 'Negotiated TLS1\.3 group:' | head -1)"
  echo "ERROR: with compat ON, strict accepted classical group: ${NEG}" >&2
  echo "HINT: compat must use dedicated listen port ≠ 443 + dedicated certs" >&2
  exit 1
fi
if echo "${CLASSICAL2_OUT}" | grep -Eqi 'Cipher is TLS_'; then
  echo "ERROR: with compat ON, strict completed classical-only handshake" >&2
  exit 1
fi
HYBRID2_OUT="$(openssl s_client \
  -connect "${STRICT_HOST}:${STRICT_PORT}" \
  -servername "${STRICT_HOST}" \
  -tls1_3 \
  -groups X25519MLKEM768 \
  </dev/null 2>&1 || true)"
assert_negotiated_group "strict/hybrid-with-compat-on" "${HYBRID2_OUT}" "X25519MLKEM768"

echo "OK: strict rejects classical-only (even with compat on); compat ${COMPAT_HOST}:${COMPAT_PORT} accepts classical X25519 + TLS 1.2"
