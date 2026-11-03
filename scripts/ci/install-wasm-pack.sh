#!/usr/bin/env bash
# Install a pinned wasm-pack release binary from GitHub (avoids crates.io).
# Usage: WASM_PACK_VERSION=0.13.1 bash scripts/ci/install-wasm-pack.sh
set -euo pipefail

VERSION="${WASM_PACK_VERSION:-0.13.1}"
DEST_DIR="${WASM_PACK_INSTALL_DIR:-${CARGO_HOME:-$HOME/.cargo}/bin}"
RELEASE_REPO="wasm-bindgen/wasm-pack"

case "$(uname -s)" in
  Linux) ;;
  *)
    echo "install-wasm-pack: unsupported OS $(uname -s); expected Linux" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) TARGET="x86_64-unknown-linux-musl" ;;
  aarch64 | arm64) TARGET="aarch64-unknown-linux-musl" ;;
  *)
    echo "install-wasm-pack: unsupported arch $(uname -m)" >&2
    exit 1
    ;;
esac

ASSET="wasm-pack-v${VERSION}-${TARGET}.tar.gz"
checksum_for() {
  case "$1" in
    wasm-pack-v0.13.1-x86_64-unknown-linux-musl.tar.gz)
      echo "c539d91ccab2591a7e975bcf82c82e1911b03335c80aa83d67ad25ed2ad06539"
      ;;
    wasm-pack-v0.13.1-aarch64-unknown-linux-musl.tar.gz)
      echo "2e65038769f8bbaa5fc237ad4bb523e692df99458cbd3e3d92525b89d8762379"
      ;;
    *)
      return 1
      ;;
  esac
}

EXPECTED="$(checksum_for "${ASSET}" || true)"
if [[ -z "${EXPECTED}" ]]; then
  echo "install-wasm-pack: no pinned SHA-256 for ${ASSET}" >&2
  echo "Add the release asset checksum before bumping WASM_PACK_VERSION." >&2
  exit 1
fi

if [[ -x "${DEST_DIR}/wasm-pack" ]]; then
  if "${DEST_DIR}/wasm-pack" --version 2>/dev/null | grep -Fq "${VERSION}"; then
    echo "wasm-pack ${VERSION} already installed at ${DEST_DIR}/wasm-pack"
    exit 0
  fi
fi

URL="https://github.com/${RELEASE_REPO}/releases/download/v${VERSION}/${ASSET}"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

echo "Downloading ${URL}"
curl --proto '=https' --tlsv1.2 \
  --fail --silent --show-error --location \
  --retry 10 --retry-delay 2 --retry-all-errors \
  --output "${tmpdir}/${ASSET}" \
  "${URL}"

echo "${EXPECTED}  ${tmpdir}/${ASSET}" | sha256sum -c -

tar -xzf "${tmpdir}/${ASSET}" -C "${tmpdir}"
mkdir -p "${DEST_DIR}"
install -m 0755 \
  "${tmpdir}/wasm-pack-v${VERSION}-${TARGET}/wasm-pack" \
  "${DEST_DIR}/wasm-pack"

echo "Installed $(${DEST_DIR}/wasm-pack --version) -> ${DEST_DIR}/wasm-pack"
