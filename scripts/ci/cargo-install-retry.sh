#!/usr/bin/env bash
# Retry wrapper for `cargo install` when crates.io is flaky.
# Usage: bash scripts/ci/cargo-install-retry.sh <crate> [--version X] [--locked] ...
set -euo pipefail

if [[ "$#" -lt 1 ]]; then
  echo "usage: cargo-install-retry.sh <crate> [cargo install args...]" >&2
  exit 2
fi

export CARGO_NET_RETRY="${CARGO_NET_RETRY:-10}"
MAX_ATTEMPTS="${CARGO_INSTALL_MAX_ATTEMPTS:-5}"
attempt=1

while true; do
  echo "cargo install (attempt ${attempt}/${MAX_ATTEMPTS}; CARGO_NET_RETRY=${CARGO_NET_RETRY}): $*"
  if cargo install "$@"; then
    exit 0
  fi
  if [[ "${attempt}" -ge "${MAX_ATTEMPTS}" ]]; then
    echo "cargo install failed after ${MAX_ATTEMPTS} attempts" >&2
    exit 1
  fi
  sleep_seconds=$((attempt * 5))
  echo "cargo install failed; retrying in ${sleep_seconds}s..." >&2
  sleep "${sleep_seconds}"
  attempt=$((attempt + 1))
done
