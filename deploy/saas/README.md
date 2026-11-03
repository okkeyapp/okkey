# SaaS deployment assets (managed edge)

Managed (Okkey team) stage/prod edge lives under [`edge/`](./edge/).

**TLS policy (Q-Day #3):** same as self-host primary — **nginx + OpenSSL ≥ 3.5**, hybrid group **`X25519MLKEM768`**, **TLS 1.3 only** on the default listener. No silent classical downgrade. Classical-only exceptions: explicit isolated time-boxed compat hosts (`edge/overlays/compat.env.example`), off by default.

Self-host compose template: [`../docker/proxy/`](../docker/proxy/).
