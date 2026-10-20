#!/usr/bin/env bash
# Generate a local self-signed cert for proxy smoke tests (not for production).
# Requires openssl on the host (any recent 3.x is fine for cert gen).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="${OKKEY_PROXY_CERT_DIR:-$ROOT/certs}"
WEB_HOST="${OKKEY_WEB_HOST:-app.example.com}"
API_HOST="${OKKEY_API_HOST:-api.example.com}"
DAYS="${OKKEY_PROXY_CERT_DAYS:-825}"

mkdir -p "$CERT_DIR"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

cat >"$TMP" <<EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${WEB_HOST}

[v3_req]
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${WEB_HOST}
DNS.2 = ${API_HOST}
EOF

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "${CERT_DIR}/privkey.pem" \
  -out "${CERT_DIR}/fullchain.pem" \
  -days "${DAYS}" \
  -config "$TMP"

chmod 600 "${CERT_DIR}/privkey.pem"
echo "Wrote ${CERT_DIR}/fullchain.pem and ${CERT_DIR}/privkey.pem (SAN: ${WEB_HOST}, ${API_HOST})"
