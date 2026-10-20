#!/bin/sh
set -eu

: "${OKKEY_WEB_HOST:=app.example.com}"
: "${OKKEY_API_HOST:=api.example.com}"
: "${OKKEY_WEB_UPSTREAM:=web:80}"
: "${OKKEY_API_UPSTREAM:=api:4000}"

export OKKEY_WEB_HOST OKKEY_API_HOST OKKEY_WEB_UPSTREAM OKKEY_API_UPSTREAM

envsubst '${OKKEY_WEB_HOST} ${OKKEY_API_HOST} ${OKKEY_WEB_UPSTREAM} ${OKKEY_API_UPSTREAM}' \
  < /etc/nginx/templates/okkey.conf.template \
  > /etc/nginx/conf.d/okkey.conf

if [ ! -f /etc/nginx/certs/fullchain.pem ] || [ ! -f /etc/nginx/certs/privkey.pem ]; then
  echo "okkey-proxy: missing /etc/nginx/certs/{fullchain,privkey}.pem" >&2
  echo "okkey-proxy: run scripts/gen-self-signed.sh or mount real certificates" >&2
  exit 1
fi

# Fail fast if the linked OpenSSL cannot offer the hybrid group.
if ! openssl list -tls-groups 2>/dev/null | grep -q 'X25519MLKEM768'; then
  echo "okkey-proxy: OpenSSL at $(command -v openssl) does not list X25519MLKEM768" >&2
  echo "okkey-proxy: need OpenSSL ≥ 3.5 (got: $(openssl version))" >&2
  exit 1
fi

nginx -t
exec "$@"
