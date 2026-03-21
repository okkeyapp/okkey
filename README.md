# Okkey Core

## Quickstart (Hybrid dev)

1. Copy environment file.

```bash
cp .env.example .env
```

2. Start local infrastructure.

```bash
yarn infra:up
```

3. Verify containers are healthy.

```bash
yarn infra:ps
```

4. Use local wrappers for DB/Redis if you do not have native CLIs.

```bash
./scripts/psql --help
./scripts/redis-cli --help
```

5. Start apps locally (Node/Rust on host).

```bash
yarn dev:web
yarn dev:api
yarn dev:worker
```

## Local services

- Postgres: `localhost:${POSTGRES_PORT}`
- Redis: `localhost:${REDIS_PORT}`
- MinIO: `http://localhost:${MINIO_PORT}`
- MinIO Console: `http://localhost:${MINIO_CONSOLE_PORT}`

## Stop infrastructure

```bash
yarn infra:down
```
