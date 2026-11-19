# syntax=docker/dockerfile:1.7
# Shared image for okkey-api and okkey-worker (different CMD).
# Third-party bases are pinned by multi-arch index digest. The tag documents
# the channel; the pull uses the digest. NODE_VERSION must stay 25.
#
# Runtime is distroless/cc (no shell/package manager). There is no official
# distroless/nodejs image for Node 25, so the Node binary and libatomic come
# from the pinned node:25-bookworm-slim image after an OS upgrade. Patched
# OpenSSL shared libraries (and matching dpkg status.d metadata) are overlaid
# so scanners see the fixed bookworm package version.
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

# Collect the Node 25 binary plus the OS pieces the runtime still needs after
# leaving bookworm-slim. TARGETARCH comes from BuildKit (amd64 / arm64).
# Cosign is not baked into api/worker: the gobinary trips the CRITICAL/HIGH
# Trivy gate. The update-agent fetches the pinned release (version + SHA-256
# in scripts/ci/install-cosign.sh / cosign-bootstrap.ts) on first verify.
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS node-runtime-bits
ARG TARGETARCH
ARG NODE_VERSION
RUN test "${NODE_VERSION}" = "25"
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates \
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
    /export/usr/lib/${LIBDIR} \
    /export/etc/ssl/certs \
    /export/var/lib/dpkg/status.d; \
  cp -a /usr/local/bin/node /export/usr/local/bin/node; \
  cp -a /lib/${LIBDIR}/libatomic.so.1* /export/lib/${LIBDIR}/; \
  cp -a /usr/lib/${LIBDIR}/libssl.so.3 /export/usr/lib/${LIBDIR}/; \
  cp -a /usr/lib/${LIBDIR}/libcrypto.so.3 /export/usr/lib/${LIBDIR}/; \
  if [ -d /usr/lib/${LIBDIR}/engines-3 ]; then \
    cp -a /usr/lib/${LIBDIR}/engines-3 /export/usr/lib/${LIBDIR}/; \
  fi; \
  if [ -d /usr/lib/${LIBDIR}/ossl-modules ]; then \
    cp -a /usr/lib/${LIBDIR}/ossl-modules /export/usr/lib/${LIBDIR}/; \
  fi; \
  cp -a /etc/ssl/certs/ca-certificates.crt /export/etc/ssl/certs/; \
  # Distroless advertises packages via status.d; refresh OpenSSL + CA metadata
  # so Trivy matches the overlaid shared libraries.
  dpkg-query -s libssl3 \
    | awk 'BEGIN{ORS="\n"} /^Package:|^Source:|^Version:|^Architecture:|^Maintainer:|^Installed-Size:|^Depends:|^Breaks:|^Replaces:|^Homepage:|^Priority:|^Section:|^Multi-Arch:|^Description:/{print}' \
    > /export/var/lib/dpkg/status.d/libssl3; \
  dpkg-query -s ca-certificates \
    | awk 'BEGIN{ORS="\n"} /^Package:|^Source:|^Version:|^Architecture:|^Maintainer:|^Installed-Size:|^Depends:|^Breaks:|^Replaces:|^Homepage:|^Priority:|^Section:|^Multi-Arch:|^Description:/{print}' \
    > /export/var/lib/dpkg/status.d/ca-certificates

# gcr.io/distroless/cc-debian12:nonroot — no shell, package managers, or OS
# utilities (perl/gzip/util-linux/ncurses/pam/acl/udev). Runs as uid 65532.
FROM gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f AS runtime
ARG NODE_VERSION
# Distroless has no shell; keep the version pin documented for readers/CI.
WORKDIR /app
# Baked at image build time. Must be this repository's commit (the core that
# built api/worker). Empty default for local builds. Downstream image rebuilds
# must pass the same SHA through unchanged — do not substitute a packaging or
# wrapper commit. Must live on the final runtime stage (api/worker inherit it)
# — not on prod-deps / builder. ARG/ENV only; no shell required.
ARG OKKEY_GIT_SHA=
ENV OKKEY_GIT_SHA=${OKKEY_GIT_SHA}
ENV NODE_ENV=production
ENV DEPLOY_ENV=prod

COPY --from=node-runtime-bits /export/ /
COPY --from=prod-deps --chown=65532:65532 /app/package.json /app/yarn.lock ./
COPY --from=prod-deps --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=prod-deps --chown=65532:65532 /app/packages ./packages
COPY --from=builder --chown=65532:65532 /src/services/api ./services/api
COPY --from=builder --chown=65532:65532 /src/scripts ./scripts

USER nonroot
EXPOSE 4000
# Absolute node path: works as PID 1 for SIGTERM/SIGINT; compose healthchecks
# still resolve `node` via PATH (/usr/local/bin).
CMD ["/usr/local/bin/node", "--experimental-strip-types", "services/api/src/index.ts"]

FROM runtime AS api
# Exec-form only: distroless has no /bin/sh. Compose uses the same node fetch probe.
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=12 \
  CMD ["/usr/local/bin/node", "-e", "fetch('http://127.0.0.1:4000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["/usr/local/bin/node", "--experimental-strip-types", "services/api/src/index.ts"]

FROM runtime AS worker
CMD ["/usr/local/bin/node", "--experimental-strip-types", "services/api/src/worker.ts"]
