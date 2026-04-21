# API Service

Minimal backend scaffold for Okkey Core.

**HTTP API contracts:** [`docs/api_contracts.md`](../../docs/api_contracts.md), OpenAPI: [`docs/openapi/core-api.yaml`](../../docs/openapi/core-api.yaml).

## What the scaffold includes

- Single entry point: `src/index.ts`
- Env loading from `services/api/.env` and `services/api/.env.local`
- Basic routing
- Storage layer:
  - Postgres client + transactions
  - Redis client
  - Repositories `users/workspaces/vaults/items/events`
- Middleware:
  - Error handling
  - CORS
  - Request logging
- Health endpoints:
  - `GET /health`
  - `GET /ready`
- Auth endpoints:
  - `POST /auth/email/start`
  - `POST /auth/email/resend`
  - `POST /auth/email/confirm`
  - `POST /auth/register/complete` (new user, split-key + first trusted device)
- Vault endpoints:
  - `GET /workspaces/:workspaceId/vaults` (Bearer session; optional `X-User-Id` in dev when enabled)
  - `GET /vaults/:vaultId` (same)
- Sync endpoints:
  - `GET /vaults/:vaultId/events?afterVersion=0` (same)
  - `POST /vaults/:vaultId/events` (same)

## Local run

1. Prepare env:

```bash
cp services/api/.env.example services/api/.env
```

The root `.env` is not used for API runtime config.  
The API reads only `services/api/.env` and `services/api/.env.local`.

2. Start the API from the repository root:

```bash
yarn dev:api
```

By default the API listens on `http://localhost:4000`.

Note: the storage layer needs `pg` and `redis` dependencies to run.

## Email providers

Three modes are supported:

- `EMAIL_PROVIDER=logger` — log sends only (default in dev)
- `EMAIL_PROVIDER=smtp` — send via SMTP
- `EMAIL_PROVIDER=http-api` — send via an external provider HTTP API

SMTP variables:

- `EMAIL_SMTP_HOST`
- `EMAIL_SMTP_PORT`
- `EMAIL_SMTP_SECURE`
- `EMAIL_SMTP_USER`
- `EMAIL_SMTP_PASSWORD`

HTTP API variables:

- `EMAIL_API_ENDPOINT`
- `EMAIL_API_KEY`
- `EMAIL_API_TIMEOUT_MS`

## Scaffold tests

From the repository root:

```bash
yarn test
```

This runs `yarn test:api` and `yarn test:e2e` (after `build:email`). Integration tests for storage need **Postgres** and **Redis**; `services/api/.env` must define `DATABASE_URL` and `REDIS_URL` (as in `.env.example`). MinIO is not required for current API tests.

```bash
yarn infra:up
```

API tests only:

```bash
yarn test:api
```

## Email login flow (v1)

- Sign-in code: 6 digits
- Code TTL: 5 minutes (configurable via env)
- Resend: at most once per 60 seconds
- Failed confirm attempts limit: 5
