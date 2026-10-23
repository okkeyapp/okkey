# Self-host Okkey in 5 minutes

Run Okkey Core on your own machine with Docker Compose — **no monorepo clone or local build**.

## One-command install

**Tracking / QA** (floating `:dev` images, published on every push to `dev` after the publish workflow lands):

```bash
curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/dev/deploy/docker/install.sh | bash
```

**Production** — pin a **published** SemVer image (never floating `:latest`):

```bash
curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/dev/deploy/docker/install.sh \
  | OKKEY_IMAGE_TAG=<published-semver> bash
```

`OKKEY_CHANNEL=prod` is **disabled** until a SemVer tag exists in GHCR (today only `:dev` / `:dev-<sha>` are published). The installer exits with a clear error instead of pulling a missing `1.0.0-beta.2` manifest. After the first release is published, use `OKKEY_IMAGE_TAG=<semver>` (or `OKKEY_PROD_CHANNEL_FORCE=1 OKKEY_CHANNEL=prod` to force the historical pin).

Note: `OKKEY_REF=…` / `OKKEY_IMAGE_TAG=…` / `OKKEY_CHANNEL=…` must be on the **right** of `|` so the installer process sees them — `VAR=x curl | bash` does **not** pass `VAR` into `bash`.

`.env.example` defaults to `OKKEY_IMAGE_TAG=dev` for tracking. Core GHCR packages (`ghcr.io/okkeyapp/{api,web,worker}`) are **public** for anonymous pull. Do not use `:latest` for prod.

Optional env:

| Variable | Purpose |
|----------|---------|
| `OKKEY_REF` | Git branch/tag/SHA for raw `deploy/docker/*` downloads (default `dev`). Independent of the container image tag. |
| `OKKEY_IMAGE_TAG` | On **fresh** installs, overrides the `.env.example` default written into `.env` |
| `OKKEY_CHANNEL=prod` | Refused until SemVer exists in GHCR; with `OKKEY_PROD_CHANNEL_FORCE=1`, pins `OKKEY_PROD_IMAGE_TAG` |
| `OKKEY_PROD_IMAGE_TAG` | Historical SemVer pin name (default `1.0.0-beta.2`; never `latest`) — not published yet |
| `OKKEY_RAW_BASE` / `OKKEY_REPO_RAW_BASE` | Raw GitHub repo root (default `https://raw.githubusercontent.com/okkeyapp/okkey`) |
| `OKKEY_INSTALL_DIR` | Install directory (default `~/okkey`). Compose project name = directory basename (containers/volumes are namespaced per install dir). |
| `OKKEY_SKIP_PULL=1` | Skip `docker compose pull` (local/preloaded images) |
| `OKKEY_RESET_VOLUMES=1` | `docker compose down -v` before start (wipe Postgres/Redis/MinIO data) |
| `WEB_PORT` / `API_PORT` | Host ports for web/API. On **fresh** installs, written into `.env`; when set without explicit URLs, also derives `PUBLIC_APP_URL` / `OKKEY_API_PUBLIC_URL` / `CORS_ORIGIN` / `WEBAUTHN_ORIGINS`. |
| `PUBLIC_APP_URL` / `OKKEY_API_PUBLIC_URL` / `CORS_ORIGIN` / `WEBAUTHN_ORIGINS` | Optional overrides written into `.env` on fresh installs (keep `config.js` and `.env` aligned). |

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
3. Generate `JWT_SECRET`, `SESSION_SECRET`, `EMAIL_DEAD_LETTER_SEAL_KEY`, Postgres and MinIO passwords
4. `docker compose pull && up -d`

Then open **http://localhost:8080** (web) and check **http://localhost:4000/health** (API). After `up -d`, `install.sh` prints a large **OKKEY** banner and the web URL (`PUBLIC_APP_URL`, or `http://localhost:$WEB_PORT`).

## First-run (empty database)

On a fresh install the `users` table is empty. Open the web UI, enter an email, and continue — **OTP is skipped** and you go straight to the registration form (no SMTP needed for the first account).

`POST /auth/email/start` returns `bootstrapRequired: true` plus `authStateId` when there are zero users. After the first account exists, the same endpoint uses the normal email OTP flow for every subsequent login/registration.

## Crypto profiles (registration)

The web client registers with `password_kdf_params_version: 2` (identity blob is crypto v2). Vault items require crypto profile `v2` for read and write. API policy:

| `DEPLOY_ENV` | Default allowed profiles | Notes |
|--------------|--------------------------|--------|
| `dev`, `stage`, `prod` | `2` only | Profile `v1` is forbidden. `CRYPTO_ALLOWED_PROFILE_VERSIONS` can only narrow this set. |

