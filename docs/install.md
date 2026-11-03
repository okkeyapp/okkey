# Install

Install Okkey on a machine you control with Docker Compose. The installer downloads the compose file, writes a `.env` file, checks container signatures, and starts the stack.

## Requirements

You need:

- Docker Engine 28.0 or newer, and the Docker Compose plugin (`docker compose version`). The API port is published on `127.0.0.1` only. Engine 28.0 is the version this stack relies on for that loopback publish.
- `curl` and `bash`
- [cosign](https://docs.sigstore.dev/cosign/system_config/installation/) on your `PATH`. The installer verifies signatures unless you set `OKKEY_SKIP_COSIGN_VERIFY=1`.

The default install directory is `~/okkey`. Override it with `OKKEY_INSTALL_DIR`. The Compose project name is the directory name, in lowercase. For `~/okkey` the project name is `okkey`.

The web app listens on port `8080` (`WEB_PORT`). The API listens on port `4000` (`API_PORT`) and is bound to `127.0.0.1`. A browser on another machine cannot call that API port. Network access uses the proxy files in [`deploy/docker/proxy`](../deploy/docker/proxy/README.md).

## Install with the pinned script

On tag v1.0.0-beta.2 the installer defaults `OKKEY_REF` to `v1.0.0-beta.2`. When you pipe the script to `bash`, `OKKEY_REF` is the git ref used to download `deploy/docker/docker-compose.prod.yml` and `deploy/docker/.env.example`. It is separate from the container tag. Set it on the right side of `|`.

The container tag `1.0.0-beta.2` is published when the git tag `v1.0.0-beta.2` is created. Images are `ghcr.io/okkeyapp/api`, `ghcr.io/okkeyapp/web`, and `ghcr.io/okkeyapp/worker`.

```bash
curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/v1.0.0-beta.2/deploy/docker/install.sh \
  | OKKEY_REF=v1.0.0-beta.2 OKKEY_IMAGE_TAG=1.0.0-beta.2 bash
```

From a checkout of tag `v1.0.0-beta.2`, the script copies `docker-compose.prod.yml` and `.env.example` from the directory next to `install.sh`. `OKKEY_REF` applies to the piped `curl` command above. Pin the container tag:

```bash
git checkout v1.0.0-beta.2
OKKEY_IMAGE_TAG=1.0.0-beta.2 ./deploy/docker/install.sh
```

The installer asks for an email address and writes it to `OKKEY_SALES_EMAIL`. The API and the worker require it. There is no default. The server uses that address as the recipient for license and plan-change requests. On a machine with no terminal, pass it on the right side of `|`:

```bash
curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/v1.0.0-beta.2/deploy/docker/install.sh \
  | OKKEY_REF=v1.0.0-beta.2 OKKEY_IMAGE_TAG=1.0.0-beta.2 OKKEY_SALES_EMAIL=you@example.com bash
```

On a new install the script generates `JWT_SECRET`, `SESSION_SECRET`, `EMAIL_DEAD_LETTER_SEAL_KEY`, `POSTGRES_PASSWORD`, and `MINIO_ROOT_PASSWORD` in `~/okkey/.env`. Keep that file. Postgres keeps the first `POSTGRES_PASSWORD` it was initialized with. Deleting `.env` and running the installer again, while the Postgres volume still exists, makes the installer stop with an error. Restore the old `.env`, or set `OKKEY_RESET_VOLUMES=1` to wipe the volumes and start over. Wiping volumes deletes the database.

On tag `v1.0.0-beta.2`, the installer writes these values. Leave them as written:

```text
DEPLOY_ENV=dev
CRYPTO_ALLOWED_PROFILE_VERSIONS=1,2
CRYPTO_ROLLOUT_MODE=compat
```

The web client registers with password KDF params version 1. `DEPLOY_ENV=prod` allows only profile `2`, and the API refuses the combination of `DEPLOY_ENV=prod` with `CRYPTO_ALLOWED_PROFILE_VERSIONS=1,2`.

`EMAIL_PROVIDER` defaults to `logger`. One-time email codes are written to the worker logs. To send real mail, set the `EMAIL_SMTP_*` variables in `.env`. The names are in [`deploy/docker/.env.example`](../deploy/docker/.env.example).

## Verify image signatures

After `docker compose pull`, `install.sh` runs cosign against the pulled digest of `api`, `worker`, and `web`. Signatures are keyless, from GitHub Actions OIDC (`https://token.actions.githubusercontent.com`), for `.github/workflows/publish-images.yml` on `refs/heads/dev` or on a tag matching `refs/tags/v...`. Postgres, Redis, and MinIO images are not signed by that workflow.

To check one image yourself after it has been pulled:

```bash
digest="$(docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/okkeyapp/api:1.0.0-beta.2)"
cosign verify \
  --certificate-identity-regexp 'https://github.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(heads/dev|tags/v.+)' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$digest"
```

Repeat for `ghcr.io/okkeyapp/worker:1.0.0-beta.2` and `ghcr.io/okkeyapp/web:1.0.0-beta.2`.

`OKKEY_SKIP_COSIGN_VERIFY=1` skips the check and prints a warning. `OKKEY_SKIP_PULL=1` also skips it unless you set `OKKEY_FORCE_COSIGN_VERIFY=1`.

## First login

Open the URL the installer prints. The default is <http://localhost:8080>. The API health check on the same machine is <http://127.0.0.1:4000/health>.

On an empty database:

1. On **Welcome to Okkey**, enter an email address and choose **Sign in**.
2. The server skips the email code for that first account and opens **Register with Okkey**. No SMTP server is required for this account. If two people try at the same time, only the claim holder skips the code.
3. Enter your name and a **Master password** of at least 4 characters, then choose **Register**.
4. On **Save your recovery key**, copy the key or choose **Download PDF**. You cannot open the vault until this step is saved. The screen shows the key once. Anyone with the key can restore the vault. Okkey cannot show it again.

The next account uses **Email confirmation**. With the default `EMAIL_PROVIDER=logger`, read the code from the worker logs:

```bash
cd ~/okkey
docker compose -p okkey -f docker-compose.prod.yml --env-file .env logs -f worker
```

Replace `okkey` if `OKKEY_INSTALL_DIR` is not `~/okkey`. The project name is the lowercase directory name.
