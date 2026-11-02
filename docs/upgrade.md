# Upgrade

Upgrade a Docker Compose install by pinning a new container tag, pulling the signed images, and starting the stack again. The API and the worker apply SQL files in `services/api/migrations` on startup and record them in `schema_migrations`.

## Upgrade a Compose install

Keep `~/okkey/.env` and the Docker volumes. The installer does not change `OKKEY_IMAGE_TAG` in an existing `.env` when you run it again. Edit the file yourself.

1. Back up the database, the MinIO volume, and `.env`. See [backup.md](backup.md).
2. In `~/okkey/.env`, set `OKKEY_IMAGE_TAG` to `<tag>`.
3. Refresh the compose file from git tag `v<tag>`, then pull and start.

```bash
cd ~/okkey
curl -fsSL -o docker-compose.prod.yml \
  "https://raw.githubusercontent.com/okkeyapp/okkey/v<tag>/deploy/docker/docker-compose.prod.yml"
docker compose -p okkey -f docker-compose.prod.yml --env-file .env pull
```

Verify `api`, `worker`, and `web` with the cosign command in [install.md](install.md). Then start:

```bash
docker compose -p okkey -f docker-compose.prod.yml --env-file .env up -d
```

Check <http://127.0.0.1:4000/health> on the same machine.

`OKKEY_RESET_VOLUMES=1` deletes Postgres, Redis, and MinIO data. Do not set it during an upgrade.

If `OKKEY_INSTALL_DIR` is not `~/okkey`, `cd` there and use that directory's lowercase name as the `-p` project name.

For this release, `<tag>` is `1.0.0-beta.2` and the git tag is `v1.0.0-beta.2`.
