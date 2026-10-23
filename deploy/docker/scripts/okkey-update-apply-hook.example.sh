#!/usr/bin/env bash
# Example host-side apply hook for OKKEY_UPDATE_APPLY_MODE=hook.
# Run outside the API container (API never mounts docker.sock).
# Env from API: OKKEY_UPDATE_TARGET_OKKEY, OKKEY_UPDATE_TARGET_ENTERPRISE,
# OKKEY_UPDATE_CURRENT_*, OKKEY_UPDATE_AVAILABLE_JSON, OKKEY_VERSION_FILE.
# After exit 0 the API also writes OKKEY_VERSION_FILE when set.
set -euo pipefail

TARGET="${OKKEY_UPDATE_TARGET_OKKEY:?missing target}"
echo "okkey-update-apply: applying ${TARGET}"

# Optional compose pull/restart (operator path):
# export OKKEY_IMAGE_TAG="${TARGET}"
# docker compose -f /path/to/docker-compose.prod.yml --env-file /path/to/.env pull
# docker compose -f /path/to/docker-compose.prod.yml --env-file /path/to/.env up -d

echo "okkey-update-apply: done"
