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
