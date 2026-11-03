# SaaS edge / ingress (PQ TLS)

**Stack:** same primary as self-host — nginx linked to **OpenSSL ≥ 3.5**, default key exchange **`X25519MLKEM768`**, **TLS 1.3 only**.

| Environment | Env file | Default hosts (override in real deploy) |
|-------------|----------|-----------------------------------------|
| **stage** | `overlays/stage.env` | `app.stage.okkey.app` / `api.stage.okkey.app` |
| **prod** | `overlays/prod.env` | `app.okkey.app` / `api.okkey.app` |

Both overlays use the **identical** TLS directives baked into the shared image (`ssl_protocols TLSv1.3;` + `ssl_ecdh_curve X25519MLKEM768;`). Classical groups are not listed → no silent downgrade on the default route.

**Compat / classical-only** (q3-4): off by default. Opt-in via `overlays/compat.env.example` → merge into stage/prod env only with isolated hostnames + sunset/owner. Entrypoint refuses host collisions and past sunsets. Never add classical curves to the default `OKKEY_WEB_HOST` / `OKKEY_API_HOST`.

If TLS terminates on an external CDN/LB instead of this nginx edge, that front must negotiate the same hybrid group string (`X25519MLKEM768` or stack-native equivalent) with no silent classical fallback on the default hostname. Compat exceptions on a CDN must likewise be a separate hostname with an explicit sunset.

## Layout

| Path | Purpose |
|------|---------|
| `docker-compose.edge.yml` | Edge-only compose (builds shared nginx image from `deploy/docker/proxy/nginx`) |
| `overlays/stage.env.example` | Stage hosts + upstreams |
| `overlays/prod.env.example` | Prod hosts + upstreams |
| `overlays/compat.env.example` | Opt-in classical-only hosts (disabled by default) |
| `policy-review.sh` | Static review: hybrid-only default + compat off/isolation gates |
| `verify-tls.sh` | Live `s_client` check (OpenSSL ≥ 3.5 client) |
| `../../docker/proxy/verify-compat.sh` | Strict rejects classical-only; optional compat host check |
| `scripts/gen-self-signed.sh` | Local smoke certs (not for real stage/prod) |

## Apply (edge-only)

From this directory (`deploy/saas/edge`):

```bash
# Stage
cp overlays/stage.env.example overlays/stage.env   # edit hosts/upstreams/certs
./scripts/gen-self-signed.sh                       # or mount real ACME certs into ./certs
docker compose -f docker-compose.edge.yml --env-file overlays/stage.env \
  up -d --build
./verify-tls.sh "${OKKEY_WEB_HOST:-app.stage.okkey.app}" 443

# Prod (after stage evidence)
cp overlays/prod.env.example overlays/prod.env
./policy-review.sh                                 # must PASS before promote
docker compose -f docker-compose.edge.yml --env-file overlays/prod.env \
  up -d --build
```

Upstreams (`OKKEY_WEB_UPSTREAM` / `OKKEY_API_UPSTREAM`) point at the private SaaS service DNS (or mesh), not at public hosts.

## Prod config review (no silent downgrade)

```bash
./policy-review.sh
```

Checks:

1. Shared nginx site template lists only `X25519MLKEM768` (no classical ECDH groups).
2. Template requires `TLSv1.3` only.
3. Stage and prod env examples do not inject alternate curve/protocol overrides.
4. Compat remains `ENABLED=0` in stage/prod examples; shared `policy-compat.sh` passes (isolation/sunset gates).

## Verify (stage evidence snippet)

Client OpenSSL ≥ 3.5:

```bash
./verify-tls.sh app.stage.okkey.app 443
# or:
openssl s_client -connect app.stage.okkey.app:443 -tls1_3 \
  -servername app.stage.okkey.app -groups X25519MLKEM768 </dev/null 2>&1 \
  | grep -Ei 'Protocol|Negotiated|group|VERIFY'
curl -I --tls-max 1.2 https://app.stage.okkey.app/   # must fail
```

Expect negotiated group **`X25519MLKEM768`**. Capture the snippet for the evidence record; do not put secrets in the record.

## Rollback drill (6.19)

Same approved path as self-host: enable isolated classical compat hosts → restore `OKKEY_COMPAT_ENABLED=0`. Shared script:

```bash
../../docker/proxy/rollback-drill.sh
# optional live hosts:
STRICT_HOST=app.stage.okkey.app COMPAT_HOST=compat-app.stage.okkey.app \
  ../../docker/proxy/rollback-drill.sh
```

See `deploy/docker/proxy/README.md` § Rollback drill and evidence §1 / §4.
