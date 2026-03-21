# Storage and Infrastructure (Core)

This document defines how Okkey Core connects to Postgres, Redis, and S3-compatible object storage for local and self-hosted environments.

## Required Services

- PostgreSQL (primary DB)
- Redis (sessions, cache, locks)
- S3-compatible object storage (attachments, encrypted files, backups)

## Local Infrastructure (Docker Compose)

Start local services:

```bash
cp .env.example .env
yarn infra:up
yarn infra:ps
```

Health checks:
- Postgres: `pg_isready`
- Redis: `redis-cli ping`
- MinIO: `http://localhost:9000/minio/health/ready`

## Environment Variables

Postgres:
- `DATABASE_URL=postgresql://<user>:<pass>@<host>:<port>/<db>`

Redis:
- `REDIS_URL=redis://<host>:<port>`

Object Storage:
- `S3_ENDPOINT=http://<host>:<port>`
- `S3_REGION=<region>`
- `S3_BUCKET=<bucket>`
- `S3_ACCESS_KEY=<access_key>`
- `S3_SECRET_KEY=<secret_key>`
- `S3_FORCE_PATH_STYLE=true` (for MinIO)

## Self-Hosted Notes

- Use managed Postgres/Redis where possible.
- Ensure object storage has lifecycle rules for backups and retention.
- Use TLS for all external endpoints.

## Basic Verification

Postgres:
```bash
./scripts/psql -c 'select 1;'
```

Redis:
```bash
./scripts/redis-cli ping
```

MinIO:
```bash
curl -f http://localhost:9000/minio/health/ready
```

