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

| Job | Interval / trigger | What it does |
|-----|-------------------|--------------|
| `item-purge` | 1 hour | Hard-deletes soft-deleted vault items past workspace retention; removes attachment objects from S3/MinIO |
| `capsule-cleanup` | 60 seconds | Deletes capsules whose `delete_at` has passed and removes related files from object storage |
| `email-queue` | Redis BRPOP | Consumes `okkey:email:queue`, sends via `EMAIL_PROVIDER` (smtp/ses/logger/http-api), retries with backoff, dead-letters to `okkey:email:dead` |

On start the worker also runs SQL migrations idempotently (`schema_migrations`), so a compose race with the API is safe.

## Email queue (Redis)

Keys:

| Key | Type | Purpose |
|-----|------|---------|
| `okkey:email:queue` | LIST | Ready jobs (API `LPUSH`, worker `BRPOP`) |
| `okkey:email:delayed` | ZSET | Retries; score = unix ms when eligible |
| `okkey:email:dead` | LIST | Failed after max attempts (default 5) |

Payload: JSON `{ id, createdAt, attempts, message: { to, from, subject, text, html }, lastError? }`.

### Delivery modes (`EMAIL_DELIVERY_MODE`)

| Mode | When | Behavior |
|------|------|----------|
| `sync` | Default when `NODE_ENV` ≠ `production` | API sends immediately via provider (local `logger` works without worker) |
| `queue` | Default when `NODE_ENV=production`; self-host compose | API enqueues only; **worker must be running** to deliver |

Override explicitly with `EMAIL_DELIVERY_MODE=sync` or `queue`.

Local tips:

- Default: `yarn dev:api` alone is enough (sync + logger).
- To exercise the queue locally: set `EMAIL_DELIVERY_MODE=queue` and run `yarn dev:worker` alongside the API.

## Production

In `deploy/docker/docker-compose.prod.yml`:

- `api` sets `RUN_BACKGROUND_JOBS=false` and `EMAIL_DELIVERY_MODE=queue`
- `worker` runs purge/capsule loops **and** the email consumer (needs the same SMTP/SES env as API)

## Related

- [`docs/backend-email.md`](../../docs/backend-email.md)
- [`deploy/docker/README.md`](../../deploy/docker/README.md)
