#!/usr/bin/env bash
# Static review: classical-only compat listeners are explicit / isolated / time-boxed,
# and the default route stays hybrid-only (no silent downgrade).
# Retest#3/#4/#5/#6: catch-all classical TLS params + 421; cipher whitelist; per-block 421;
# entrypoint sunset/normalize/port-80; whole-value hostname gate (no line-grep bypass);
# gen-self-signed collision-before-write + atomic PEM staging; ban ssl_conf_command;
# ssl_protocols on every compat server block; catch-all single server_name.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
STRICT="${ROOT}/nginx/conf.d/okkey.conf.template"
COMPAT="${ROOT}/nginx/conf.d/okkey-compat.conf.template"
ENTRY="${ROOT}/nginx/docker-entrypoint.sh"
GENSS="${ROOT}/scripts/gen-self-signed.sh"
COMPAT_ENV="${ROOT}/compat.env.example"
COMPOSE="${ROOT}/docker-compose.proxy.yml"
COMPOSE_COMPAT="${ROOT}/docker-compose.compat.yml"
EDGE_COMPOSE="${ROOT}/../../saas/edge/docker-compose.edge.yml"
EDGE_COMPAT="${ROOT}/../../saas/edge/docker-compose.compat.yml"

CIPHER_CANON='ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305'

fail() { echo "ERROR: $*" >&2; exit 1; }

