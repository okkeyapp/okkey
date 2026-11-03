#!/usr/bin/env bash
# Local/smoke certs for SaaS edge bring-up. Not for real stage/prod (use ACME).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="${ROOT}/certs"
WEB_HOST="${OKKEY_WEB_HOST:-app.stage.okkey.app}"
API_HOST="${OKKEY_API_HOST:-api.stage.okkey.app}"

mkdir -p "${CERT_DIR}"

openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -keyout "${CERT_DIR}/privkey.pem" \
  -out "${CERT_DIR}/fullchain.pem" \
  -subj "/CN=${WEB_HOST}" \
  -addext "subjectAltName=DNS:${WEB_HOST},DNS:${API_HOST}"

echo "Wrote ${CERT_DIR}/{fullchain,privkey}.pem for ${WEB_HOST} + ${API_HOST}"
echo "Replace with real CA certs before stage/prod traffic."
