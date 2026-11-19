#!/bin/sh
set -eu

# Write runtime config for the SPA (overrides build-time VITE_API_BASE_URL).
# Unset/empty OKKEY_API_PUBLIC_URL → same-origin (empty apiBaseUrl). Never default to localhost.
# Explicit OKKEY_API_PUBLIC_URL is the supported runtime override (not baked at image build).
API_URL="${OKKEY_API_PUBLIC_URL:-}"
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

if [ -n "$API_URL" ]; then
  echo "okkey web runtime: apiBaseUrl=${API_URL}"
else
  echo "okkey web runtime: apiBaseUrl=(same-origin)"
fi
