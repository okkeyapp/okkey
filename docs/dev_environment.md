# Development Environment

This document defines the local toolchain required to develop and test Okkey Core.

## Required tools

Core development:
- Node.js (>=25 <26)
- Yarn (^1.22.0)
- Rust toolchain (stable)
- Docker
- PostgreSQL CLI (`psql`) or project wrapper `./scripts/psql`
- Redis CLI (`redis-cli`) or project wrapper `./scripts/redis-cli`
- S3-compatible local storage (MinIO)

WASM build:
- `wasm-pack` (or the equivalent toolchain required by `packages/crypto`)

Mobile (React Native):
- iOS: Xcode + CocoaPods
- Android: Android SDK + emulator (`adb` in PATH)
- Watchman (if required by the mobile app)

Desktop (Tauri):
- `tauri-cli`
- System dependencies required by Tauri (platform-specific)

Testing:
- Unit/integration and E2E runners are expected to be installed via project scripts.

## Environment files

Create a root `.env` for local infrastructure and shared defaults:

```bash
cp .env.example .env
```

Create per-component env files:

```bash
cp services/api/.env.example services/api/.env
cp services/worker/.env.example services/worker/.env
cp apps/web/.env.example apps/web/.env
cp apps/mobile/.env.example apps/mobile/.env
cp apps/desktop/.env.example apps/desktop/.env
cp apps/extension/.env.example apps/extension/.env
cp packages/crypto/.env.example packages/crypto/.env
```

Notes:
- Local secrets are dev-only and must never be used in production.
- Keep API, Redis, and S3 endpoints consistent across components.

## Environment checks

Run the built-in environment check script:

```bash
./scripts/check-env.sh
```

Optional skips (for platforms you do not need locally):

```bash
SKIP_WASM=1 SKIP_INFRA=1 SKIP_MOBILE=1 SKIP_DESKTOP=1 ./scripts/check-env.sh
```

## Local infrastructure (Docker Compose)

1. Create your local environment file.

```bash
cp .env.example .env
```

2. Start infrastructure services.

```bash
yarn infra:up
```

3. Check status.

```bash
yarn infra:ps
```

## Postgres and Redis CLI wrappers

If native `psql`/`redis-cli` are not available, use project wrappers:

```bash
./scripts/psql --help
./scripts/redis-cli --help
```

## Version pinning

Versions are pinned in `package.json` via `engines` and `packageManager`.

## Local services

For local development, ensure PostgreSQL, Redis, and MinIO are running and reachable.
If the project later provides Docker Compose or Kubernetes manifests, prefer those.
