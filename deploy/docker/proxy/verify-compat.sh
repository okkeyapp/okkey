#!/usr/bin/env bash
# Live verify: default host rejects classical-only; optional compat host accepts classical.
# When compat is enabled, re-assert that the *strict* host still negotiates hybrid only
# (negative test for SSL_CTX / listen-socket bleed).
# Retest#3/#4: hybrid/P-256 reject on compat; HTTP/1.1 Host→421; session resume reject;
# static RSA/CBC reject; TLS1.2 success = any real cipher; strict TLS1.2 catches AES.
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
command -v openssl >/dev/null 2>&1 || { echo "ERROR: openssl not found (required)" >&2; exit 1; }
openssl version
if ! openssl list -tls-groups 2>/dev/null | grep -q 'X25519MLKEM768'; then
  echo "ERROR: this openssl does not list X25519MLKEM768 — install OpenSSL ≥ 3.5" >&2
  exit 1
fi

# Any completed handshake (TLS_ / ECDHE- / AES… / CHACHA) that is not NONE/0000.
handshake_completed() {
  local out="$1"
  echo "${out}" | grep -Eqi 'Cipher is (TLS_|ECDHE-|AES|CHACHA)' \
    && ! echo "${out}" | grep -Eqi 'Cipher is \(NONE\)|Cipher[[:space:]]*:[[:space:]]*0000'
}

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
    echo "${out}" | grep -Eqi 'Cipher is TLS_' \
      || { echo "ERROR: ${label}: hybrid handshake incomplete (no TLS_ cipher)" >&2; exit 1; }
  elif [[ "${expect}" = "X25519" ]]; then
    echo "${label}: ${line:-"(no Negotiated line)"} / ${peer:-"(no Peer Temp Key)"}"
    if echo "${out}" | grep -Eqi 'X25519MLKEM768'; then
      echo "ERROR: ${label}: hybrid leaked into classical expect" >&2
      exit 1
    fi
    if echo "${line}" | grep -Eqi 'Negotiated TLS1\.3 group:[[:space:]]*X25519[[:space:]]*$'; then
      echo "${out}" | grep -Eqi 'Cipher is TLS_' \
        || { echo "ERROR: ${label}: negotiated X25519 but no TLS_ cipher" >&2; exit 1; }
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

assert_tls12_success() {
  local label="$1"
  local out="$2"
  echo "${out}" | grep -Eqi 'Protocol[[:space:]]*:[[:space:]]*TLSv1\.2' \
    || { echo "ERROR: ${label}: missing Protocol TLSv1.2" >&2; exit 1; }
  if echo "${out}" | grep -Eqi 'Cipher is \(NONE\)|Cipher[[:space:]]*:[[:space:]]*0000'; then
    echo "ERROR: ${label}: Protocol TLSv1.2 but Cipher 0000/NONE (false green)" >&2
    exit 1
  fi
  echo "${out}" | grep -Eqi 'Cipher is ECDHE-|Cipher[[:space:]]*:[[:space:]]*ECDHE-' \
    || { echo "ERROR: ${label}: expected ECDHE AEAD cipher on TLS 1.2" >&2; exit 1; }
}

