#!/usr/bin/env bash
# Generate local self-signed certs for proxy smoke tests (not for production).
# Requires openssl on the host (any recent 3.x is fine for cert gen).
#
# Always writes the strict (default-route) cert:
#   certs/fullchain.pem + certs/privkey.pem
#   SAN: OKKEY_WEB_HOST, OKKEY_API_HOST
#
# When compat hostnames are set (or --with-compat), also writes a *separate*
# compat cert so nginx gets an independent SSL_CTX (shared cert would bleed
# classical ssl_ecdh_curve onto the default domain — Vasya QA blocker):
#   certs/compat-fullchain.pem + certs/compat-privkey.pem
#   SAN: OKKEY_COMPAT_WEB_HOST, OKKEY_COMPAT_API_HOST
#
# N7 / retest#3 finding 6 / retest#6:
#   - lowercase + strip trailing dots before any comparison or write
#   - whole-value hostname gate (no newline / IP / oversize) before write
#   - collision check BEFORE writing any PEM
#   - atomic staging: openssl writes to mktemp -d, then mv (no partial PEMs)
#   - refuses overwrite unless --force; refuses partial compat host sets
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="${OKKEY_PROXY_CERT_DIR:-$ROOT/certs}"
WEB_HOST="${OKKEY_WEB_HOST:-app.example.com}"
API_HOST="${OKKEY_API_HOST:-api.example.com}"
COMPAT_WEB_HOST="${OKKEY_COMPAT_WEB_HOST:-}"
COMPAT_API_HOST="${OKKEY_COMPAT_API_HOST:-}"
DAYS="${OKKEY_PROXY_CERT_DAYS:-825}"
WITH_COMPAT=0
FORCE=0

normalize_host() {
  # lowercase + strip trailing dots (Vasya finding 6)
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/\.*$//'
}

# Whole-value DNS hostname gate (retest#5 HIGH / retest#6). Same rules as
# docker-entrypoint.sh: charset allowlist (rejects \n/\r), label≤63, name≤253,
# alpha TLD, no IP. Must not rely on line-oriented grep as the primary check.
require_hostname() {
  local label="$1" host="$2" rest lab tld labels=0
  _rh_fail() {
    echo "ERROR: ${label} must be a single strict DNS hostname (got: '${host}')" >&2
    echo "ERROR: charset [a-z0-9.-] only (no newlines/controls); label≤63; name≤253; alpha TLD; no IP literals" >&2
    exit 1
  }

  case "${host}" in
    ''|*[!a-z0-9.-]*) _rh_fail ;;
  esac

  if [[ "${#host}" -gt 253 ]]; then
    _rh_fail
  fi

  rest="${host}"
  tld=""
  while [[ -n "${rest}" ]]; do
    lab="${rest%%.*}"
    if [[ "${lab}" = "${rest}" ]]; then
      tld="${lab}"
      rest=""
    else
      rest="${rest#*.}"
    fi
    labels=$((labels + 1))
    if [[ -z "${lab}" || "${#lab}" -gt 63 ]]; then
      _rh_fail
    fi
    case "${lab}" in
      -*|*-) _rh_fail ;;
    esac
  done

  if [[ "${labels}" -lt 2 ]]; then
    _rh_fail
  fi
  case "${tld}" in
    *[a-z]*) ;;
    *) _rh_fail ;;
  esac
}

usage() {
  cat <<'EOF'
Usage: gen-self-signed.sh [--with-compat] [--force]

  Writes certs/fullchain.pem + privkey.pem for OKKEY_WEB_HOST / OKKEY_API_HOST.

  --with-compat
      Also write certs/compat-{fullchain,privkey}.pem for
      OKKEY_COMPAT_WEB_HOST / OKKEY_COMPAT_API_HOST
      (defaults: compat-app.example.com / compat-api.example.com).
      Both compat hosts are required (setting only one is an error).

  --force
      Overwrite existing PEM files. Without --force, refuse if targets exist (N7).

  Compat certs are also written automatically when OKKEY_COMPAT_WEB_HOST and
  OKKEY_COMPAT_API_HOST are both set in the environment.

  Hostnames are normalized (lowercase, no trailing dot) and must be a
  single strict DNS name (charset allowlist, label≤63, name≤253, alpha TLD)
  before collision checks and before any file is written. PEMs are staged
  atomically (no partial write on openssl failure).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-compat) WITH_COMPAT=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
done

WEB_HOST="$(normalize_host "${WEB_HOST}")"
API_HOST="$(normalize_host "${API_HOST}")"
require_hostname OKKEY_WEB_HOST "${WEB_HOST}"
require_hostname OKKEY_API_HOST "${API_HOST}"
if [[ -n "${COMPAT_WEB_HOST}" ]]; then
  COMPAT_WEB_HOST="$(normalize_host "${COMPAT_WEB_HOST}")"
fi
if [[ -n "${COMPAT_API_HOST}" ]]; then
  COMPAT_API_HOST="$(normalize_host "${COMPAT_API_HOST}")"
fi

# N7: partial compat host set is always an error (with or without --with-compat).
if [[ -n "${COMPAT_WEB_HOST}" && -z "${COMPAT_API_HOST}" ]] \
  || [[ -z "${COMPAT_WEB_HOST}" && -n "${COMPAT_API_HOST}" ]]; then
  echo "ERROR: set both OKKEY_COMPAT_WEB_HOST and OKKEY_COMPAT_API_HOST (or neither)" >&2
  echo "ERROR: got WEB='${COMPAT_WEB_HOST}' API='${COMPAT_API_HOST}'" >&2
  exit 1