Compose passes `DEPLOY_ENV`, `CRYPTO_ALLOWED_PROFILE_VERSIONS`, and `CRYPTO_ROLLOUT_MODE` from `.env` (defaults `dev` / `2` / `compat`). Setting `CRYPTO_ALLOWED_PROFILE_VERSIONS=1,2` makes the process exit on boot.

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
CRYPTO_ALLOWED_PROFILE_VERSIONS=2
CRYPTO_ROLLOUT_MODE=compat
```

3. Recreate api + worker (no new image tag required):

```bash
cd ~/okkey
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate api worker
```

## Image tags

Published by [`.github/workflows/publish-images.yml`](../../.github/workflows/publish-images.yml) to `ghcr.io/okkeyapp/{api,web,worker}` (Core only — the browser extension is **not** published by this workflow).

| Event | Tags |
|-------|------|
| Push to `dev` | `:dev`, `:dev-<sha>` (intended immediately after this workflow merges to `dev`) |
| Git tag `vX.Y.Z` (clean SemVer on `main`) | `:X.Y.Z`, `:X.Y`, `:X` (**not** `:latest`) |
| Git tag `vX.Y.Z-…` (pre-release, e.g. `v1.0.0-beta.2`) | `:X.Y.Z-…` only (no `:latest` / rolling) |
| Pull request | `:pr-<n>`, `:pr-<n>-<head-sha7>` (PR head commit, not the merge commit) |
| `workflow_dispatch` | explicit tag; `:latest` only when `push_latest=true` (manual/approved) |

Retention (scheduled GC; release SemVer tags and floating `:dev` are never deleted):

| Tag class | Policy |
|-----------|--------|
| `pr-*` | Deleted **14 days after the PR is closed**; tags of **open** PRs are never deleted |
| `dev-<sha>` | Keep if age ≤ 30 days **or** among the newest 20 |
| SemVer / `:latest` / `:dev` | Never deleted by GC |

Ephemeral `pr-*` versions are deleted only by CI (`GITHUB_TOKEN` + `packages:write`), not by hand. Prod never uses floating `:latest`.

Installer defaults:

| Channel | `OKKEY_IMAGE_TAG` |
|---------|-------------------|
| Tracking / QA (default) | `dev` |
| Production | pin a **published** SemVer via `OKKEY_IMAGE_TAG=<semver>` — **never** `:latest`; `OKKEY_CHANNEL=prod` gated until SemVer exists |

Multi-arch (`linux/amd64` + `linux/arm64`), OCI labels, SBOM, and build provenance are enabled in CI. Cosign **keyless GitHub OIDC** signing runs on every non-PR publish (no key-based override).

## Manual install

```bash
REF=dev
mkdir -p ~/okkey && cd ~/okkey
curl -fsSL -O "https://raw.githubusercontent.com/okkeyapp/okkey/${REF}/deploy/docker/docker-compose.prod.yml"
curl -fsSL -O "https://raw.githubusercontent.com/okkeyapp/okkey/${REF}/deploy/docker/.env.example"
cp .env.example .env
# edit secrets and PUBLIC_APP_URL / OKKEY_API_PUBLIC_URL
# tracking: keep OKKEY_IMAGE_TAG=dev
# production: set OKKEY_IMAGE_TAG=<SemVer>
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

### Re-queue a dead-letter job

1. Inspect: `redis-cli LRANGE okkey:email:dead 0 -1` (verification-code mail is redacted; original is in `sealedDelivery`).
2. Copy the JSON entry and `LPUSH okkey:email:queue '<json>'`.
3. After a successful send the worker removes matching DLQ copies automatically (`LREM`). Manual cleanup if needed: `redis-cli LREM okkey:email:dead 0 '<json>'`.

`EMAIL_DEAD_LETTER_SEAL_KEY` must stay stable across restarts (install.sh writes it into `.env` on first install). If unset, the worker falls back to `SESSION_SECRET`.

## TLS / domain

**Primary edge template (self-host):** [`proxy/`](./proxy/) — nginx + OpenSSL ≥ 3.5, default hybrid group `X25519MLKEM768`, TLS 1.3 only (no silent classical downgrade). Classical-only clients need an **explicit, isolated, time-boxed** compat listener (`proxy/compat.env.example`, `policy-compat.sh`) — never on the default host. Caddy/Traefik are notes-only; see [`proxy/README.md`](./proxy/README.md).

**SaaS stage/prod edge:** [`../saas/edge/`](../saas/edge/) — same nginx image + hybrid group; overlays `stage.env` / `prod.env`.

```bash
# From a checkout of deploy/docker (recommended for --build).
# Project dir = this folder; overlay paths resolve as ./proxy/nginx + ./proxy/certs
# (no symlinks needed).
cd deploy/docker
OKKEY_WEB_HOST=app.example.com OKKEY_API_HOST=api.example.com \
  ./proxy/scripts/gen-self-signed.sh
docker compose -f docker-compose.prod.yml -f proxy/docker-compose.proxy.yml \
  --env-file .env up -d --build proxy
./proxy/verify-tls.sh app.example.com 443
```

Then set in `.env`:

- `PUBLIC_APP_URL=https://app.example.com`
- `OKKEY_API_PUBLIC_URL=https://api.example.com`
- `CORS_ORIGIN` / `WEBAUTHN_ORIGINS` / `WEBAUTHN_RP_ID` accordingly
- `OKKEY_WEB_HOST` / `OKKEY_API_HOST` (proxy server_name values)

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

GHCR packages for `okkeyapp/{api,web,worker}` are **public** for anonymous pull (CI best-effort `visibility=public` after each publish; confirm in the GHCR UI if a package was created before the workflow landed). If a mirror or fork keeps them private, `docker login ghcr.io` with `read:packages` is required.

## Dev infrastructure

The repo-root `docker-compose.yml` remains **infra-only** for local development (`yarn infra:up`). Do not confuse it with this production compose file.