assert_handshake_failed() {
  local label="$1"
  local out="$2"
  if handshake_completed "${out}"; then
    echo "ERROR: ${label}: handshake unexpectedly completed" >&2
    echo "${out}" | grep -Ei 'Protocol|Cipher|Negotiated|Peer Temp|alert' || true
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
assert_handshake_failed "strict/classical" "${CLASSICAL_OUT}"
echo "classical-only rejected on strict host (expected)."

echo "==> strict ${STRICT_HOST}:${STRICT_PORT} — TLS 1.2 must fail (N4; catch static RSA AES too)"
TLS12_STRICT="$(openssl s_client \
  -connect "${STRICT_HOST}:${STRICT_PORT}" \
  -servername "${STRICT_HOST}" \
  -tls1_2 \
  </dev/null 2>&1 || true)"
assert_handshake_failed "strict/tls12" "${TLS12_STRICT}"
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
echo "${COMPAT_OUT}" | grep -E 'Protocol|Negotiated|group|Group|Cipher|VERIFY|X-Okkey|Peer Temp' || true
assert_negotiated_group "compat/classical-tls13" "${COMPAT_OUT}" "X25519"
if echo "${COMPAT_OUT}" | grep -Eqi 'X25519MLKEM768'; then
  echo "ERROR: compat listener negotiated hybrid (must be classical-only)" >&2
  exit 1
fi

echo "==> compat ${COMPAT_HOST}:${COMPAT_PORT} — TLS 1.2 must succeed with real cipher (N3)"
COMPAT12_OUT="$(openssl s_client \
  -connect "${COMPAT_HOST}:${COMPAT_PORT}" \
  -servername "${COMPAT_HOST}" \
  -tls1_2 \
  -groups X25519 \
  </dev/null 2>&1 || true)"
echo "${COMPAT12_OUT}" | grep -E 'Protocol|Cipher|VERIFY|group|Group|error|alert' || true
assert_tls12_success "compat/tls12" "${COMPAT12_OUT}"
if echo "${COMPAT12_OUT}" | grep -Eqi 'Protocol[[:space:]]*:[[:space:]]*TLSv1\.3'; then
  echo "ERROR: expected TLS 1.2 on compat, got TLS 1.3" >&2
  exit 1
fi
echo "TLS 1.2 accepted on compat host with ECDHE cipher (expected)."

echo "==> finding 1: compat must REJECT hybrid / P-256 (classical curve only)"
HYB_COMPAT="$(openssl s_client \
  -connect "${COMPAT_HOST}:${COMPAT_PORT}" \
  -servername "${COMPAT_HOST}" \
  -tls1_3 \
  -groups X25519MLKEM768 \
  </dev/null 2>&1 || true)"
assert_handshake_failed "compat/hybrid-reject" "${HYB_COMPAT}"
P256_COMPAT="$(openssl s_client \
  -connect "${COMPAT_HOST}:${COMPAT_PORT}" \
  -servername "${COMPAT_HOST}" \
  -tls1_3 \
  -groups P-256 \
  </dev/null 2>&1 || true)"
assert_handshake_failed "compat/p256-reject" "${P256_COMPAT}"
echo "hybrid/P-256 rejected on compat (expected)."

echo "==> finding 4: compat must REJECT static RSA / CBC-SHA1 ciphers"
RSA_OUT="$(openssl s_client \
  -connect "${COMPAT_HOST}:${COMPAT_PORT}" \
  -servername "${COMPAT_HOST}" \
  -tls1_2 \
  -cipher 'AES256-GCM-SHA384' \
  </dev/null 2>&1 || true)"
assert_handshake_failed "compat/static-rsa" "${RSA_OUT}"
CBC_OUT="$(openssl s_client \
  -connect "${COMPAT_HOST}:${COMPAT_PORT}" \
  -servername "${COMPAT_HOST}" \
  -tls1_2 \
  -cipher 'AES128-SHA' \
  </dev/null 2>&1 || true)"
assert_handshake_failed "compat/cbc-sha1" "${CBC_OUT}"
echo "static RSA / CBC-SHA1 rejected on compat (expected)."

echo "==> N1: foreign SNI on compat port must reject handshake"
FOREIGN_OUT="$(openssl s_client \
  -connect "${COMPAT_HOST}:${COMPAT_PORT}" \
  -servername "${STRICT_HOST}" \
  -tls1_3 \
  -groups X25519 \
  </dev/null 2>&1 || true)"
assert_handshake_failed "compat/foreign-sni" "${FOREIGN_OUT}"
NOSNI_OUT="$(openssl s_client \
  -connect "127.0.0.1:${COMPAT_PORT}" \
  -tls1_3 \
  -groups X25519 \
  </dev/null 2>&1 || true)"
assert_handshake_failed "compat/no-sni" "${NOSNI_OUT}"
echo "foreign/missing SNI rejected on compat port (expected)."

echo "==> finding 2: HTTP/1.1 forged Host on compat → 421"
# TLS with valid compat SNI, then HTTP Host = strict host (rematch → catch-all 421).
HTTP421="$(
  {
    printf 'GET / HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n' "${STRICT_HOST}"
    sleep 0.3
  } | openssl s_client \
    -connect "127.0.0.1:${COMPAT_PORT}" \
    -servername "${COMPAT_HOST}" \
    -tls1_3 \
    -groups X25519 \
    -quiet 2>/dev/null || true
)"
echo "${HTTP421}" | head -5 || true
echo "${HTTP421}" | grep -Eq '^HTTP/1\.[01] 421' \
  || { echo "ERROR: expected HTTP 421 for forged Host on compat port; got:" >&2; echo "${HTTP421}" | head -20 >&2; exit 1; }
echo "forged Host → 421 (expected)."

echo "==> finding 3: TLS1.2 session must not resume with foreign SNI"
SESS_FILE="$(mktemp)"
openssl s_client \
  -connect "127.0.0.1:${COMPAT_PORT}" \
  -servername "${COMPAT_HOST}" \
  -tls1_2 \
  -groups X25519 \
  -sess_out "${SESS_FILE}" \
  </dev/null >/dev/null 2>&1 || true
if [[ -s "${SESS_FILE}" ]]; then
  RESUME_OUT="$(openssl s_client \
    -connect "127.0.0.1:${COMPAT_PORT}" \
    -servername "${STRICT_HOST}" \
    -tls1_2 \
    -sess_in "${SESS_FILE}" \
    </dev/null 2>&1 || true)"
  if echo "${RESUME_OUT}" | grep -Eqi 'Reused' && handshake_completed "${RESUME_OUT}"; then
    rm -f "${SESS_FILE}"
    echo "ERROR: TLS1.2 session resumed with foreign SNI (finding 3)" >&2
    exit 1
  fi
  assert_handshake_failed "compat/resume-foreign-sni" "${RESUME_OUT}"
  echo "TLS1.2 resume with foreign SNI rejected (expected)."
else
  echo "NOTE: no session file written (sessions disabled) — resume bypass N/A (PASS)"
fi
rm -f "${SESS_FILE}"

echo "==> negative (compat enabled): strict ${STRICT_HOST}:${STRICT_PORT} still hybrid-only"
CLASSICAL2_OUT="$(openssl s_client \
  -connect "${STRICT_HOST}:${STRICT_PORT}" \
  -servername "${STRICT_HOST}" \
  -tls1_3 \
  -groups X25519 \
  </dev/null 2>&1 || true)"
assert_handshake_failed "strict/classical-with-compat-on" "${CLASSICAL2_OUT}"
HYBRID2_OUT="$(openssl s_client \
  -connect "${STRICT_HOST}:${STRICT_PORT}" \
  -servername "${STRICT_HOST}" \
  -tls1_3 \
  -groups X25519MLKEM768 \
  </dev/null 2>&1 || true)"
assert_negotiated_group "strict/hybrid-with-compat-on" "${HYBRID2_OUT}" "X25519MLKEM768"

echo "OK: strict hybrid-only; compat classical X25519+TLS1.2; foreign SNI/Host/resume/hybrid/RSA rejected"