# Extract the server { … } block that contains default_server.
extract_catchall() {
  awk '
    /^[[:space:]]*server[[:space:]]*\{/ {
      if (inblk && buf ~ /default_server/) { printf "%s", buf; exit }
      inblk=1; depth=0; buf=""
    }
    inblk {
      buf = buf $0 "\n"
      line=$0
      for (i=1; i<=length(line); i++) {
        c=substr(line,i,1)
        if (c=="{") depth++
        if (c=="}") {
          depth--
          if (depth==0) {
            if (buf ~ /default_server/) { printf "%s", buf; exit }
            inblk=0; buf=""
          }
        }
      }
    }
  ' "$1"
}

echo "==> default (strict) template: ${STRICT}"
[[ -f "${STRICT}" ]] || fail "missing strict template"
grep -q 'ssl_protocols TLSv1.3;' "${STRICT}" \
  || fail "strict template must set ssl_protocols TLSv1.3 only"
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

SERVER_COUNT="$(grep -cE '^[[:space:]]*server[[:space:]]*\{' "${COMPAT}" || true)"
[[ "${SERVER_COUNT}" -ge 3 ]] \
  || fail "compat template must have ≥3 server blocks (catch-all + web + api); found ${SERVER_COUNT}"

CATCHALL="$(extract_catchall "${COMPAT}")"
[[ -n "${CATCHALL}" ]] || fail "compat template missing default_server catch-all block"

echo "${CATCHALL}" | grep -Eq 'ssl_protocols[[:space:]]+TLSv1\.2[[:space:]]+TLSv1\.3;' \
  || fail "catch-all default_server must set ssl_protocols TLSv1.2 TLSv1.3 (finding 1)"
echo "${CATCHALL}" | grep -Eq 'ssl_ecdh_curve[[:space:]]+X25519[[:space:]]*;' \
  || fail "catch-all default_server must set ssl_ecdh_curve X25519 (finding 1)"
echo "${CATCHALL}" | grep -Eq 'ssl_ciphers[[:space:]]+.*ECDHE-' \
  || fail "catch-all default_server must set ssl_ciphers ECDHE+AEAD (finding 1)"
echo "${CATCHALL}" | grep -q 'ssl_reject_handshake on;' \
  || fail "catch-all must ssl_reject_handshake on (N1)"
echo "${CATCHALL}" | grep -Eq 'return[[:space:]]+421' \
  || fail "catch-all must return 421 (finding 2; no html root)"
if echo "${CATCHALL}" | grep -Eqi '^[[:space:]]*root[[:space:]]+'; then
  fail "catch-all must not set html root (finding 2)"
fi
echo "${CATCHALL}" | grep -q 'ssl_session_cache off;' \
  || fail "catch-all must ssl_session_cache off (finding 3)"
echo "${CATCHALL}" | grep -q 'ssl_session_tickets off;' \
  || fail "catch-all must ssl_session_tickets off (finding 3)"
echo "${CATCHALL}" | grep -q 'ssl_prefer_server_ciphers on;' \
  || fail "catch-all must ssl_prefer_server_ciphers on"
# Catch-all server_name must stay the reject sentinel "_" (no alias / multi-name).
echo "${CATCHALL}" | grep -Eq '^[[:space:]]*server_name[[:space:]]+_[[:space:]]*;' \
  || fail "catch-all must use server_name _ only (no alias; retest#4 finding 5)"
CATCHALL_SN_COUNT="$(echo "${CATCHALL}" | grep -cE '^[[:space:]]*server_name[[:space:]]+' || true)"
[[ "${CATCHALL_SN_COUNT}" -eq 1 ]] \
  || fail "catch-all must have exactly one server_name directive (found ${CATCHALL_SN_COUNT}; retest#5 finding 6)"

PROTO_COUNT="$(grep -cE '^[[:space:]]*ssl_protocols[[:space:]]+TLSv1\.2[[:space:]]+TLSv1\.3[[:space:]]*;' "${COMPAT}" || true)"
[[ "${PROTO_COUNT}" -ge 3 ]] \
  || fail "compat must set ssl_protocols TLSv1.2 TLSv1.3 on catch-all + web + API (found ${PROTO_COUNT})"
# Every server block must carry its own ssl_protocols (count lines vs server blocks).
[[ "${PROTO_COUNT}" -eq "${SERVER_COUNT}" ]] \
  || fail "compat ssl_protocols count (${PROTO_COUNT}) must equal server block count (${SERVER_COUNT}); no missing/extra blocks (retest#5 finding 6)"
if grep -Eiq '^[[:space:]]*ssl_protocols[[:space:]]+.*TLSv1\.[01]' "${COMPAT}"; then
  fail "compat must not enable TLS ≤ 1.1 (comment-trick / regress)"
fi
# Comment-trick: "ssl_reject_handshake on;" / "return 421" only inside active (non-comment) lines.
if echo "${CATCHALL}" | grep -Eq '^[[:space:]]*#.*ssl_reject_handshake[[:space:]]+on'; then
  if ! echo "${CATCHALL}" | grep -Eq '^[[:space:]]*ssl_reject_handshake[[:space:]]+on[[:space:]]*;'; then
    fail "catch-all ssl_reject_handshake on must be active, not only in a comment (retest#5 finding 6)"
  fi
fi
if echo "${CATCHALL}" | grep -Eq '^[[:space:]]*#.*return[[:space:]]+421'; then
  if ! echo "${CATCHALL}" | grep -Eq '^[[:space:]]*return[[:space:]]+421'; then
    fail "catch-all return 421 must be active, not only in a comment (retest#5 finding 6)"
  fi
fi
if grep -Eiq 'ssl_conf_command' "${COMPAT}" "${STRICT}"; then
  fail "templates must not use ssl_conf_command (bypasses cipher/group policy; retest#4 finding 5)"
fi

while IFS= read -r CURVE_LINE; do
  echo "${CURVE_LINE}" | grep -Eq 'ssl_ecdh_curve[[:space:]]+X25519[[:space:]]*;' \
    || fail "compat ssl_ecdh_curve is not classical-only X25519: ${CURVE_LINE}"
  echo "${CURVE_LINE}" | grep -Eqi 'X25519MLKEM768|P-256|P-384' \
    && fail "compat ssl_ecdh_curve must not list hybrid/P-curve: ${CURVE_LINE}"
done < <(grep -E '^[[:space:]]*ssl_ecdh_curve' "${COMPAT}")
COMPAT_CURVE_COUNT="$(grep -cE '^[[:space:]]*ssl_ecdh_curve' "${COMPAT}" || true)"
[[ "${COMPAT_CURVE_COUNT}" -ge 3 ]] \
  || fail "compat must set ssl_ecdh_curve on catch-all + web + API (found ${COMPAT_CURVE_COUNT})"

CIPHER_LINES="$(grep -E '^[[:space:]]*ssl_ciphers' "${COMPAT}" || true)"
[[ -n "${CIPHER_LINES}" ]] || fail "compat template missing ssl_ciphers"
CIPHER_COUNT="$(echo "${CIPHER_LINES}" | wc -l | tr -d ' ')"
[[ "${CIPHER_COUNT}" -ge 3 ]] \
  || fail "compat must set ssl_ciphers on catch-all + web + API (found ${CIPHER_COUNT})"
while IFS= read -r CL; do
  # Exact whitelist (finding 4/5): substring/contains lets "…:AES256-GCM-SHA384" append slip through.
  CIPHER_VAL="$(echo "${CL}" | sed -E 's/^[[:space:]]*ssl_ciphers[[:space:]]+//; s/[[:space:]]*;[[:space:]]*$//; s/[[:space:]]+$//')"
  [[ "${CIPHER_VAL}" = "${CIPHER_CANON}" ]] \
    || fail "compat ssl_ciphers must equal ECDHE+AEAD whitelist exactly (got: ${CL})"
done <<< "${CIPHER_LINES}"

PREF_COUNT="$(grep -cE '^[[:space:]]*ssl_prefer_server_ciphers[[:space:]]+on;' "${COMPAT}" || true)"
[[ "${PREF_COUNT}" -ge 3 ]] || fail "ssl_prefer_server_ciphers on required in all compat servers"
SESS_COUNT="$(grep -cE '^[[:space:]]*ssl_session_cache[[:space:]]+off;' "${COMPAT}" || true)"
[[ "${SESS_COUNT}" -ge 3 ]] || fail "ssl_session_cache off required in all compat servers"
TICK_COUNT="$(grep -cE '^[[:space:]]*ssl_session_tickets[[:space:]]+off;' "${COMPAT}" || true)"
[[ "${TICK_COUNT}" -ge 3 ]] || fail "ssl_session_tickets off required in all compat servers"

RETURN_421_COUNT="$(grep -cE 'return[[:space:]]+421' "${COMPAT}" || true)"
[[ "${RETURN_421_COUNT}" -ge 3 ]] \
  || fail "compat must return 421 in catch-all + web + API (found ${RETURN_421_COUNT})"

IF_NE_COUNT="$(grep -cE 'if \(\$host != "' "${COMPAT}" || true)"
[[ "${IF_NE_COUNT}" -ge 2 ]] \
  || fail "compat named servers must use if (\$host != \"...\") return 421 (found ${IF_NE_COUNT})"
if grep -E 'if \(\$host = "' "${COMPAT}" >/dev/null 2>&1; then
  fail "compat must not neutralize Host check with if (\$host = ...)"
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
grep -Eq 'listen[[:space:]]+\$\{OKKEY_COMPAT_HTTPS_PORT\}[[:space:]]+ssl[[:space:]]+default_server' "${COMPAT}" \
  || fail "compat template must mark default_server on compat port (N1 catch-all)"

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
grep -q 'must not be 80' "${ENTRY}" \
  || fail "entrypoint must refuse compat listen port 80 with clear error"
grep -q 'normalize_host' "${ENTRY}" \
  || fail "entrypoint must normalize_host (lowercase / trailing-dot; finding 6)"
grep -q 'require_hostname' "${ENTRY}" \
  || fail "entrypoint must require_hostname (strict RFC1123; retest#4 finding 1)"
grep -Eq 'single strict DNS hostname' "${ENTRY}" \
  || fail "entrypoint must refuse non-hostname compat/strict hosts"
# Retest#5 HIGH: primary check must be whole-value charset allowlist, not line-grep.
grep -Fq '*[!a-z0-9.-]*' "${ENTRY}" \
  || fail "entrypoint require_hostname must charset-allowlist (rejects newline; retest#5 HIGH)"
grep -Eq 'label≤63|label<=63' "${ENTRY}" \
  || fail "entrypoint must document/enforce label≤63 (retest#5 finding 5)"
grep -Eq 'name≤253|name<=253|253' "${ENTRY}" \
  || fail "entrypoint must enforce name≤253 (retest#5 finding 5)"
grep -Eq 'alpha TLD|no IP' "${ENTRY}" \
  || fail "entrypoint must refuse IP / numeric TLD (retest#5 finding 4)"
grep -Eq 'date -u -d|date -d' "${ENTRY}" \
  || fail "entrypoint must calendar-parse sunset via date -d (retest#4 finding 2)"
grep -Eq 'valid calendar date' "${ENTRY}" \
  || fail "entrypoint must refuse invalid sunset calendar dates"
grep -Eq 'leading zeros' "${ENTRY}" \
  || fail "entrypoint must refuse leading-zero compat ports (retest#4 finding 3)"
grep -Eq 'in the past|sunset.*past' "${ENTRY}" \
  || fail "entrypoint must refuse past sunset"
grep -Eq 'exceeds max time-box|MAX_SUNSET' "${ENTRY}" \
  || fail "entrypoint must enforce sunset upper time-box"
# Gate call sites must still invoke require_hostname for ALL hosts (WEB/API/COMPAT).
for _gate_var in OKKEY_WEB_HOST OKKEY_API_HOST OKKEY_COMPAT_WEB_HOST OKKEY_COMPAT_API_HOST; do
  grep -Eq "require_hostname[[:space:]]+${_gate_var}" "${ENTRY}" \
    || fail "entrypoint must require_hostname ${_gate_var} (retest#6 validate ALL hosts)"
done

echo "==> gen-self-signed N7 / finding 6 + whole-value gate + atomic PEM: ${GENSS}"
[[ -x "${GENSS}" ]] || fail "gen-self-signed.sh missing or not executable"
grep -q 'normalize_host' "${GENSS}" \
  || fail "gen-self-signed must normalize_host"
grep -q 'require_hostname' "${GENSS}" \
  || fail "gen-self-signed must require_hostname (retest#4 finding 1)"
grep -Fq '*[!a-z0-9.-]*' "${GENSS}" \
  || fail "gen-self-signed require_hostname must charset-allowlist (rejects newline; retest#5 HIGH)"
grep -Eq 'mktemp -d' "${GENSS}" \
  || fail "gen-self-signed must stage PEMs in mktemp -d (atomic; retest#5 finding 3)"
grep -Eq 'commit_staged|mv -f' "${GENSS}" \
  || fail "gen-self-signed must mv staged PEMs only after success (atomic)"
COLLISION_LINE="$(grep -n 'compat hosts must differ' "${GENSS}" | head -1 | cut -d: -f1)"
WRITE_LINE="$(grep -n 'openssl req' "${GENSS}" | head -1 | cut -d: -f1)"
HOST_GATE_LINE="$(grep -n 'require_hostname' "${GENSS}" | head -1 | cut -d: -f1)"
[[ -n "${COLLISION_LINE}" && -n "${WRITE_LINE}" ]] \
  || fail "gen-self-signed must check collision and write certs"
[[ "${COLLISION_LINE}" -lt "${WRITE_LINE}" ]] \
  || fail "gen-self-signed must check host collision BEFORE writing PEMs (finding 6)"
[[ -n "${HOST_GATE_LINE}" && "${HOST_GATE_LINE}" -lt "${WRITE_LINE}" ]] \
  || fail "gen-self-signed must validate hostname BEFORE writing PEMs"
for _gate_var in OKKEY_WEB_HOST OKKEY_API_HOST OKKEY_COMPAT_WEB_HOST OKKEY_COMPAT_API_HOST; do
  grep -Eq "require_hostname[[:space:]]+${_gate_var}" "${GENSS}" \
    || fail "gen-self-signed must require_hostname ${_gate_var}"
done

NGINX_MAIN="${ROOT}/nginx/nginx.conf"
if [[ -f "${NGINX_MAIN}" ]]; then
  grep -Eq 'server_names_hash_bucket_size[[:space:]]+128' "${NGINX_MAIN}" \
    || fail "nginx.conf must set server_names_hash_bucket_size 128 (63-char labels; retest#5 finding 5)"
fi

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
