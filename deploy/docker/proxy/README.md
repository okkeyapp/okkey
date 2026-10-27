# Self-host reverse proxy (PQ TLS)

**Primary stack (product decision):** nginx linked to **OpenSSL ≥ 3.5**, default key exchange **`X25519MLKEM768`**, **TLS 1.3 only** on the default listener.

| Role | Stack | Group string |
|------|--------|--------------|
| **Primary (this template)** | nginx + OpenSSL ≥ 3.5 | `X25519MLKEM768` |
| Note only | Caddy ≥ 2.10 | `x25519mlkem768` (set `curves` hybrid-only for strict) |
| Note only | Traefik ≥ 3.5 | `X25519MLKEM768` |

Classical-only clients are **not** on the default route. Optional **compat listeners** (q3-4) use separate hostnames, a **dedicated listen port** (default `8443`, never `443`), dedicated certs, classical `X25519` only, and require an explicit sunset — see [Compat listeners](#compat-listeners-classical-only).

## Layout

| Path | Purpose |
|------|---------|
| `docker-compose.proxy.yml` | Optional compose overlay (`proxy` service) |
| `nginx/Dockerfile` | Builds nginx against OpenSSL 3.5.x |
| `nginx/conf.d/okkey.conf.template` | Strict TLS + reverse proxy to `web` / `api` |
| `nginx/conf.d/okkey-compat.conf.template` | Optional classical-only listeners (separate hosts + port) |
| `compat.env.example` | Opt-in env knobs (disabled by default) |
| `policy-compat.sh` | Static review: strict hybrid-only + compat isolation/sunset gates |
| `scripts/gen-self-signed.sh` | Local smoke certs — `--with-compat` writes dedicated compat SANs |
| `verify-tls.sh` | `s_client` + TLS 1.2 rejection check |
| `verify-compat.sh` | Strict rejects classical-only; compat host:port accepts classical + TLS 1.2 |
| `smoke-handshake.sh` | Local handshake smoke (Docker or local OpenSSL≥3.5 nginx; no GHA) |
| `rollback-drill.sh` | Exercise 6.19 rollback checklist once (compat enable → restore hybrid default) |

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
# nginx appends one X-Forwarded-For hop; API must trust it for per-IP rate limits
TRUSTED_PROXY_HOPS=1
```

nginx reaches the API as `api:4000` on the Compose network (`OKKEY_API_UPSTREAM`). The prod compose publishes the API host port on **`127.0.0.1` only** — do not change that publish to `0.0.0.0` while `TRUSTED_PROXY_HOPS≥1`, or clients could bypass the proxy and forge `X-Forwarded-For`.

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

## Compat listeners (classical-only)

**Default: off.** Never merge classical groups onto the strict `server_name` hosts.

| Rule | Enforcement |
|------|-------------|
| Explicit | `OKKEY_COMPAT_ENABLED=1` (compose defaults to `0`) |
| Isolated hosts | `OKKEY_COMPAT_WEB_HOST` / `OKKEY_COMPAT_API_HOST` must differ from strict hosts |
| Isolated port | `OKKEY_COMPAT_HTTPS_PORT` default `8443` — **must not be 443** (entrypoint refuses). nginx/OpenSSL TLS 1.3 selects `key_share` from the default SSL_CTX on a listen socket, so different `ssl_ecdh_curve` / `ssl_protocols` cannot share `:443` with the hybrid default without bleeding or breaking one profile. |
| Isolated certs | `compat-fullchain.pem` / `compat-privkey.pem` (never reuse strict `fullchain.pem`) |
| Time-boxed | `OKKEY_COMPAT_SUNSET=YYYY-MM-DD` + `OKKEY_COMPAT_OWNER` required; past sunset → refuse start |
| Classical-only | `ssl_protocols TLSv1.2 TLSv1.3;` + `ssl_ecdh_curve X25519;` (TLS 1.2 required for compat purpose) |
| Optional allowlist | `OKKEY_COMPAT_ALLOW_CIDRS=10.0.0.0/8,…` → nginx `allow`/`deny all` |

**Technical choice (Vasya QA rework):** dedicated **port + cert + SNI**, not a second `server` on `:443`. Separate IP left open for Саша (product question); port is the working isolation without claiming IP policy.

```bash
# Static policy (no live edge required):
./proxy/policy-compat.sh

# Local handshake smoke (no GitHub Actions):
./proxy/smoke-handshake.sh

# Live: strict must reject classical-only; pass compat host+port when enabled:
./proxy/verify-compat.sh app.example.com 443
./proxy/verify-compat.sh app.example.com 443 compat-app.example.com 8443
```

Enable (example):

```bash
# Certs with dedicated compat SANs:
OKKEY_COMPAT_WEB_HOST=compat-app.example.com \
OKKEY_COMPAT_API_HOST=compat-api.example.com \
  ./proxy/scripts/gen-self-signed.sh --with-compat

# In install .env (see compat.env.example):
OKKEY_COMPAT_ENABLED=1
OKKEY_COMPAT_WEB_HOST=compat-app.example.com
OKKEY_COMPAT_API_HOST=compat-api.example.com
OKKEY_COMPAT_HTTPS_PORT=8443
OKKEY_COMPAT_SUNSET=2026-12-31
OKKEY_COMPAT_OWNER=sre-oncall@example.com
# OKKEY_COMPAT_ALLOW_CIDRS=10.0.0.0/8
```

## Rollback drill (6.19)

Approved emergency path: enable the pre-approved **compat** profile on isolated hosts, keep HTTPS, then restore hybrid-only default (`OKKEY_COMPAT_ENABLED=0`). Never put classical curves on the strict default `server_name`.

```bash
# Dry-run against manifests (no live edge required):
./proxy/rollback-drill.sh

# After a live enable/restore on real hosts (OpenSSL ≥ 3.5 client):
STRICT_HOST=app.example.com COMPAT_HOST=compat-app.example.com ./proxy/rollback-drill.sh
./proxy/verify-tls.sh app.example.com 443
```

Evidence: `docs/security/6.19-tls-transport-qday-evidence.md` §1 / §4.
