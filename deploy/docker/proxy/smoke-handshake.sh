#!/usr/bin/env bash
# Local PQ TLS handshake smoke (no GitHub Actions auto-trigger).
# Exercises: hybrid on default, classical reject on default (with compat ON),
# classical + TLS 1.2 on compat (real cipher), foreign SNI reject, Host→421,
# hybrid/P-256/static-RSA reject on compat, session-resume reject.
#
# Mode (retest#3 finding 7):
#   OKKEY_PQ_SMOKE_MODE=local   — use OpenSSL≥3.5 + nginx under $OKKEY_PQ_SMOKE_PREFIX
#   OKKEY_PQ_SMOKE_MODE=docker  — build/run edge image
#   unset / auto              — docker if available, else local
# CI (pq-tls-smoke.yml) MUST set MODE=local so the built prefix is what is tested.
#
# Usage:
#   ./smoke-handshake.sh
#   OKKEY_PQ_SMOKE_MODE=local OKKEY_PQ_SMOKE_PREFIX=/tmp/okkey-pq-smoke ./smoke-handshake.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SMOKE_PREFIX="${OKKEY_PQ_SMOKE_PREFIX:-/tmp/okkey-pq-smoke}"
SMOKE_MODE="${OKKEY_PQ_SMOKE_MODE:-auto}"
PORT="${OKKEY_PROXY_HTTPS_PORT:-18443}"
HTTP_PORT="${OKKEY_PROXY_HTTP_PORT:-18080}"
COMPAT_PORT="${OKKEY_COMPAT_HTTPS_PORT:-18444}"
STRICT_HOST="${OKKEY_WEB_HOST:-app.example.com}"
API_HOST="${OKKEY_API_HOST:-api.example.com}"
COMPAT_WEB="${OKKEY_COMPAT_WEB_HOST:-compat-app.example.com}"
COMPAT_API="${OKKEY_COMPAT_API_HOST:-compat-api.example.com}"
SUNSET="${OKKEY_COMPAT_SUNSET:-$(date -u -d '+30 days' +%Y-%m-%d 2>/dev/null || date -u -v+30d +%Y-%m-%d 2>/dev/null || echo "$(date -u +%Y)-12-31")}"
OWNER="${OKKEY_COMPAT_OWNER:-smoke-handshake}"
RUN_DIR="${SMOKE_PREFIX}/smoke-run-$$"
NGINX_PID=""
DOCKER_CID=""

