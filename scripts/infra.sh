#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
ENV_FILE="$ROOT_DIR/.env"

usage() {
  cat <<'USAGE'
Usage: ./scripts/infra.sh <command>

Commands:
  up       Start infrastructure containers
  down     Stop and remove containers
  ps       Show container status
  logs     Tail logs for all containers
  health   Show health status
USAGE
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env. Create it from .env.example first." >&2
  exit 1
fi

cmd="${1:-}"
if [[ -z "$cmd" ]]; then
  usage
  exit 1
fi

case "$cmd" in
  up)
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
    ;;
  down)
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down
    ;;
  ps)
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
    ;;
  logs)
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs -f
    ;;
  health)
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --format json | cat
    ;;
  *)
    usage
    exit 1
    ;;
esac
