#!/bin/sh
set -eu

# Write runtime config for the SPA (overrides build-time VITE_API_BASE_URL).
API_URL="${OKKEY_API_PUBLIC_URL:-${VITE_API_BASE_URL:-http://localhost:4000}}"
# Trim trailing slash
API_URL=$(printf '%s' "$API_URL" | sed 's:/*$::')

# Escape for JS string literal (URLs are ASCII; reject quotes/backslashes).
case "$API_URL" in
  *\"*|*'\\'*|*$'\n'*|*$'\r'*)
    echo "OKKEY_API_PUBLIC_URL contains invalid characters" >&2
    exit 1
    ;;
esac

cat > /usr/share/nginx/html/config.js <<EOF
window.__OKKEY_RUNTIME__ = { apiBaseUrl: "${API_URL}" };
EOF

echo "okkey web runtime: apiBaseUrl=${API_URL}"
