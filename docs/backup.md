# Backup and restore

A Docker Compose install keeps vault metadata in Postgres and encrypted files in MinIO. Redis holds sessions and the email queue. Copy `.env` with every backup. It contains `POSTGRES_PASSWORD`, `SESSION_SECRET`, `JWT_SECRET`, `EMAIL_DEAD_LETTER_SEAL_KEY`, and `MINIO_ROOT_PASSWORD`.

Commands below assume the default directory `~/okkey` and the project name `okkey`. If you set `OKKEY_INSTALL_DIR`, `cd` to that directory and use its lowercase base name as the project name. Volume names are `<project>_okkey-postgres`, `<project>_okkey-redis`, and `<project>_okkey-minio`.

## Back up the database

`pg_dump` is provided by the `postgres:16-alpine` image in `deploy/docker/docker-compose.prod.yml`. From the install directory, while the stack is up:

```bash
cd ~/okkey
docker compose -p okkey -f docker-compose.prod.yml --env-file .env exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$HOME/okkey-postgres.dump"
```

`POSTGRES_USER` and `POSTGRES_DB` default to `okkey`.

## Back up stored files

MinIO keeps object data in the volume `okkey_okkey-minio`, mounted at `/data` in the `minio` service. Stop the stack so the copy is quiet, then archive the volume with `postgres:16-alpine` (that image includes `tar`):

```bash
cd ~/okkey
docker compose -p okkey -f docker-compose.prod.yml --env-file .env stop
docker run --rm \
  -v okkey_okkey-minio:/volume:ro \
  -v "$HOME":/backup \
  postgres:16-alpine \
  tar -C /volume -czf /backup/okkey-minio.tgz .
```

Redis data is the volume `okkey_okkey-redis`. Vault items are not stored there. Archive it the same way if you want to keep sessions and queued mail:

```bash
docker run --rm \
  -v okkey_okkey-redis:/volume:ro \
  -v "$HOME":/backup \
  postgres:16-alpine \
  tar -C /volume -czf /backup/okkey-redis.tgz .
```

Copy `~/okkey/.env` to the same backup location, then start the stack again:

```bash
cp ~/okkey/.env "$HOME/okkey.env"
docker compose -p okkey -f docker-compose.prod.yml --env-file .env up -d
```

You can also archive `okkey_okkey-postgres` with the same `tar` command. A logical `pg_dump` is the backup to use when you restore into a new Postgres volume.

## Restore a database dump

Stop the API and the worker so nothing is writing. Then replace the `okkey` database and load the dump. The role password stays the one already in `.env`.

```bash
cd ~/okkey
docker compose -p okkey -f docker-compose.prod.yml --env-file .env stop api worker
docker compose -p okkey -f docker-compose.prod.yml --env-file .env exec -T postgres \
  psql -U okkey -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'okkey' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS okkey;" \
  -c "CREATE DATABASE okkey OWNER okkey;"
```

If `DROP DATABASE` fails because a connection is still open, run the `pg_terminate_backend` statement again and retry the drop and create. Then load the dump:

```bash
docker compose -p okkey -f docker-compose.prod.yml --env-file .env exec -T postgres \
  pg_restore -U okkey -d okkey --no-owner --exit-on-error < "$HOME/okkey-postgres.dump"
docker compose -p okkey -f docker-compose.prod.yml --env-file .env up -d
```

Use the `.env` from the same backup. Authenticator secrets are sealed with `SESSION_SECRET`. A new secret cannot open secrets sealed with the old one.

On startup the API runs any migration files that are not yet listed in `schema_migrations`.

## Restore volume archives

Stop the stack, delete the old volume, and let Compose create a new one. A volume made with `docker volume create` has no Compose labels, and the next `up` warns that the volume already exists. `docker compose create` writes those labels.

```bash
cd ~/okkey
docker compose -p okkey -f docker-compose.prod.yml --env-file .env down
docker volume rm okkey_okkey-minio
docker compose -p okkey -f docker-compose.prod.yml --env-file .env create minio
docker run --rm \
  -v okkey_okkey-minio:/volume \
  -v "$HOME":/backup \
  postgres:16-alpine \
  tar -C /volume -xzf /backup/okkey-minio.tgz
```

Repeat for `okkey_okkey-postgres` (`docker compose ... create postgres`) and `okkey_okkey-redis` (`docker compose ... create redis`) if you archived them. Restoring the Postgres volume restores the password that was initialized with that volume. The `POSTGRES_PASSWORD` in `.env` must be the one from that same install. Then:

```bash
docker compose -p okkey -f docker-compose.prod.yml --env-file .env up -d
```

Check <http://127.0.0.1:4000/health> on the same machine, and open the web URL from `.env` (`PUBLIC_APP_URL`, default <http://localhost:8080>).
