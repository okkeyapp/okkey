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

## Worker / background jobs

Production self-host runs jobs in a separate process (`services/api/src/worker.ts`, image `ghcr.io/okkeyapp/worker`):

- soft-deleted item hard-purge (hourly)
- expired capsule cleanup (every 60s)

Locally: `yarn dev:worker`. See [`services/worker/README.md`](../worker/README.md).

SQL migrations under `migrations/` apply automatically on API (and worker) start via `schema_migrations`.

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

Transports (`EMAIL_PROVIDER`) are protocols, not named vendors. See [`docs/backend-email.md`](../../docs/backend-email.md) and `services/api/.env.example` for presets.

- `EMAIL_PROVIDER=logger` — log sends only (default; used in CI)
- `EMAIL_PROVIDER=smtp` — any SMTP host (personal mailbox or Unisender Go / Postmark / Resend / OVH / …)
- `EMAIL_PROVIDER=ses` — AWS SES API (SigV4) with optional `EMAIL_SES_ENDPOINT` for SES-compatible APIs (Yandex Cloud Postbox)
- `EMAIL_PROVIDER=http-api` — generic JSON POST + Bearer webhook

Set `PUBLIC_APP_URL` (e.g. `http://localhost:5173`) so invite emails contain a working link.

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
