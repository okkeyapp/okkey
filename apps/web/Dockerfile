# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=25

FROM node:${NODE_VERSION}-bookworm AS builder
WORKDIR /src

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
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain ${RUST_TOOLCHAIN} \
  && . "$HOME/.cargo/env" \
  && rustup target add wasm32-unknown-unknown \
  && cargo install wasm-pack --version ${WASM_PACK_VERSION} --locked
ENV PATH="/root/.cargo/bin:${PATH}"

# Build-time placeholders; runtime config.js overrides API URL for self-host.
ARG VITE_API_BASE_URL=http://localhost:4000
ARG VITE_APP_ENV=production
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_APP_ENV=${VITE_APP_ENV}

# --ignore-scripts: avoid @okkey/extension `wxt prepare` (entrypoints not in image).
RUN node scripts/ensure-crypto-wasm-dist.mjs \
  && yarn install --frozen-lockfile --ignore-scripts \
  && yarn build:wasm \
  && yarn build:ts-sdk \
  && yarn build:i18n \
  && yarn build:web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/docker/docker-entrypoint.sh /docker-entrypoint.d/40-okkey-runtime-config.sh
COPY --from=builder /src/apps/web/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/40-okkey-runtime-config.sh
EXPOSE 80
