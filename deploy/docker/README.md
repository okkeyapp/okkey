# Self-host Okkey in 5 minutes

Run Okkey Core on your own machine with Docker Compose — **no monorepo clone or local build**.

## One-command install

```bash
curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/dev/deploy/docker/install.sh | bash
```

Note: `OKKEY_REF=…` / `OKKEY_IMAGE_TAG=…` (if set) must be on the **right** of `|` so the installer process sees them — `VAR=x curl | bash` does **not** pass `VAR` into `bash`.

`.env.example` defaults to `OKKEY_IMAGE_TAG=0.0.0-pr19.4` — the last image tag that **exists** in GHCR (`ghcr.io/okkeyapp/{api,web,worker}:0.0.0-pr19.4`). Do **not** default to `:dev`: that floating tag is not published until Actions → **Publish container images** → `workflow_dispatch` with tag `dev`. After that publish, pin `OKKEY_IMAGE_TAG=dev` (or a newer `v*` / `0.0.0-prN.M`) for post-merge QA. If GHCR packages are private, `docker login ghcr.io` first (or ask an org admin to make them public).

Optional env:

| Variable | Purpose |
|----------|---------|
| `OKKEY_REF` | Git branch/tag/SHA for raw `deploy/docker/*` downloads (default `dev`). Independent of the container image tag. |
| `OKKEY_IMAGE_TAG` | On **fresh** installs, overrides the `.env.example` default written into `.env` |
| `OKKEY_RAW_BASE` / `OKKEY_REPO_RAW_BASE` | Raw GitHub repo root (default `https://raw.githubusercontent.com/okkeyapp/okkey`) |
| `OKKEY_INSTALL_DIR` | Install directory (default `~/okkey`). Compose project name = directory basename (containers/volumes are namespaced per install dir). |
| `OKKEY_SKIP_PULL=1` | Skip `docker compose pull` (local/preloaded images) |
| `OKKEY_RESET_VOLUMES=1` | `docker compose down -v` before start (wipe Postgres/Redis/MinIO data) |
| `WEB_PORT` / `API_PORT` | Host ports for web/API (same vars as Compose). Process env overrides `.env`, then defaults `8080` / `4000`. Final installer URLs use these effective ports. |

### Reinstall / password mismatch

Postgres applies `POSTGRES_PASSWORD` **only on first volume init**. If you delete `~/okkey/.env` and re-run install (new secrets) while `<basename>_okkey-postgres` still exists (default `okkey_okkey-postgres`), `api` crash-loops with `postgres query failed` / `password authentication failed`, and `web`/`worker` stay `Created` (depend on api healthy).

```bash
# Destructive — empty DB, keep current .env secrets:
cd ~/okkey && docker compose -p okkey -f docker-compose.prod.yml --env-file .env down -v && \
  docker compose -p okkey -f docker-compose.prod.yml --env-file .env up -d

# Or via installer:
OKKEY_RESET_VOLUMES=1 OKKEY_REF=dev \
  bash deploy/docker/install.sh
```

This will:

1. Create `~/okkey` (override with `OKKEY_INSTALL_DIR`)
2. Download `docker-compose.prod.yml` + `.env.example` from `OKKEY_REF`
3. Generate `JWT_SECRET`, `SESSION_SECRET`, Postgres and MinIO passwords
4. `docker compose pull && up -d`

Then open **http://localhost:8080** (web) and check **http://localhost:4000/health** (API). After `up -d`, `install.sh` prints a large **OKKEY** banner and the web URL (`PUBLIC_APP_URL`, or `http://localhost:$WEB_PORT`).

## First-run (empty database)

On a fresh self-hosted install the `users` table is empty. Open the web UI, enter an email, and continue — **OTP is skipped for the exclusive first-admin claim** and you go straight to the registration form (no SMTP needed for that account).

`POST /auth/email/start` returns `bootstrapRequired: true` plus `authStateId` for that claim while the catalog is empty. Concurrent empty-catalog starts for other emails still use email OTP. After the first account exists, the same endpoint uses the normal email OTP flow for every subsequent login/registration.

## Crypto profiles (registration)

The web client registers with `password_kdf_params_version: 1` (identity blob is crypto v2). API policy:

| `DEPLOY_ENV` | Default allowed profiles | Notes |
|--------------|--------------------------|--------|
| `dev` (self-host default) | `1,2` | Required for current web registration |
| `stage` / `prod` | `2` only | Rejects kdf v1 with `CRYPTO_PROFILE_NOT_ALLOWED` |

Compose passes `DEPLOY_ENV`, `CRYPTO_ALLOWED_PROFILE_VERSIONS`, and `CRYPTO_ROLLOUT_MODE` from `.env` (defaults `dev` / `1,2` / `compat`). You cannot set `CRYPTO_ALLOWED_PROFILE_VERSIONS=1,2` with `DEPLOY_ENV=prod` — the process exits on boot.

### Workaround (existing install showing «Профиль шифрования не разрешён»)

1. Refresh compose (old files hardcode `DEPLOY_ENV: prod`):

```bash
REF=dev
curl -fsSL -o ~/okkey/docker-compose.prod.yml \
  "https://raw.githubusercontent.com/okkeyapp/okkey/${REF}/deploy/docker/docker-compose.prod.yml"
```

2. Add to `~/okkey/.env` (or merge from `.env.example`):

```bash
DEPLOY_ENV=dev
CRYPTO_ALLOWED_PROFILE_VERSIONS=1,2
CRYPTO_ROLLOUT_MODE=compat
```

3. Recreate api + worker (no new image tag required):

```bash
cd ~/okkey
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate api worker
```

## Image tags

| Tag | Meaning |
|-----|---------|
| `0.0.0-pr19.4` (default) | Last published pre-release in GHCR — bare install works without a prior publish |
| `0.0.0-prN.M` / `v0.0.0-prN.M` | Pre-release from a `v*` git tag push |
| `dev` | Optional floating tag from `workflow_dispatch` on **Publish container images** — **not** present until published; then use for post-merge QA |
| `latest` | Only promoted on clean semver releases (`vX.Y.Z`) |

`OKKEY_REF` (git) ≠ `OKKEY_IMAGE_TAG` (GHCR). Installer files come from the `dev` branch by default; container images come from the tag in `.env`.

Workflow: https://github.com/okkeyapp/okkey/actions/workflows/publish-images.yml

## Manual install

```bash
REF=dev
mkdir -p ~/okkey && cd ~/okkey
curl -fsSL -O "https://raw.githubusercontent.com/okkeyapp/okkey/${REF}/deploy/docker/docker-compose.prod.yml"
curl -fsSL -O "https://raw.githubusercontent.com/okkeyapp/okkey/${REF}/deploy/docker/.env.example"
cp .env.example .env
# edit secrets and PUBLIC_APP_URL / OKKEY_API_PUBLIC_URL; default OKKEY_IMAGE_TAG=0.0.0-pr19.4
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
