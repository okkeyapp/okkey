#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

failures=0

note() {
  printf "\n==> %s\n" "$1"
}

ok() {
  printf "  [ok] %s\n" "$1"
}

warn() {
  printf "  [warn] %s\n" "$1"
}

err() {
  printf "  [error] %s\n" "$1"
  failures=$((failures + 1))
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

print_version() {
  local cmd="$1"
  local args="$2"
  if command_exists "$cmd"; then
    local out
    out=$($cmd $args 2>/dev/null | head -n 1 | tr -d '\r')
    if [[ -n "$out" ]]; then
      ok "$cmd: $out"
    else
      ok "$cmd: (version not detected)"
    fi
  else
    err "$cmd not found in PATH"
  fi
}

note "Core toolchain"
print_version node "--version"
print_version yarn "--version"
print_version rustc "--version"
print_version cargo "--version"

note "Version policy"
ok "node: >=25 <26"
ok "yarn: ^1.22.0"

if [[ "${SKIP_WASM:-}" != "1" ]]; then
  note "WASM toolchain"
  if command_exists wasm-pack; then
    print_version wasm-pack "--version"
  else
    warn "wasm-pack not found in PATH (set SKIP_WASM=1 to skip)"
  fi
fi

if [[ "${SKIP_INFRA:-}" != "1" ]]; then
  note "Local infrastructure"
  print_version docker "--version"

  if command_exists psql; then
    print_version psql "--version"
  elif [[ -x "$ROOT_DIR/scripts/psql" ]]; then
    ok "psql: using ./scripts/psql wrapper (docker compose)"
  else
    err "psql not found in PATH"
  fi

  if command_exists redis-cli; then
    print_version redis-cli "--version"
  elif [[ -x "$ROOT_DIR/scripts/redis-cli" ]]; then
    ok "redis-cli: using ./scripts/redis-cli wrapper (docker compose)"
  else
    err "redis-cli not found in PATH"
  fi

  if command_exists minio; then
    print_version minio "--version"
  else
    warn "minio not found in PATH (set SKIP_INFRA=1 to skip)"
  fi
fi

if [[ "${SKIP_MOBILE:-}" != "1" ]]; then
  note "React Native toolchain"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    print_version xcodebuild "-version"
    print_version pod "--version"
  else
    warn "Skipping Xcode/CocoaPods checks (non-macOS). Set SKIP_MOBILE=1 to skip entirely."
  fi
  print_version adb "--version"
fi

if [[ "${SKIP_DESKTOP:-}" != "1" ]]; then
  note "Desktop (Tauri) toolchain"
  print_version tauri "--version"
fi

note "Summary"
if [[ $failures -eq 0 ]]; then
  ok "All required commands found"
else
  err "Missing $failures required command(s)"
  printf "\nSet SKIP_WASM=1, SKIP_INFRA=1, SKIP_MOBILE=1, or SKIP_DESKTOP=1 to skip optional groups.\n"
fi

exit $failures
