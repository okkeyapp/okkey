#!/usr/bin/env bash
# Guard: OKKEY_SALES_EMAIL is resolved before any install file rewrite.
# Run: bash deploy/docker/install-sales-email-order.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
INSTALL_SH="${ROOT}/install.sh"

# --- Structural: resolve before first fetch_file in the main body ---
# (Helpers may mention fetch_file earlier; compare line numbers of the calls.)
resolve_line="$(rg -n '^resolve_sales_email$' "${INSTALL_SH}" | head -1 | cut -d: -f1)"
fetch_line="$(rg -n 'fetch_file "\$COMPOSE_FILE_NAME"' "${INSTALL_SH}" | head -1 | cut -d: -f1)"
[[ -n "${resolve_line}" && -n "${fetch_line}" ]] || {
  echo "FAIL: could not locate resolve_sales_email / fetch_file compose call" >&2
  exit 1
}
[[ "${resolve_line}" -lt "${fetch_line}" ]] || {
  echo "FAIL: resolve_sales_email (line ${resolve_line}) must run before fetch_file compose (line ${fetch_line})" >&2
  exit 1
}

# --- Functional: non-interactive upgrade without address leaves compose/.env untouched ---
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/okkey-upgrade-sales.XXXXXX")"
cleanup() { rm -rf "${WORKDIR}"; }
trap cleanup EXIT

# Stub docker just enough for the early `docker compose version` gate; install must
# die on sales-email before any real compose/pull would be needed.
FAKEBIN="${WORKDIR}/bin"
mkdir -p "${FAKEBIN}"
cat > "${FAKEBIN}/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "compose" && "${2:-}" == "version" ]]; then
  echo "Docker Compose version 2.0.0"
  exit 0
fi
echo "unexpected docker invocation: $*" >&2
exit 99
EOF
chmod +x "${FAKEBIN}/docker"

INSTALL_DIR="${WORKDIR}/okkey"
mkdir -p "${INSTALL_DIR}"
# Sentinel compose + .env as if a prior install existed (no OKKEY_SALES_EMAIL key).
printf '# sentinel-compose-v1\nservices: {}\n' > "${INSTALL_DIR}/docker-compose.prod.yml"
printf 'JWT_SECRET=old\nPOSTGRES_PASSWORD=old\n' > "${INSTALL_DIR}/.env"
before_compose="$(cksum "${INSTALL_DIR}/docker-compose.prod.yml")"
before_env="$(cksum "${INSTALL_DIR}/.env")"

set +e
# No controlling tty, no OKKEY_SALES_EMAIL — must die before rewriting install files.
out="$(
  setsid env -i \
    PATH="${FAKEBIN}:/usr/bin:/bin" \
    HOME="${HOME}" \
    OKKEY_INSTALL_DIR="${INSTALL_DIR}" \
    bash "${INSTALL_SH}" </dev/null 2>&1
)"
rc=$?
set -e

[[ "${rc}" -ne 0 ]] || {
  echo "FAIL: expected non-zero exit for non-interactive upgrade without sales email" >&2
  echo "${out}" >&2
  exit 1
}
printf '%s\n' "${out}" | grep -Fq 'OKKEY_SALES_EMAIL is required (non-interactive install)' || {
  echo "FAIL: expected clear non-interactive sales-email error" >&2
  echo "${out}" >&2
  exit 1
}
printf '%s\n' "${out}" | grep -Fq 'unexpected docker invocation' && {
  echo "FAIL: installer reached docker beyond version check" >&2
  echo "${out}" >&2
  exit 1
}

after_compose="$(cksum "${INSTALL_DIR}/docker-compose.prod.yml")"
after_env="$(cksum "${INSTALL_DIR}/.env")"
[[ "${before_compose}" == "${after_compose}" ]] || {
  echo "FAIL: docker-compose.prod.yml changed on failed upgrade" >&2
  echo "before=${before_compose}" >&2
  echo "after=${after_compose}" >&2
  exit 1
}
[[ "${before_env}" == "${after_env}" ]] || {
  echo "FAIL: .env changed on failed upgrade" >&2
  echo "before=${before_env}" >&2
  echo "after=${after_env}" >&2
  exit 1
}

echo "OK: sales-email order (structural + non-interactive upgrade untouched)"