fi

if [[ -n "${COMPAT_WEB_HOST}" && -n "${COMPAT_API_HOST}" ]]; then
  WITH_COMPAT=1
fi

if [[ "${WITH_COMPAT}" -eq 1 ]]; then
  COMPAT_WEB_HOST="$(normalize_host "${COMPAT_WEB_HOST:-compat-app.example.com}")"
  COMPAT_API_HOST="$(normalize_host "${COMPAT_API_HOST:-compat-api.example.com}")"
  require_hostname OKKEY_COMPAT_WEB_HOST "${COMPAT_WEB_HOST}"
  require_hostname OKKEY_COMPAT_API_HOST "${COMPAT_API_HOST}"
fi

# Collision + overwrite checks BEFORE any write (finding 6 / N7).
if [[ "${WITH_COMPAT}" -eq 1 ]]; then
  if [[ "${COMPAT_WEB_HOST}" = "${WEB_HOST}" ]] \
    || [[ "${COMPAT_API_HOST}" = "${API_HOST}" ]] \
    || [[ "${COMPAT_WEB_HOST}" = "${API_HOST}" ]] \
    || [[ "${COMPAT_API_HOST}" = "${WEB_HOST}" ]]; then
    echo "ERROR: compat hosts must differ from strict hosts (after normalize)" >&2
    echo "ERROR: strict web=${WEB_HOST} api=${API_HOST}" >&2
    echo "ERROR: compat  web=${COMPAT_WEB_HOST} api=${COMPAT_API_HOST}" >&2
    exit 1
  fi
  if [[ "${COMPAT_WEB_HOST}" = "${COMPAT_API_HOST}" ]]; then
    echo "ERROR: OKKEY_COMPAT_WEB_HOST and OKKEY_COMPAT_API_HOST must differ" >&2
    exit 1
  fi
fi

refuse_overwrite() {
  local f
  for f in "$@"; do
    if [[ -e "${f}" && "${FORCE}" -ne 1 ]]; then
      echo "ERROR: refusing to overwrite existing ${f} (pass --force)" >&2
      exit 1
    fi
  done
}

TARGETS=("${CERT_DIR}/fullchain.pem" "${CERT_DIR}/privkey.pem")
if [[ "${WITH_COMPAT}" -eq 1 ]]; then
  TARGETS+=("${CERT_DIR}/compat-fullchain.pem" "${CERT_DIR}/compat-privkey.pem")
fi
refuse_overwrite "${TARGETS[@]}"

mkdir -p "$CERT_DIR"

# Atomic staging: openssl only touches STAGE; CERT_DIR gets mv only after all succeed.
STAGE="$(mktemp -d "${CERT_DIR}/.staging.XXXXXX")"
cleanup_stage() { rm -rf "${STAGE}"; }
trap cleanup_stage EXIT

gen_cert_staged() {
  local out_chain_name="$1"
  local out_key_name="$2"
  local cn="$3"
  shift 3
  local sans=("$@")
  local tmp i stage_chain stage_key
  tmp="$(mktemp "${STAGE}/openssl.XXXXXX")"
  stage_chain="${STAGE}/${out_chain_name}"
  stage_key="${STAGE}/${out_key_name}"
  {
    cat <<EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${cn}

[v3_req]
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
EOF
    i=1
    for san in "${sans[@]}"; do
      echo "DNS.${i} = ${san}"
      i=$((i + 1))
    done
  } >"$tmp"

  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "${stage_key}" \
    -out "${stage_chain}" \
    -days "${DAYS}" \
    -config "$tmp"
  rm -f "$tmp"
  chmod 600 "${stage_key}"
}

commit_staged() {
  local f
  for f in "$@"; do
    mv -f "${STAGE}/${f}" "${CERT_DIR}/${f}"
  done
}

# CN maxsize=64 in OpenSSL; put real hostnames only in SAN so label≤63 FQDNs work.
STAGED_NAMES=(fullchain.pem privkey.pem)
gen_cert_staged fullchain.pem privkey.pem \
  "okkey-strict" "${WEB_HOST}" "${API_HOST}"

if [[ "${WITH_COMPAT}" -eq 1 ]]; then
  STAGED_NAMES+=(compat-fullchain.pem compat-privkey.pem)
  gen_cert_staged compat-fullchain.pem compat-privkey.pem \
    "okkey-compat" "${COMPAT_WEB_HOST}" "${COMPAT_API_HOST}"
fi

commit_staged "${STAGED_NAMES[@]}"
trap - EXIT
cleanup_stage

echo "Wrote ${CERT_DIR}/fullchain.pem and ${CERT_DIR}/privkey.pem (SAN: ${WEB_HOST}, ${API_HOST})"
if [[ "${WITH_COMPAT}" -eq 1 ]]; then
  echo "Wrote ${CERT_DIR}/compat-fullchain.pem and ${CERT_DIR}/compat-privkey.pem (SAN: ${COMPAT_WEB_HOST}, ${COMPAT_API_HOST})"
  echo "NOTE: compat uses a separate cert so nginx SSL_CTX (and ssl_ecdh_curve) stay isolated from the default domain."
fi
