# Self-host reverse proxy (PQ TLS)

**Primary stack (product decision):** nginx linked to **OpenSSL ≥ 3.5**, default key exchange **`X25519MLKEM768`**, **TLS 1.3 only** on the default listener.

| Role | Stack | Group string |
|------|--------|--------------|
| **Primary (this template)** | nginx + OpenSSL ≥ 3.5 | `X25519MLKEM768` |
| Note only | Caddy ≥ 2.10 | `x25519mlkem768` (set `curves` hybrid-only for strict) |
| Note only | Traefik ≥ 3.5 | `X25519MLKEM768` |

Classical-only clients are **not** accommodated on this default route (compat listeners → later Q-Day #3 subtask).

## Layout

| Path | Purpose |
|------|---------|
| `docker-compose.proxy.yml` | Optional compose overlay (`proxy` service) |
| `nginx/Dockerfile` | Builds nginx against OpenSSL 3.5.x |
| `nginx/conf.d/okkey.conf.template` | Strict TLS + reverse proxy to `web` / `api` |
| `scripts/gen-self-signed.sh` | Local smoke certs (not for production) |
| `verify-tls.sh` | `s_client` + TLS 1.2 rejection check |

## Quick start (overlay on existing install)

Assume Core is already installed (e.g. `~/okkey` with `docker-compose.prod.yml` + `.env`).
Compose project directory = that install dir (sibling of `proxy/`). Overlay bind/build
paths are anchored there as `./proxy/nginx` and `./proxy/certs` — run compose from
the install dir; do not symlink `nginx`/`certs` next to `docker-compose.prod.yml`.

```bash
INSTALL_DIR=~/okkey
REF=dev   # or your OKKEY_REF

# Prefer a git checkout / full tree copy (Dockerfile + templates + certs dir):
#   cp -a deploy/docker/proxy "$INSTALL_DIR/proxy"
# Overlay-only curl is not enough for --build (needs nginx/ + certs/).

cd "$INSTALL_DIR"
# If using a monorepo checkout instead of ~/okkey copies, run from deploy/docker:
#   cd /path/to/okkey/deploy/docker

export OKKEY_WEB_HOST=app.example.com
export OKKEY_API_HOST=api.example.com
./proxy/scripts/gen-self-signed.sh   # writes proxy/certs/; or mount real certs there

# Point Core at HTTPS hosts (edit .env), then:
docker compose -f docker-compose.prod.yml -f proxy/docker-compose.proxy.yml \
  --env-file .env up -d --build proxy
```

Required `.env` (example):

```bash
PUBLIC_APP_URL=https://app.example.com
OKKEY_API_PUBLIC_URL=https://api.example.com
CORS_ORIGIN=https://app.example.com
WEBAUTHN_ORIGINS=https://app.example.com
WEBAUTHN_RP_ID=example.com
OKKEY_WEB_HOST=app.example.com
OKKEY_API_HOST=api.example.com
```

From a **git checkout** of this repo (recommended for `--build`):

```bash
cd deploy/docker
OKKEY_WEB_HOST=app.example.com OKKEY_API_HOST=api.example.com \
  ./proxy/scripts/gen-self-signed.sh
docker compose -f docker-compose.prod.yml -f proxy/docker-compose.proxy.yml \
  --env-file .env up -d --build proxy
```

## Verify

Client needs OpenSSL ≥ 3.5:

```bash
./proxy/verify-tls.sh app.example.com 443
# or:
openssl s_client -connect app.example.com:443 -tls1_3 -servername app.example.com \
  -groups X25519MLKEM768 </dev/null 2>&1 | grep -Ei 'Protocol|Negotiated|group|VERIFY'
curl -I --tls-max 1.2 https://app.example.com/   # must fail on default listener
```

Expect negotiated group **`X25519MLKEM768`** and TLS 1.2 rejection.

## Host nginx (no container)

If you already run nginx on the host with OpenSSL ≥ 3.5, reuse `nginx/conf.d/okkey.conf.template` (replace `${…}`), keep:

```nginx
ssl_protocols TLSv1.3;
ssl_ecdh_curve X25519MLKEM768;
```

Confirm with `nginx -V` / `openssl version` that the linked OpenSSL is ≥ 3.5 and lists `X25519MLKEM768`.
