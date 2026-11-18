# syntax=docker/dockerfile:1.7
# Shared image for okkey-api and okkey-worker (different CMD).
# Third-party bases are pinned by multi-arch index digest. The tag documents
# the channel; the pull uses the digest. NODE_VERSION must stay 25.
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

# node:25-bookworm-slim
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS runtime
WORKDIR /app
ARG NODE_VERSION
RUN test "${NODE_VERSION}" = "25"
ENV NODE_ENV=production
ENV DEPLOY_ENV=prod
ENV DEBIAN_FRONTEND=noninteractive

# Refresh OS packages on the pinned base. Health checks use node fetch, so curl
# is not installed. Drop the base image package managers after upgrade.
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /usr/local/lib/node_modules \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /opt/yarn-v* \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg \
  && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /app/package.json /app/yarn.lock ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages ./packages
COPY --from=builder /src/services/api ./services/api
COPY --from=builder /src/scripts ./scripts

# Default: API HTTP server. Worker image overrides CMD.
EXPOSE 4000
CMD ["node", "--experimental-strip-types", "services/api/src/index.ts"]

FROM runtime AS api
CMD ["node", "--experimental-strip-types", "services/api/src/index.ts"]

FROM runtime AS worker
CMD ["node", "--experimental-strip-types", "services/api/src/worker.ts"]
