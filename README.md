# Okkey Core

## Self-host in 5 minutes

One-command Docker install (no monorepo clone):

```bash
curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/dev/deploy/docker/install.sh | bash
```

Details: [`deploy/docker/README.md`](deploy/docker/README.md) · architecture notes: [`docs/architecture/09_self_hosting.md`](docs/architecture/09_self_hosting.md)

## Quickstart (Hybrid dev)

1. Copy root environment file for infrastructure.

```bash
cp .env.example .env
```

2. Copy service/app environment files you run locally.

```bash
cp services/api/.env.example services/api/.env
cp services/worker/.env.example services/worker/.env
cp apps/web/.env.example apps/web/.env
```

3. Start local infrastructure.

```bash
yarn infra:up
```

4. Verify containers are healthy.

```bash
yarn infra:ps
```

5. Use local wrappers for DB/Redis if you do not have native CLIs.

```bash
./scripts/psql --help
./scripts/redis-cli --help
```

6. Start apps locally (Node/Rust on host).

```bash
yarn dev:web
yarn dev:api
yarn dev:worker
```

## Env policy

- Root `.env` is for infrastructure only (`docker-compose` ports/credentials).
- Runtime configs must live in service/app folders:
  - `services/api/.env`
  - `services/worker/.env`
  - `apps/*/.env`
- Do not duplicate runtime variables in root `.env`.

## Local services

- Postgres: `localhost:${POSTGRES_PORT}`
- Redis: `localhost:${REDIS_PORT}`
- MinIO: `http://localhost:${MINIO_PORT}`
- MinIO Console: `http://localhost:${MINIO_CONSOLE_PORT}`

## Stop infrastructure

```bash
yarn infra:down
```
