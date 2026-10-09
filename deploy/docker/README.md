# Self-host Okkey in 5 minutes

Run Okkey Core on your own machine with Docker Compose — **no monorepo clone or local build**.

## One-command install

```bash
curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/dev/deploy/docker/install.sh | bash
```

This will:

1. Create `~/okkey` (override with `OKKEY_INSTALL_DIR`)
2. Download `docker-compose.prod.yml` + `.env.example`
3. Generate `JWT_SECRET`, `SESSION_SECRET`, Postgres and MinIO passwords
4. `docker compose pull && up -d`

Then open **http://localhost:8080** (web) and check **http://localhost:4000/health** (API).

> First CI publish (PR #19): tag `v0.0.0-pr19.3` → images `ghcr.io/okkeyapp/{api,web,worker}:0.0.0-pr19.3` (also `:v0.0.0-pr19.3`).  
> Workflow: https://github.com/okkeyapp/okkey/actions/runs/37924403393  
> Set `OKKEY_IMAGE_TAG=0.0.0-pr19.3` in `.env` (default in `.env.example`).  
> `workflow_dispatch` appears in the Actions UI only after `publish-images.yml` is on the default branch (`main`). Until then, push a `v*` tag on a commit that contains the workflow.

## Manual install

```bash
mkdir -p ~/okkey && cd ~/okkey
curl -fsSL -O https://raw.githubusercontent.com/okkeyapp/okkey/dev/deploy/docker/docker-compose.prod.yml
curl -fsSL -O https://raw.githubusercontent.com/okkeyapp/okkey/dev/deploy/docker/.env.example
cp .env.example .env
# edit secrets and PUBLIC_APP_URL / OKKEY_API_PUBLIC_URL
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

## Services

| Service | Image | Role |
|---------|-------|------|
| `web` | `ghcr.io/okkeyapp/web` | SPA (nginx); `OKKEY_API_PUBLIC_URL` → `/config.js` |
| `api` | `ghcr.io/okkeyapp/api` | HTTP API + SQL migrations on start; enqueues email to Redis |
| `worker` | `ghcr.io/okkeyapp/worker` | Item purge, capsule cleanup, **email queue consumer** |
| `postgres` | `postgres:16-alpine` | Metadata / events |
| `redis` | `redis:7-alpine` | Sessions / cache / locks / **email queue** |
| `minio` | `pgsty/minio` | S3-compatible attachments (MinIO Community rebuild; upstream Hub/Quay images are gone) |
| `minio-init` | `amazon/aws-cli` | Creates the S3 bucket once at start |

API runs with `RUN_BACKGROUND_JOBS=false` and `EMAIL_DELIVERY_MODE=queue`; the worker owns periodic jobs and outbound mail. See [`services/worker/README.md`](../../services/worker/README.md).

## Email

Default `EMAIL_PROVIDER=logger` (codes appear in **worker** logs when queued). For real mail set SMTP vars in `.env` (see `.env.example` and [`docs/backend-email.md`](../../docs/backend-email.md)).

Self-host uses Redis keys `okkey:email:queue` / `okkey:email:delayed` / `okkey:email:dead`. Keep the worker up or mail will sit in the queue.

## TLS / domain

Put a reverse proxy (Caddy, Traefik, nginx) in front of `web` and `api`, then set:

- `PUBLIC_APP_URL=https://app.example.com`
- `OKKEY_API_PUBLIC_URL=https://api.example.com`
- `CORS_ORIGIN` / `WEBAUTHN_ORIGINS` / `WEBAUTHN_RP_ID` accordingly

## Local image build (developers)

From the monorepo root:

```bash
docker build -f services/api/Dockerfile --target api -t ghcr.io/okkeyapp/api:local .
docker build -f services/api/Dockerfile --target worker -t ghcr.io/okkeyapp/worker:local .
docker build -f apps/web/Dockerfile -t ghcr.io/okkeyapp/web:local .
```

Then in `~/okkey/.env`:

```text
OKKEY_IMAGE_TAG=local
OKKEY_API_IMAGE=ghcr.io/okkeyapp/api
OKKEY_WEB_IMAGE=ghcr.io/okkeyapp/web
OKKEY_WORKER_IMAGE=ghcr.io/okkeyapp/worker
```

Install without hitting the registry:

```bash
OKKEY_SKIP_PULL=1 ./deploy/docker/install.sh
```

GHCR packages for `okkeyapp/{api,web,worker}` must be **public** (or your Docker login needs `read:packages`). Anonymous pull returns 401/403 while they stay private.

## Dev infrastructure

The repo-root `docker-compose.yml` remains **infra-only** for local development (`yarn infra:up`). Do not confuse it with this production compose file.
