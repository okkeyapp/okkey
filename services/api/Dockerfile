# syntax=docker/dockerfile:1.7
# Shared image for okkey-api and okkey-worker (different CMD).
# Third-party bases are pinned by multi-arch index digest. The tag documents
# the channel; the pull uses the digest. NODE_VERSION must stay 25.
#
# Runtime is assembled from gcr.io/distroless/cc-debian12:nonroot with system
# OpenSSL removed, then sealed into FROM scratch. Official Node 25 embeds its
# own OpenSSL and does not dynamically link libssl/libcrypto; api/worker also
# ship no native addons that need system OpenSSL. Stripping libssl3 keeps the
# Trivy OS gate clear of Debian OpenSSL CVEs that have no bookworm fix.
ARG NODE_VERSION=25

# node:25-bookworm
FROM node:25-bookworm@sha256:78839ac448c23517f8eab2e8f7943d9b4f73979eb7f8bed2c73dbf72ff869e7b AS builder
WORKDIR /src
ARG NODE_VERSION
RUN test "${NODE_VERSION}" = "25"

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY scripts/ci/install-wasm-pack.sh scripts/ci/install-wasm-pack.sh

# Rust + wasm-pack for @okkey/crypto
ARG RUST_TOOLCHAIN=1.86.0
ARG WASM_PACK_VERSION=0.13.1
ENV CARGO_NET_RETRY=10
RUN --mount=type=cache,target=/root/.cargo/registry \
  --mount=type=cache,target=/root/.cargo/git \
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain ${RUST_TOOLCHAIN} \
  && . "$HOME/.cargo/env" \
  && rustup target add wasm32-unknown-unknown \
  && WASM_PACK_VERSION=${WASM_PACK_VERSION} bash scripts/ci/install-wasm-pack.sh
ENV PATH="/root/.cargo/bin:${PATH}"

COPY package.json yarn.lock ./
COPY scripts scripts
COPY packages packages
COPY rust rust
COPY rust-toolchain.toml rust-toolchain.toml
COPY apps/web/package.json apps/web/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY services/api services/api

# Yarn classic defaults to a short network timeout; flaky registry pulls under
# multi-arch CI need a longer budget. Cache mount keeps downloaded tarballs
# across builds (paired with buildx GHA cache).
ENV YARN_CACHE_FOLDER=/usr/local/share/.cache/yarn
ENV YARN_NETWORK_TIMEOUT=600000

# --ignore-scripts: workspace includes apps/extension (wxt postinstall); we only
# ship package.json for lockfile resolution and must not run extension prepare.
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
  --mount=type=cache,target=/root/.cargo/registry \
  --mount=type=cache,target=/root/.cargo/git \
  node scripts/ensure-crypto-wasm-dist.mjs \
  && yarn config set network-timeout 600000 \
  && yarn install --frozen-lockfile --ignore-scripts --network-timeout 600000 \
  && yarn build:wasm \
  && yarn build:ts-sdk \
  && yarn build:email

# Production dependency set for the runtime image: only packages the API/worker
# process loads. Excludes apps/web, apps/extension, and other client workspaces
# so build-only tools never land in the published image.
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS prod-deps
WORKDIR /app
ARG NODE_VERSION
RUN test "${NODE_VERSION}" = "25"
ENV NODE_ENV=production
ENV YARN_CACHE_FOLDER=/usr/local/share/.cache/yarn
ENV YARN_NETWORK_TIMEOUT=600000
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /src/package.json /src/yarn.lock ./
COPY --from=builder /src/packages/crypto ./packages/crypto
COPY --from=builder /src/packages/email-templates ./packages/email-templates
COPY --from=builder /src/packages/i18n ./packages/i18n
COPY --from=builder /src/packages/id ./packages/id
COPY --from=builder /src/packages/types ./packages/types

RUN node <<'NODE'
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.workspaces = [
  "packages/crypto",
  "packages/email-templates",
  "packages/i18n",
  "packages/id",
  "packages/types",
];
delete pkg.resolutions;
fs.writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
NODE

RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
  yarn config set network-timeout 600000 \
  && yarn install --frozen-lockfile --ignore-scripts --production --network-timeout 600000

# Node binary + libatomic only. Do not overlay bookworm libssl/libcrypto —
# Node embeds OpenSSL, and the assembled runtime deliberately drops system
# OpenSSL from the distroless/cc rootfs. TARGETARCH comes from BuildKit.
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS node-runtime-bits
ARG TARGETARCH
ARG NODE_VERSION
RUN test "${NODE_VERSION}" = "25"
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get upgrade -y \
  && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64) LIBDIR=x86_64-linux-gnu ;; \
    arm64) LIBDIR=aarch64-linux-gnu ;; \
    *) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  mkdir -p \
    /export/usr/local/bin \
    /export/lib/${LIBDIR} \
    /export/var/lib/dpkg/status.d; \
  cp -a /usr/local/bin/node /export/usr/local/bin/node; \
  cp -a /lib/${LIBDIR}/libatomic.so.1* /export/lib/${LIBDIR}/; \
  dpkg-query -s libatomic1 \
    | awk 'BEGIN{ORS="\n"} /^Package:|^Source:|^Version:|^Architecture:|^Maintainer:|^Installed-Size:|^Depends:|^Breaks:|^Replaces:|^Homepage:|^Priority:|^Section:|^Multi-Arch:|^Description:/{print}' \
    > /export/var/lib/dpkg/status.d/libatomic1; \
  # Fail the build if this stage accidentally ships system OpenSSL.
  if ldd /export/usr/local/bin/node | grep -E 'libssl|libcrypto'; then \
    echo "node unexpectedly links system OpenSSL" >&2; \
    ldd /export/usr/local/bin/node >&2; \
    exit 1; \
  fi

# Assemble the final rootfs: distroless/cc minus OpenSSL, plus Node bits and
# the app tree. bookworm-slim provides the shell/tools needed to strip and
# assert; the sealed runtime is FROM scratch below.
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS assemble
ARG TARGETARCH
ARG NODE_VERSION
RUN test "${NODE_VERSION}" = "25"
ENV DEBIAN_FRONTEND=noninteractive
# gcr.io/distroless/cc-debian12:nonroot — glibc + libgcc/libstdc++ + CA certs.
# Cosign is not baked in: the update-agent runs a pinned cosign image via the
# Docker socket (see createDockerCosignRunner) so api/worker stay free of
# cosign gobinary CVEs in the Trivy gate.
COPY --from=gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f / /export/
COPY --from=node-runtime-bits /export/ /export/
COPY --from=prod-deps --chown=65532:65532 /app/package.json /app/yarn.lock /export/app/
COPY --from=prod-deps --chown=65532:65532 /app/node_modules /export/app/node_modules/
COPY --from=prod-deps --chown=65532:65532 /app/packages /export/app/packages/
COPY --from=builder --chown=65532:65532 /src/services/api /export/app/services/api/
COPY --from=builder --chown=65532:65532 /src/scripts /export/app/scripts/
# bash: process substitution so addon checks fail the stage (not only a pipe subshell).
SHELL ["/bin/bash", "-euxo", "pipefail", "-c"]
RUN <<'EOF'
case "${TARGETARCH}" in
  amd64) LIBDIR=x86_64-linux-gnu ;;
  arm64) LIBDIR=aarch64-linux-gnu ;;
  *) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;;
esac
# Drop system OpenSSL from the distroless/cc rootfs (libs + scanner metadata).
rm -f \
  /export/usr/lib/${LIBDIR}/libssl.so.3* \
  /export/usr/lib/${LIBDIR}/libcrypto.so.3* \
  /export/lib/${LIBDIR}/libssl.so.3* \
  /export/lib/${LIBDIR}/libcrypto.so.3*
