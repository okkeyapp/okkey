#!/usr/bin/env bash
# Verify SaaS default edge listener negotiates X25519MLKEM768 (TLS 1.3 only).
# Delegates to the shared self-host verify-tls.sh (N4/N6 openssl asserts).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
HOST="${1:-${OKKEY_WEB_HOST:-app.stage.okkey.app}}"
PORT="${2:-${OKKEY_PROXY_HTTPS_PORT:-443}}"

exec "${ROOT}/../../docker/proxy/verify-tls.sh" "${HOST}" "${PORT}"