cleanup() {
  if [[ -n "${NGINX_PID}" ]] && kill -0 "${NGINX_PID}" 2>/dev/null; then
    kill "${NGINX_PID}" 2>/dev/null || true
    wait "${NGINX_PID}" 2>/dev/null || true
  fi
  if [[ -n "${DOCKER_CID}" ]]; then
    docker rm -f "${DOCKER_CID}" >/dev/null 2>&1 || true
  fi
  if [[ -f "${RUN_DIR}/nginx.pid" ]]; then
    kill "$(cat "${RUN_DIR}/nginx.pid")" 2>/dev/null || true
  fi
  rm -rf "${RUN_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

fail() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

have_openssl35() {
  command -v openssl >/dev/null 2>&1 \
    && openssl list -tls-groups 2>/dev/null | grep -q 'X25519MLKEM768'
}

ensure_client_openssl() {
  command -v openssl >/dev/null 2>&1 || fail "openssl not found (required; missing tool = FAIL)"
  if have_openssl35; then
    echo "client openssl: $(openssl version) ($(command -v openssl))"
    return 0
  fi
  if [[ -x "${SMOKE_PREFIX}/prefix/bin/openssl" ]]; then
    export PATH="${SMOKE_PREFIX}/prefix/bin:${PATH}"
    export LD_LIBRARY_PATH="${SMOKE_PREFIX}/prefix/lib64:${SMOKE_PREFIX}/prefix/lib:${LD_LIBRARY_PATH:-}"
  fi
  have_openssl35 || fail "need OpenSSL ≥ 3.5 client (build under ${SMOKE_PREFIX}/prefix or install)"
  echo "client openssl: $(openssl version) ($(command -v openssl))"
}

# Retest#3 finding 4: recognize ANY negotiated cipher (incl. static RSA AES…),
# so strict TLS1.2 / compat-staticrsa mutants cannot false-green.
handshake_completed() {
  local out="$1"
  echo "${out}" | grep -Eqi 'Cipher is (TLS_|ECDHE-|AES|CHACHA)' \
    && ! echo "${out}" | grep -Eqi 'Cipher is \(NONE\)|Cipher[[:space:]]*:[[:space:]]*0000'
}

subst_vars() {
  local in="$1" out="$2"
  shift 2
  local content pair key val
  content="$(cat "${in}")"
  for pair in "$@"; do
    key="${pair%%=*}"
    val="${pair#*=}"
    content="${content//\$\{${key}\}/${val}}"
  done
  printf '%s\n' "${content}" >"${out}"
}

render_conf() {
  local dest="$1"
  mkdir -p "${dest}/conf.d" "${dest}/certs" "${dest}/logs" "${dest}/tmp"
  local web_up="127.0.0.1:9"
  local api_up="127.0.0.1:9"

  if command -v envsubst >/dev/null 2>&1; then
    export OKKEY_WEB_HOST="${STRICT_HOST}"
    export OKKEY_API_HOST="${API_HOST}"
    export OKKEY_COMPAT_WEB_HOST="${COMPAT_WEB}"
    export OKKEY_COMPAT_API_HOST="${COMPAT_API}"
    export OKKEY_COMPAT_SUNSET="${SUNSET}"
    export OKKEY_COMPAT_HTTPS_PORT="${COMPAT_PORT}"
    export OKKEY_WEB_UPSTREAM="${web_up}"
    export OKKEY_API_UPSTREAM="${api_up}"
    envsubst '${OKKEY_WEB_HOST} ${OKKEY_API_HOST} ${OKKEY_WEB_UPSTREAM} ${OKKEY_API_UPSTREAM}' \
      < "${ROOT}/nginx/conf.d/okkey.conf.template" \
      > "${dest}/conf.d/okkey.conf"
    envsubst '${OKKEY_COMPAT_WEB_HOST} ${OKKEY_COMPAT_API_HOST} ${OKKEY_COMPAT_SUNSET} ${OKKEY_COMPAT_HTTPS_PORT} ${OKKEY_WEB_UPSTREAM} ${OKKEY_API_UPSTREAM}' \
      < "${ROOT}/nginx/conf.d/okkey-compat.conf.template" \
      > "${dest}/conf.d/zzz-okkey-compat.conf"
  else
    subst_vars "${ROOT}/nginx/conf.d/okkey.conf.template" "${dest}/conf.d/okkey.conf" \
      "OKKEY_WEB_HOST=${STRICT_HOST}" \
      "OKKEY_API_HOST=${API_HOST}" \
      "OKKEY_WEB_UPSTREAM=${web_up}" \
      "OKKEY_API_UPSTREAM=${api_up}"
    subst_vars "${ROOT}/nginx/conf.d/okkey-compat.conf.template" "${dest}/conf.d/zzz-okkey-compat.conf" \
      "OKKEY_COMPAT_WEB_HOST=${COMPAT_WEB}" \
      "OKKEY_COMPAT_API_HOST=${COMPAT_API}" \
      "OKKEY_COMPAT_SUNSET=${SUNSET}" \
      "OKKEY_COMPAT_HTTPS_PORT=${COMPAT_PORT}" \
      "OKKEY_WEB_UPSTREAM=${web_up}" \
      "OKKEY_API_UPSTREAM=${api_up}"
  fi

  sed -i \
    -e "s|/etc/nginx/certs/|${dest}/certs/|g" \
    -e "s|/etc/nginx/conf.d/compat-allow.inc|${dest}/conf.d/compat-allow.inc|g" \
    -e "s|listen 443 ssl|listen ${PORT} ssl|g" \
    -e "s|listen \\[::\\]:443 ssl|listen [::]:${PORT} ssl|g" \
    -e "s|listen 80;|listen ${HTTP_PORT};|g" \
    -e "s|listen \\[::\\]:80;|listen [::]:${HTTP_PORT};|g" \
    "${dest}/conf.d/okkey.conf" "${dest}/conf.d/zzz-okkey-compat.conf"

  printf '# smoke: no CIDR allowlist\n' > "${dest}/conf.d/compat-allow.inc"

  cat > "${dest}/nginx.conf" <<EOF
worker_processes 1;
error_log ${dest}/logs/error.log info;
pid ${dest}/nginx.pid;
events { worker_connections 64; }
http {
  access_log ${dest}/logs/access.log;
  client_body_temp_path ${dest}/tmp/client_temp;
  proxy_temp_path ${dest}/tmp/proxy_temp;
  include ${dest}/conf.d/*.conf;
}
EOF
}

gen_certs() {
  local dest_certs="$1"
  OKKEY_PROXY_CERT_DIR="${dest_certs}" \
  OKKEY_WEB_HOST="${STRICT_HOST}" \
  OKKEY_API_HOST="${API_HOST}" \
  OKKEY_COMPAT_WEB_HOST="${COMPAT_WEB}" \
  OKKEY_COMPAT_API_HOST="${COMPAT_API}" \
    "${ROOT}/scripts/gen-self-signed.sh" --with-compat --force
}

run_verify() {
  step "1/10 strict hybrid (compat ON)"
  OUT="$(openssl s_client -connect "127.0.0.1:${PORT}" -servername "${STRICT_HOST}" \
    -tls1_3 -groups X25519MLKEM768 </dev/null 2>&1 || true)"
  echo "${OUT}" | grep -Ei 'Protocol|Negotiated|Cipher|VERIFY return' || true
  echo "${OUT}" | grep -Eqi 'Negotiated TLS1\.3 group:[[:space:]]*X25519MLKEM768' \
    || fail "strict did not negotiate X25519MLKEM768"
  handshake_completed "${OUT}" || fail "strict hybrid handshake incomplete"

  step "2/10 strict classical reject (compat ON) — negative"
  OUT="$(openssl s_client -connect "127.0.0.1:${PORT}" -servername "${STRICT_HOST}" \
    -tls1_3 -groups X25519 </dev/null 2>&1 || true)"
  if echo "${OUT}" | grep -Eqi 'Negotiated TLS1\.3 group:[[:space:]]*X25519[[:space:]]*$'; then
    fail "strict accepted classical while compat ON"
  fi
  handshake_completed "${OUT}" && fail "strict completed classical handshake while compat ON"
  echo "classical rejected on strict (PASS)"

  step "3/10 strict TLS 1.2 reject (openssl — N4; catch static RSA AES)"
  OUT="$(openssl s_client -connect "127.0.0.1:${PORT}" -servername "${STRICT_HOST}" \
    -tls1_2 </dev/null 2>&1 || true)"
  handshake_completed "${OUT}" && fail "TLS 1.2 succeeded on strict (mutant strict-tls12)"
  echo "TLS 1.2 rejected on strict (PASS)"

  step "4/10 compat classical TLS1.3 on :${COMPAT_PORT}"
  OUT="$(openssl s_client -connect "127.0.0.1:${COMPAT_PORT}" -servername "${COMPAT_WEB}" \
    -tls1_3 -groups X25519 </dev/null 2>&1 || true)"
  echo "${OUT}" | grep -Ei 'Protocol|Negotiated|Cipher|VERIFY return|Peer Temp Key' || true
  echo "${OUT}" | grep -Eqi 'X25519MLKEM768' && fail "compat negotiated hybrid" || true
  if echo "${OUT}" | grep -Eqi 'Negotiated TLS1\.3 group:[[:space:]]*X25519[[:space:]]*$'; then
    :
  elif echo "${OUT}" | grep -Eqi 'Peer Temp Key:[[:space:]]*X25519[[:space:]]*,' \
    && handshake_completed "${OUT}"; then
    :
  else
    fail "compat did not negotiate classical X25519"
  fi
  handshake_completed "${OUT}" || fail "compat TLS1.3 handshake incomplete"

  step "5/10 compat TLS 1.2 on :${COMPAT_PORT} (N3 — real ECDHE cipher)"
  OUT="$(openssl s_client -connect "127.0.0.1:${COMPAT_PORT}" -servername "${COMPAT_WEB}" \
    -tls1_2 -groups X25519 </dev/null 2>&1 || true)"
  echo "${OUT}" | grep -Ei 'Protocol|Cipher|VERIFY return|error|alert' || true
  echo "${OUT}" | grep -Eqi 'Protocol[[:space:]]*:[[:space:]]*TLSv1\.2' \
    || fail "compat TLS 1.2 handshake failed (no Protocol TLSv1.2)"
  if echo "${OUT}" | grep -Eqi 'Cipher is \(NONE\)|Cipher[[:space:]]*:[[:space:]]*0000'; then
    fail "compat TLS 1.2 false green: Protocol TLSv1.2 but Cipher 0000/NONE"
  fi
  echo "${OUT}" | grep -Eqi 'Cipher is ECDHE-|Cipher[[:space:]]*:[[:space:]]*ECDHE-' \
    || fail "compat TLS 1.2 missing ECDHE AEAD cipher"
  echo "compat TLS 1.2 + ECDHE cipher (PASS)"

  step "6/10 finding 1: compat REJECT hybrid + P-256"
  OUT="$(openssl s_client -connect "127.0.0.1:${COMPAT_PORT}" -servername "${COMPAT_WEB}" \
    -tls1_3 -groups X25519MLKEM768 </dev/null 2>&1 || true)"
  handshake_completed "${OUT}" && fail "compat accepted hybrid (mutant compat-mlkem / catch-all curve leak)"
  OUT="$(openssl s_client -connect "127.0.0.1:${COMPAT_PORT}" -servername "${COMPAT_WEB}" \
    -tls1_3 -groups P-256 </dev/null 2>&1 || true)"
  handshake_completed "${OUT}" && fail "compat accepted P-256"
  echo "hybrid/P-256 rejected on compat (PASS)"

  step "7/10 finding 4: compat REJECT static RSA + CBC-SHA1"
  OUT="$(openssl s_client -connect "127.0.0.1:${COMPAT_PORT}" -servername "${COMPAT_WEB}" \
    -tls1_2 -cipher 'AES256-GCM-SHA384' </dev/null 2>&1 || true)"
  handshake_completed "${OUT}" && fail "compat accepted static RSA (mutant compat-staticrsa)"
  OUT="$(openssl s_client -connect "127.0.0.1:${COMPAT_PORT}" -servername "${COMPAT_WEB}" \
    -tls1_2 -cipher 'AES128-SHA' </dev/null 2>&1 || true)"
  handshake_completed "${OUT}" && fail "compat accepted CBC-SHA1"
  echo "static RSA / CBC rejected on compat (PASS)"

  step "8/10 N1 foreign SNI / no-SNI on compat port must reject"
  OUT="$(openssl s_client -connect "127.0.0.1:${COMPAT_PORT}" -servername "${STRICT_HOST}" \
    -tls1_3 -groups X25519 </dev/null 2>&1 || true)"
  handshake_completed "${OUT}" && fail "compat port accepted foreign SNI ${STRICT_HOST}"
  OUT="$(openssl s_client -connect "127.0.0.1:${COMPAT_PORT}" \
    -tls1_3 -groups X25519 </dev/null 2>&1 || true)"
  handshake_completed "${OUT}" && fail "compat port accepted handshake without matching SNI"
  echo "foreign/missing SNI rejected on compat port (PASS)"

  step "9/10 finding 2: HTTP/1.1 forged Host → 421"
  HTTP421="$(
    {
      printf 'GET / HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n' "${STRICT_HOST}"
      sleep 0.3
    } | openssl s_client \
      -connect "127.0.0.1:${COMPAT_PORT}" \
      -servername "${COMPAT_WEB}" \
      -tls1_3 -groups X25519 -quiet 2>/dev/null || true
  )"
  echo "${HTTP421}" | grep -Eq '^HTTP/1\.[01] 421' \
    || fail "expected HTTP 421 for forged Host (mutant no-421); got: $(echo "${HTTP421}" | head -3)"
  echo "forged Host → 421 (PASS)"

  step "10/10 finding 3: TLS1.2 resume with foreign SNI must fail"
  SESS_FILE="${RUN_DIR}/sess.pem"
  openssl s_client -connect "127.0.0.1:${COMPAT_PORT}" -servername "${COMPAT_WEB}" \
    -tls1_2 -groups X25519 -sess_out "${SESS_FILE}" </dev/null >/dev/null 2>&1 || true
  if [[ -s "${SESS_FILE}" ]]; then
    OUT="$(openssl s_client -connect "127.0.0.1:${COMPAT_PORT}" -servername "${STRICT_HOST}" \
      -tls1_2 -sess_in "${SESS_FILE}" </dev/null 2>&1 || true)"
    if echo "${OUT}" | grep -Eqi 'Reused' && handshake_completed "${OUT}"; then
      fail "TLS1.2 session resumed with foreign SNI (finding 3)"
    fi
    handshake_completed "${OUT}" && fail "resume handshake completed with foreign SNI"
    echo "TLS1.2 resume foreign SNI rejected (PASS)"
  else
    echo "no session ticket/id written (sessions off) — resume N/A (PASS)"
  fi
}

run_local_nginx() {
  local nginx_bin="${SMOKE_PREFIX}/prefix/sbin/nginx"
  [[ -x "${nginx_bin}" ]] || fail "local nginx not found at ${nginx_bin} (build OpenSSL 3.5 + nginx first, or use OKKEY_PQ_SMOKE_MODE=docker)"
  ensure_client_openssl
  mkdir -p "${RUN_DIR}"
  render_conf "${RUN_DIR}"
  gen_certs "${RUN_DIR}/certs"
  "${nginx_bin}" -t -c "${RUN_DIR}/nginx.conf"
  "${nginx_bin}" -c "${RUN_DIR}/nginx.conf"
  sleep 0.5
  if [[ -f "${RUN_DIR}/nginx.pid" ]]; then
    NGINX_PID="$(cat "${RUN_DIR}/nginx.pid")"
  fi
  run_verify
}

run_docker() {
  ensure_client_openssl
  mkdir -p "${RUN_DIR}/certs"
  gen_certs "${RUN_DIR}/certs"
  local image="${OKKEY_PROXY_IMAGE:-okkey-edge-nginx:openssl35}"
  if ! docker image inspect "${image}" >/dev/null 2>&1; then
    step "building ${image}"
    docker build \
      -t "${image}" \
      --build-arg OPENSSL_VERSION="${OKKEY_PROXY_OPENSSL_VERSION:-3.5.9}" \
      --build-arg NGINX_VERSION="${OKKEY_PROXY_NGINX_VERSION:-1.28.0}" \
      "${ROOT}/nginx"
  fi
  local cport_inside="${OKKEY_COMPAT_LISTEN_INSIDE:-8443}"
  # No --rm: keep the container so docker logs survive entrypoint refusal (N9 / retest#4 finding 4).
  DOCKER_CID="$(docker run -d \
    -p "127.0.0.1:${PORT}:443" \
    -p "127.0.0.1:${HTTP_PORT}:80" \
    -p "127.0.0.1:${COMPAT_PORT}:${cport_inside}" \
    -v "${RUN_DIR}/certs:/etc/nginx/certs:ro" \
    -e OKKEY_WEB_HOST="${STRICT_HOST}" \
    -e OKKEY_API_HOST="${API_HOST}" \
    -e OKKEY_WEB_UPSTREAM="127.0.0.1:9" \
    -e OKKEY_API_UPSTREAM="127.0.0.1:9" \
    -e OKKEY_COMPAT_ENABLED=1 \
    -e OKKEY_COMPAT_WEB_HOST="${COMPAT_WEB}" \
    -e OKKEY_COMPAT_API_HOST="${COMPAT_API}" \
    -e OKKEY_COMPAT_SUNSET="${SUNSET}" \
    -e OKKEY_COMPAT_OWNER="${OWNER}" \
    -e OKKEY_COMPAT_HTTPS_PORT="${cport_inside}" \
    "${image}")"
  # N9: wait loop must FAIL on timeout (not silently continue).
  local ready=0
  local last_err=""
  for _ in $(seq 1 30); do
    if openssl s_client -connect "127.0.0.1:${PORT}" -servername "${STRICT_HOST}" \
      -tls1_3 -groups X25519MLKEM768 </dev/null 2>/dev/null \
      | grep -Eqi 'Negotiated TLS1\.3 group:[[:space:]]*X25519MLKEM768'; then
      ready=1
      break
    fi
    last_err="$(docker logs "${DOCKER_CID}" 2>&1 | tail -20 || true)"
    sleep 0.5
  done
  if [[ "${ready}" -ne 1 ]]; then
    last_err="$(docker logs "${DOCKER_CID}" 2>&1 | tail -40 || printf '%s' "${last_err}")"
    fail "docker proxy did not become ready within timeout (N9). Often: cert bind-mount missing/mismatched PEMs under ${RUN_DIR}/certs, entrypoint refused env, or image OpenSSL < 3.5. Last container logs:
${last_err}"
  fi
  run_verify
}

step "static policy (always)"
"${ROOT}/policy-compat.sh"

step "handshake smoke (mode=${SMOKE_MODE})"
case "${SMOKE_MODE}" in
  local|prefix|local-prefix)
    echo "OKKEY_PQ_SMOKE_MODE=local — using prefix at ${SMOKE_PREFIX}"
    run_local_nginx
    ;;
  docker)
    command -v docker >/dev/null 2>&1 || fail "OKKEY_PQ_SMOKE_MODE=docker but docker not available"
    run_docker
    ;;
  auto|"")
    if command -v docker >/dev/null 2>&1; then
      run_docker
    else
      echo "docker not available — using local nginx prefix at ${SMOKE_PREFIX}"
      run_local_nginx
    fi
    ;;
  *)
    fail "unknown OKKEY_PQ_SMOKE_MODE=${SMOKE_MODE} (use local|docker|auto)"
    ;;
esac

echo
echo "PASS: smoke-handshake (hybrid + classical reject + compat profile + Host 421 + resume reject)"
echo "PASTE_FOR_EVIDENCE_BEGIN"
openssl s_client -connect "127.0.0.1:${PORT}" -servername "${STRICT_HOST}" \
  -tls1_3 -groups X25519MLKEM768 </dev/null 2>&1 \
  | grep -Ei 'Protocol|Negotiated TLS1\.3 group|Cipher|VERIFY return' || true
echo "--- classical reject on strict (compat ON) ---"
openssl s_client -connect "127.0.0.1:${PORT}" -servername "${STRICT_HOST}" \
  -tls1_3 -groups X25519 </dev/null 2>&1 \
  | grep -Ei 'Protocol|Negotiated|alert|error:|Cipher' | head -5 || true
echo "--- compat classical ---"
openssl s_client -connect "127.0.0.1:${COMPAT_PORT}" -servername "${COMPAT_WEB}" \
  -tls1_3 -groups X25519 </dev/null 2>&1 \
  | grep -Ei 'Protocol|Negotiated TLS1\.3 group|Cipher|VERIFY return|Peer Temp' || true
echo "--- foreign SNI on compat ---"
openssl s_client -connect "127.0.0.1:${COMPAT_PORT}" -servername "${STRICT_HOST}" \
  -tls1_3 -groups X25519 </dev/null 2>&1 \
  | grep -Ei 'Protocol|Cipher|alert|error:' | head -5 || true
echo "PASTE_FOR_EVIDENCE_END"
