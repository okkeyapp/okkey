# Upgrade

Upgrade a Docker Compose install by pinning a new container tag, pulling the signed images, and starting the stack again. The API and the worker apply SQL files in `services/api/migrations` on startup and record them in `schema_migrations`.

## Upgrade a Compose install

Keep `~/okkey/.env` and the Docker volumes. The installer does not change `OKKEY_IMAGE_TAG` in an existing `.env` when you run it again. Edit the file yourself.

1. Back up the database, the MinIO volume, and `.env`. See [backup.md](backup.md).
2. In `~/okkey/.env`, set `OKKEY_IMAGE_TAG` to the tag you want. For this release that value is `1.0.0-beta.2`.
3. Refresh the compose file from the same git tag, then pull and start.

```bash
cd ~/okkey
curl -fsSL -o docker-compose.prod.yml \
  "https://raw.githubusercontent.com/okkeyapp/okkey/v1.0.0-beta.2/deploy/docker/docker-compose.prod.yml"
docker compose -p okkey -f docker-compose.prod.yml --env-file .env pull
```

Verify `api`, `worker`, and `web` with the cosign command in [install.md](install.md). Then start:

```bash
docker compose -p okkey -f docker-compose.prod.yml --env-file .env up -d
```

Check <http://127.0.0.1:4000/health> on the same machine.

`OKKEY_RESET_VOLUMES=1` deletes Postgres, Redis, and MinIO data. Do not set it during an upgrade.

If `OKKEY_INSTALL_DIR` is not `~/okkey`, `cd` there and use that directory's lowercase name as the `-p` project name.

## Upgrade from v1.0.0-beta.1

`v1.0.0-beta.1` has no `deploy/docker/install.sh` and no container tag in this repository. `v1.0.0-beta.2` is the first release that publishes `ghcr.io/okkeyapp/api`, `ghcr.io/okkeyapp/web`, and `ghcr.io/okkeyapp/worker` for a git tag.

A database created by v1.0.0-beta.1 has no `schema_migrations` table. That release applied SQL files `0001` through `0034` with `psql`. When the v1.0.0-beta.2 API starts against that database and finds a `users` table:

- If `user_totp_credentials.backup_codes_exported_at` is present and the later checkpoint columns are not, the API records `0001` through `0034` as already applied and runs the migration files after `0034`.
- If the database matches no known checkpoint, startup stops with `database has users but no schema_migrations and does not match a known release schema; refusing to mark migrations as applied`.

Migrations `0037_item_templates_structure_only.sql` and `0038_item_templates_structure_allowlist.sql` clear pre-filled item-template field values. Labels and field types remain. Cleared values can remain in Postgres WAL, replicas, snapshots, and older dumps until those are rotated. During a quiet window you can run:

```sql
VACUUM (FULL) workspace_item_templates;
```

`VACUUM (FULL)` takes an exclusive lock on that table for the rewrite.

The v1.0.0-beta.1 checkout starts Postgres as the container `okkey-postgres` and stores files under `.data/postgres` and `.data/minio` in the checkout (`docker-compose.yml` at that tag). The default database name and user in that tag's `.env.example` are both `okkey`. Dump the database before you shut it down:

```bash
docker exec okkey-postgres pg_dump -U okkey -d okkey --format=custom --no-owner --no-acl > "$HOME/okkey-beta1.dump"
```

Copy `.data/minio` and the API environment you actually ran. Authenticator secrets and backup-code hashes are tied to `SESSION_SECRET`. If that variable was unset, v1.0.0-beta.1 used the fallback `dev-session-secret`.

The beta.2 installer always creates its own Postgres, Redis, and MinIO volumes. It has no switch to reuse the beta.1 data directory. Install beta.2 with [install.md](install.md), then load the dump into the new Postgres:

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
  pg_restore -U okkey -d okkey --no-owner --exit-on-error < "$HOME/okkey-beta1.dump"
```

Put the beta.1 `SESSION_SECRET` and `JWT_SECRET` into `~/okkey/.env` before you start the API again. Leave the installer's `POSTGRES_PASSWORD` as it is. Then:

```bash
docker compose -p okkey -f docker-compose.prod.yml --env-file .env up -d
```

The API applies the migrations after `0034` on that startup.

The beta.1 MinIO image is `minio/minio:RELEASE.2024-07-16T23-46-41Z`. The beta.2 compose file uses `pgsty/minio:RELEASE.2026-08-04T00-00-00Z`. This repository does not include a tested command to open a beta.1 `.data/minio` directory with that newer image. Keep the copy. Vault items that were only stored as attachments stay in that copy until you restore the objects with a method you have tested against both servers.
