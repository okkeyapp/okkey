# syntax=docker/dockerfile:1.7
# Shared image for okkey-api and okkey-worker (different CMD).
ARG NODE_VERSION=25

FROM node:${NODE_VERSION}-bookworm AS builder
WORKDIR /src

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Rust + wasm-pack for @okkey/crypto
ARG RUST_TOOLCHAIN=1.86.0
ARG WASM_PACK_VERSION=0.13.1
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain ${RUST_TOOLCHAIN} \
  && . "$HOME/.cargo/env" \
  && rustup target add wasm32-unknown-unknown \
  && cargo install wasm-pack --version ${WASM_PACK_VERSION} --locked
ENV PATH="/root/.cargo/bin:${PATH}"

COPY package.json yarn.lock ./
COPY scripts scripts
COPY packages packages
COPY rust rust
COPY rust-toolchain.toml rust-toolchain.toml
COPY apps/web/package.json apps/web/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY services/api services/api

# --ignore-scripts: workspace includes apps/extension (wxt postinstall); we only
# ship package.json for lockfile resolution and must not run extension prepare.
RUN node scripts/ensure-crypto-wasm-dist.mjs \
  && yarn install --frozen-lockfile --ignore-scripts \
  && yarn build:wasm \
  && yarn build:ts-sdk \
  && yarn build:email

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DEPLOY_ENV=prod

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /src/package.json /src/yarn.lock ./
COPY --from=builder /src/node_modules ./node_modules
COPY --from=builder /src/packages ./packages
COPY --from=builder /src/services/api ./services/api
COPY --from=builder /src/scripts ./scripts

# Default: API HTTP server. Worker image overrides CMD.
EXPOSE 4000
CMD ["node", "--experimental-strip-types", "services/api/src/index.ts"]

FROM runtime AS api
CMD ["node", "--experimental-strip-types", "services/api/src/index.ts"]

FROM runtime AS worker
CMD ["node", "--experimental-strip-types", "services/api/src/worker.ts"]
