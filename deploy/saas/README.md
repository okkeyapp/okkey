# SaaS deployment assets (managed edge)

Managed (Okkey team) stage/prod edge lives under [`edge/`](./edge/).

**TLS policy (Q-Day #3):** same as self-host primary — **nginx + OpenSSL ≥ 3.5**, hybrid group **`X25519MLKEM768`**, **TLS 1.3 only** on the default listener. No silent classical downgrade.

Self-host compose template: [`../docker/proxy/`](../docker/proxy/).
