# Self Hosting

Okkey supports self-hosted deployment.

This allows companies to run Okkey on their own infrastructure.

---

## Deployment Methods

Supported:
- Docker
- Docker Compose
- Kubernetes

---

## Required Services

Self-hosted installation includes:
- okkey-api
- postgres
- redis
- object storage

---

## Example Docker Setup
```text
docker compose up -d
```

This starts:
- okkey-api
- postgres
- redis
- minio

---

## Configuration

Main environment variables:
```text
DATABASE_URL
REDIS_URL
S3_ENDPOINT
S3_ACCESS_KEY
S3_SECRET_KEY
JWT_SECRET
```

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

The optional `geoip-updater` service downloads DB-IP City Lite into a shared persistent volume,
validates it, then atomically replaces the current file. Start the Compose profile with
`docker compose --profile geoip up -d`. The API must mount the same volume read-only.
Administrators may disable auto-update and provide any compatible MMDB at `GEOIP_DB_PATH`.
When disabled or unavailable, approval continues with country/city shown as Unknown.

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

Update is performed via:

```text
docker pull okkey/api
docker compose up -d
```

---

## Database Migrations

On update, the following are automatically executed:
```text
database migrations
```

---

## Enterprise Features

Self-hosted version can support:
- SSO
- LDAP
- SCIM
- audit logs
- custom domains

---

## Security in Self Hosted Mode

Even in self-hosting, encryption remains client-side!
Server administrator **cannot read vault data**.
