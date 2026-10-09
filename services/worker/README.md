# Okkey Worker

Background job process for Okkey Core. Prefer this over in-process API timers in production.

## Entrypoint

The worker reuses `services/api` code (same Node package / Docker image family):

```bash
# from repo root
yarn dev:worker
# equivalent:
node --experimental-strip-types services/api/src/worker.ts
```

Docker image `ghcr.io/okkeyapp/worker` runs the same entrypoint.

Env loading order:

1. `services/worker/.env` (optional overrides)
2. `services/api/.env` / `.env.local` (via `loadConfig()`)

Copy `services/worker/.env.example` for local overrides.

## Jobs

| Job | Interval | What it does |
|-----|----------|--------------|
| `item-purge` | 1 hour | Hard-deletes soft-deleted vault items past workspace retention; removes attachment objects from S3/MinIO |
| `capsule-cleanup` | 60 seconds | Deletes capsules whose `delete_at` has passed and removes related files from object storage |

On start the worker also runs SQL migrations idempotently (`schema_migrations`), so a compose race with the API is safe.

## Not handled here (yet)

Transactional email (auth codes, device approval, invites, 2FA notices) is still sent from the **API** process (synchronous or fire-and-forget). A Redis/outbox consumer can be added to this worker later without inventing a second app.

## Production

In `deploy/docker/docker-compose.prod.yml`:

- `api` sets `RUN_BACKGROUND_JOBS=false`
- `worker` runs these loops

Local `yarn dev:api` keeps in-process jobs enabled by default when `NODE_ENV` is not `production` (override with `RUN_BACKGROUND_JOBS`).
