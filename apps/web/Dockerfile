# syntax=docker/dockerfile:1.7
# Third-party bases are pinned by multi-arch index digest. The tag documents
# the channel; the pull uses the digest. NODE_VERSION must stay 25.
ARG NODE_VERSION=25

# node:25-bookworm
FROM node:25-bookworm@sha256:78839ac448c23517f8eab2e8f7943d9b4f73979eb7f8bed2c73dbf72ff869e7b AS builder
WORKDIR /src
ARG NODE_VERSION
RUN test "${NODE_VERSION}" = "25"

COPY package.json yarn.lock ./
COPY scripts scripts
COPY packages packages
COPY rust rust
COPY rust-toolchain.toml rust-toolchain.toml
COPY apps/web apps/web
COPY apps/extension/package.json apps/extension/package.json

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

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

# Build-time placeholders; runtime config.js overrides API URL for self-host.
ARG VITE_API_BASE_URL=http://localhost:4000
ARG VITE_APP_ENV=production
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_APP_ENV=${VITE_APP_ENV}

# Yarn classic defaults to a short network timeout; flaky registry pulls under
# multi-arch CI need a longer budget. Cache mount keeps downloaded tarballs
# across builds (paired with buildx GHA cache).
ENV YARN_CACHE_FOLDER=/usr/local/share/.cache/yarn
ENV YARN_NETWORK_TIMEOUT=600000

# --ignore-scripts: avoid @okkey/extension `wxt prepare` (entrypoints not in image).
# vite build only: Core image has no enterprise module sibling; tsc -b would fail on
# enterprise path aliases that Vite stubs at bundle time.
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
  --mount=type=cache,target=/root/.cargo/registry \
  --mount=type=cache,target=/root/.cargo/git \
  node scripts/ensure-crypto-wasm-dist.mjs \
  && yarn config set network-timeout 600000 \
  && yarn install --frozen-lockfile --ignore-scripts --network-timeout 600000 \
  && yarn build:wasm \
  && yarn build:ts-sdk \
  && yarn build:i18n \
  && yarn --cwd apps/web vite build

# nginx:1.27-alpine
FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS runtime
COPY apps/web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/docker/docker-entrypoint.sh /docker-entrypoint.d/40-okkey-runtime-config.sh
COPY --from=builder /src/apps/web/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/40-okkey-runtime-config.sh
EXPOSE 80
