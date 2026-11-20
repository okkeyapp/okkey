#!/usr/bin/env bash
# Install a pinned cosign release binary from GitHub (checksum verified).
# Usage: COSIGN_VERSION=2.5.3 bash scripts/ci/install-cosign.sh
# Optional: COSIGN_INSTALL_DIR=/usr/local/bin (default: /usr/local/bin)
set -euo pipefail

VERSION="${COSIGN_VERSION:-2.5.3}"
DEST_DIR="${COSIGN_INSTALL_DIR:-/usr/local/bin}"
RELEASE_REPO="sigstore/cosign"

case "${TARGETARCH:-$(uname -m)}" in
  x86_64 | amd64) ARCH="amd64" ;;
  aarch64 | arm64) ARCH="arm64" ;;
  *)
    echo "install-cosign: unsupported arch ${TARGETARCH:-$(uname -m)}" >&2
    exit 1
    ;;
esac

ASSET="cosign-linux-${ARCH}"
checksum_for() {
  case "$1" in
    cosign-linux-amd64)
      # cosign v2.5.3 — https://github.com/sigstore/cosign/releases/tag/v2.5.3
      echo "783b5d6c74105401c63946c68d9b2a4e1aab3c8abce043e06b8510b02b623ec9"
      ;;
    cosign-linux-arm64)
      echo "bffabe4cf183122b7de3111257a863c99e7dc6cf1093bfd7bf961de1795589b8"
      ;;
    *)
      return 1
      ;;
  esac
}

if [[ "${VERSION}" != "2.5.3" ]]; then
  echo "install-cosign: COSIGN_VERSION=${VERSION} has no pinned checksums in this script" >&2
  echo "Add the release asset checksums before bumping COSIGN_VERSION." >&2
  exit 1
fi

EXPECTED="$(checksum_for "${ASSET}" || true)"
if [[ -z "${EXPECTED}" ]]; then
  echo "install-cosign: no pinned SHA-256 for ${ASSET}" >&2
  exit 1
fi

if [[ -x "${DEST_DIR}/cosign" ]] && "${DEST_DIR}/cosign" version 2>/dev/null | grep -Eq "v?${VERSION}"; then
  echo "cosign ${VERSION} already installed at ${DEST_DIR}/cosign"
  exit 0
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

mkdir -p "${DEST_DIR}"
install -m 0755 "${tmpdir}/${ASSET}" "${DEST_DIR}/cosign"

echo "Installed $(${DEST_DIR}/cosign version 2>/dev/null | head -1 || echo cosign) -> ${DEST_DIR}/cosign"