rm -rf \
  /export/usr/lib/${LIBDIR}/engines-3 \
  /export/usr/lib/${LIBDIR}/ossl-modules \
  /export/usr/share/doc/libssl3 \
  /export/var/lib/dpkg/status.d/libssl3 \
  /export/var/lib/dpkg/status.d/libssl3.md5sums \
  /export/var/lib/dpkg/status.d/openssl \
  /export/var/lib/dpkg/status.d/openssl.md5sums
# Fail closed if any OpenSSL shared lib or package metadata remains.
leftovers="$(find /export \( \
    -type f \( \
      -name 'libssl.so.3*' -o -name 'libcrypto.so.3*' -o \
      -path '*/var/lib/dpkg/status.d/libssl3' -o \
      -path '*/var/lib/dpkg/status.d/libssl3.md5sums' -o \
      -path '*/var/lib/dpkg/status.d/openssl' -o \
      -path '*/var/lib/dpkg/status.d/openssl.md5sums' \
    \) -o \
    -type d \( -name 'engines-3' -o -name 'ossl-modules' \) \
  \) -print 2>/dev/null || true)"
if [ -n "${leftovers}" ]; then
  echo "OpenSSL artifacts remain in runtime rootfs:" >&2
  printf '%s\n' "${leftovers}" >&2
  exit 1
fi
if ldd /export/usr/local/bin/node | grep -E 'libssl|libcrypto'; then
  echo "node unexpectedly links system OpenSSL after assemble" >&2
  ldd /export/usr/local/bin/node >&2
  exit 1
fi
# Refuse native addons that pull system OpenSSL into the runtime.
while IFS= read -r -d '' addon; do
  if ldd "${addon}" 2>/dev/null | grep -E 'libssl|libcrypto'; then
    echo "native addon links system OpenSSL: ${addon}" >&2
    ldd "${addon}" >&2
    exit 1
  fi
  if command -v readelf >/dev/null 2>&1; then
    if readelf -d "${addon}" 2>/dev/null | grep -Ei 'NEEDED.*(libssl|libcrypto)'; then
      echo "native addon NEEDED system OpenSSL: ${addon}" >&2
      readelf -d "${addon}" >&2
      exit 1
    fi
  fi
done < <(find /export/app -type f -name '*.node' -print0 2>/dev/null || true)
EOF
SHELL ["/bin/sh", "-c"]

# Sealed runtime: no shell/package manager. Nonroot uid 65532 comes from the
# copied distroless /etc/passwd. PATH must be set explicitly on scratch.
FROM scratch AS runtime
ARG NODE_VERSION
ARG OKKEY_GIT_SHA=
ENV OKKEY_GIT_SHA=${OKKEY_GIT_SHA}
# Optional. Set when building an image that also bundles enterprise modules so
# the System update UI can show a separate enterprise short SHA. Core-only
# publishes leave this empty; packaging overlays may pass it as a build-arg or
# set OKKEY_ENTERPRISE_GIT_SHA at runtime (do not assign an empty compose value).
ARG OKKEY_ENTERPRISE_GIT_SHA=
ENV OKKEY_ENTERPRISE_GIT_SHA=${OKKEY_ENTERPRISE_GIT_SHA}
ENV NODE_ENV=production
ENV DEPLOY_ENV=prod
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
COPY --from=assemble /export/ /
WORKDIR /app
USER nonroot
EXPOSE 4000
# Absolute node path: works as PID 1 for SIGTERM/SIGINT; compose healthchecks
# still resolve `node` via PATH (/usr/local/bin).
CMD ["/usr/local/bin/node", "--experimental-strip-types", "services/api/src/index.ts"]

FROM runtime AS api
# Exec-form only: scratch/distroless has no /bin/sh. Compose uses the same node fetch probe.
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=12 \
  CMD ["/usr/local/bin/node", "-e", "fetch('http://127.0.0.1:4000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["/usr/local/bin/node", "--experimental-strip-types", "services/api/src/index.ts"]

FROM runtime AS worker
CMD ["/usr/local/bin/node", "--experimental-strip-types", "services/api/src/worker.ts"]
