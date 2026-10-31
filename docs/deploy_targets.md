# Deployment Targets and Minimum Requirements

This document defines target deployment environments for Okkey Core and the minimum infrastructure requirements for the first stable release. It applies to the open-source core in this repository.

## Target Environments

- SaaS (managed by Okkey team)
- Self-hosted
  - Single-node (Docker / Docker Compose)
  - Multi-node (Kubernetes)

## Required Services

Core requires these services in all environments:

- Okkey Core API (stateless)
- Okkey Worker (stateless)
- PostgreSQL (primary database)
- Redis (sessions, cache, locks)
- S3-compatible object storage (attachments, encrypted files, backups)

## Supported Dependency Versions

Tested and supported for the first stable release:

- Docker Engine: ≥ 28.0 (self-host Compose; required for true `127.0.0.1` port publish — see [moby#45610](https://github.com/moby/moby/issues/45610))
- PostgreSQL: 16.x
- Redis: 7.x
- Object storage: S3-compatible (MinIO tested)

Docker images used in local dev:
- Postgres: `postgres:16-alpine`
- Redis: `redis:7-alpine`
- MinIO: `pgsty/minio:RELEASE.2026-08-04T00-00-00Z`

## Minimum Resource Baseline

Baseline targets for initial production usage. Adjust based on load.

Single-node (self-hosted, small team):
- 2 vCPU
- 4 GB RAM
- 20 GB SSD for database and object storage (excluding backups)

SaaS (initial cluster per environment):
- API: 2 vCPU / 4 GB RAM
- Worker: 2 vCPU / 4 GB RAM
- PostgreSQL: 2 vCPU / 4 GB RAM / 20 GB SSD
- Redis: 1 vCPU / 2 GB RAM
- Object storage: 20 GB SSD (separate volume or external service)

## Networking, Domains, TLS

- HTTPS is required for all clients.
- Use a public domain for the API and web app.
- WebSocket must be allowed for sync.
- TLS certificates must be managed (ACME/Let’s Encrypt or equivalent).

Recommended ports:
- API: 4000 (internal), 443 (external)
- Web: 3000 (internal), 443 (external)
- Postgres: 5432 (internal)
- Redis: 6379 (internal)
- S3: 9000 (internal), 9001 (console)

## Email/Notifications

Core uses email for authentication flows (email verification / login codes). Required for SaaS and recommended for self-hosted.

Supported providers:
- SMTP server (preferred for self-hosted)
- Managed email services (SaaS)

## Security and Architecture Constraints

- Zero-knowledge: server never decrypts vault data.
- All cryptography runs client-side using Rust crypto engine (WASM).
- Backend stores only encrypted blobs and metadata.

## Versioning and Compatibility

- Okkey Core follows semantic versioning.
- Clients should target the same major version as the server.
- Minor version skew is allowed but must be verified in release notes.
- Enterprise extensions must remain compatible with the Core major version.

## Monitoring, Logging, Backups

Self-hosted recommendations:
- Centralized logs for API and worker.
- Metrics and alerting for API latency, error rate, DB health, and Redis memory.
- Daily Postgres backups with retention policy.
- Object storage backups or replication if available.
- After applying migrations `0037`/`0038` (item templates structure-only): templates no longer store pre-filled field values (existing templates become empty forms). Cleared data can remain in `pg_wal`, WAL archives/PITR, replicas, snapshots, and older backups — run `VACUUM (FULL) workspace_item_templates` in a maintenance window (exclusive table lock) and rotate backups. See `docs/architecture/09_self_hosting.md`.

SaaS recommendations:
- Multi-zone database backups and point-in-time recovery.
- Redis persistence enabled or use managed Redis.
- Object storage lifecycle policies and access logging.

