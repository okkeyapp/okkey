# Okkey Open-Source Architecture (Open Core)

Okkey is a zero-knowledge password manager built with an **open-core** model.
Terminology is defined in `docs/glossary.md`.

This repository (`okkey/`) contains the **open-source core** that must be fully functional **without** any enterprise code.
Enterprise extensions live in a separate private repository: `okkey-enterprise/`.

---

## Main Principles

1. Zero-knowledge encryption
2. Client-side cryptography only
3. Split-key architecture
4. Event log synchronization
5. Offline-first
6. SaaS + Self-hosted deployment
7. Enterprise features are **extensions** over Core (Plugins + Feature Interfaces + feature gating)
8. Crypto-agility with explicit `crypto_version` on encrypted artifacts
9. Q-Day-ready by default from first production day
10. Post-quantum rollout without backend access to plaintext/keys

---

## Open-Source Scope (This Repo)

Core includes:

- Clients (web, mobile, desktop, browser extension)
- Shared SDKs (API, crypto bindings, vault, sync, auth, UI)
- Core backend services (API + worker)
- Rust crypto engine (WASM)
- Self-hosting infrastructure (docker/terraform/kubernetes)

---

## Enterprise Scope (Separate Repo)

Enterprise features **must not** alter Core behavior and **must not** be required for Core to work.
They attach via the Core Plugin Registry and Feature Interfaces.

Typical enterprise modules:

- SSO / SAML / OIDC
- SCIM / directory sync
- Audit logs
- Organization policies
- Admin & reporting
- Enterprise sync / high availability

Enterprise architecture docs are in `okkey-enterprise/docs/architecture/`.

---

## Key Architectural Boundary

Core backend exposes:

- Plugin Registry
- Feature Interfaces
- license/feature-flag hooks

Enterprise backend provides:

- Plugin implementations
- extra tables
- enterprise deployment assets

The **database schema is compatible**: enterprise only adds new tables.

---

## Q-Day Release Policy (First Production Day)

Core release policy for cryptography:

- all production encrypted write paths are `crypto_version=v2` only
- no silent fallback to weaker profiles is allowed
- no legacy client-data obligations are part of the first production release
- `v1` is allowed only for explicit dev/test fixtures
- enterprise extensions cannot override this policy

Release gates and readiness checklist are defined in `docs/release_policy_qday.md`.

---

## Architecture Documents (Open-Source)

- docs/api_contracts.md (Core HTTP API — canonical with `docs/openapi/core-api.yaml`)
- docs/architecture/01_system_overview.md
- docs/architecture/02_repo_structure.md
- docs/architecture/03_crypto_architecture.md
- docs/architecture/14_crypto_v2_qday.md
- docs/release_policy_qday.md
- docs/architecture/04_vault_architecture.md
- docs/architecture/05_sync_architecture.md
- docs/architecture/06_backend_architecture.md
- docs/architecture/07_clients_architecture.md
- docs/architecture/08_security_model.md
- docs/architecture/09_self_hosting.md
- docs/architecture/10_authentication_flows.md
- docs/architecture/11_database_schema.md
- docs/architecture/12_open_core_boundary.md
- docs/architecture/13_domain_model_access.md
- docs/storage_and_infrastructure.md
- docs/glossary.md