# Self Hosting

Okkey supports self-hosted deployment so organisations can run Core on their own infrastructure.

Client-side encryption is unchanged: the server administrator **cannot read vault data**.

---

## Self-host in 5 minutes

Preferred path — **no monorepo clone**:

```bash
curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/dev/deploy/docker/install.sh | bash
```

Full guide, manual compose, TLS notes, and image tags:

→ [`deploy/docker/README.md`](../../deploy/docker/README.md)

**First-run:** on self-hosted installs with an empty `users` table, email login may skip OTP for one exclusive first-admin claim (`bootstrapRequired` on `POST /auth/email/start`) so that admin can register without SMTP. Overlapping empty-catalog starts still require OTP for non-claimants. Once any user exists, normal email OTP applies.

**Crypto policy:** self-host compose defaults to `DEPLOY_ENV=dev` and `CRYPTO_ALLOWED_PROFILE_VERSIONS=1,2` so web registration (`password_kdf_params_version=1`) succeeds. `DEPLOY_ENV=prod` only allows profile `2` and returns `CRYPTO_PROFILE_NOT_ALLOWED`. See [`deploy/docker/README.md`](../../deploy/docker/README.md).

---

## Deployment Methods

Supported:

- Docker / Docker Compose (MVP install artifact under `deploy/docker/`)
- Kubernetes (planned; not in this MVP)

---

## Required Services

Self-hosted installation includes:

- `okkey-api` (`ghcr.io/okkeyapp/api`) — HTTP API; runs SQL migrations on start
- `okkey-worker` (`ghcr.io/okkeyapp/worker`) — background jobs (item purge, capsule cleanup, Redis email queue)
- `okkey-web` (`ghcr.io/okkeyapp/web`) — web UI
- PostgreSQL 16
- Redis 7
- S3-compatible object storage (MinIO in the default compose)

See also [`docs/deploy_targets.md`](../deploy_targets.md) and [`services/worker/README.md`](../../services/worker/README.md).

---

## Example Docker Setup

Production (published images):

```bash
cd ~/okkey   # or OKKEY_INSTALL_DIR
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

Local development infrastructure only (Postgres / Redis / MinIO — **not** the app images):

```bash
cp .env.example .env
yarn infra:up
```

---

## Configuration

Main environment variables:

```text
DATABASE_URL
REDIS_URL
S3_ENDPOINT
S3_ACCESS_KEY
S3_SECRET_KEY
JWT_SECRET          # alias; SESSION_SECRET preferred
SESSION_SECRET
PUBLIC_APP_URL
OKKEY_API_PUBLIC_URL  # browser-facing API origin for the web container
CORS_ORIGIN
```

`install.sh` generates strong `JWT_SECRET` / `SESSION_SECRET` / DB / MinIO passwords into `.env`.

---

## Favicon preview

Login-item favicon preview (`POST /favicon/preview`) defaults to fetching icons from the website
itself (`FAVICON_PROVIDER=direct`). For each Website URL field the API probes, in order:
the full URL (HTML `<link rel=icon>` / related), the subdomain/origin root, then the
registrable domain root (eTLD+1). Subsequent URL fields use the same order.

```text
FAVICON_PROVIDER=direct
```

Set `FAVICON_PROVIDER=off` to disable remote preview (clients fall back to monograms).

`FAVICON_PROVIDER=google` is an explicit opt-in that sends login-item website domains
to Google's favicon service. Prefer `direct` or `off` for self-hosted deployments.

Record favicon attachments (upload purpose `item-favicon`) are stored on any plan and are
not gated by the workspace `filesInItems` entitlement or attachment size limits.

---

## Capsule GeoIP

Capsule approval can resolve requester country/city locally from any City-compatible MMDB file.
No requester IP is sent to a third party.

```text
GEOIP_ENABLED=true
GEOIP_PROVIDER=dbip
GEOIP_DB_PATH=/geoip/city.mmdb
GEOIP_AUTO_UPDATE=true
TRUSTED_PROXY_HOPS=1
```

The optional `geoip-updater` service (repo-root compose profile `geoip`) downloads DB-IP City Lite into a shared volume.
The production MVP compose leaves GeoIP off by default (`GEOIP_ENABLED=false`).

DB-IP City Lite data is licensed under CC BY 4.0; interfaces displaying its location data must
link to https://db-ip.com.

---

## Storage

PostgreSQL:

- metadata
- events
- users
- devices

Object storage:

- attachments
- encrypted files

---

## Updates

```bash
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

Images:

- `ghcr.io/okkeyapp/api`
- `ghcr.io/okkeyapp/web`
- `ghcr.io/okkeyapp/worker`

Tag scheme (see [`deploy/docker/README.md`](../../deploy/docker/README.md) and `.github/workflows/publish-images.yml`):

- push to `dev` → `:dev`, `:dev-<sha>` (installer tracking default; published on every push to `dev`)
- pre-release tag e.g. `v1.0.0-beta.2` → `:1.0.0-beta.2` only (first image-backed release pin)
- clean SemVer tag `vX.Y.Z` on `main` → `:X.Y.Z`, `:X.Y`, `:X` (`:latest` only via manual `workflow_dispatch` + `push_latest=true`)
- production installs must **pin** a SemVer (default prod pin `1.0.0-beta.2`; never floating `:latest`)
- Core images only (`api` / `web` / `worker`); browser extension is not part of this publish path
- Cosign keyless GitHub OIDC on non-PR publishes; GHCR Core packages are public for pull

---

## Database Migrations

On API (and worker) start, SQL files under `services/api/migrations/` are applied in order and recorded in `schema_migrations`.

---

## Enterprise Features

Self-hosted Core can be extended (separate `okkey-enterprise` repo) with:

- SSO
- LDAP / SCIM
- audit logs
- custom domains

Enterprise is not required to run Core.

---

## Security in Self Hosted Mode

Even in self-hosting, encryption remains client-side.
Server administrator **cannot read vault data**.
