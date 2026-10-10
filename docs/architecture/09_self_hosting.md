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

**First-run:** with an empty `users` table, email login skips OTP (`bootstrapRequired` on `POST /auth/email/start`) so the first admin can register without SMTP. Once any user exists, normal email OTP applies.

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

Tagged from git `v*` releases (+ `latest`). CI: `.github/workflows/publish-images.yml`.

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
