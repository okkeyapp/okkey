# Okkey System Overview

Okkey is an end-to-end encrypted password manager with support for:

- Web
- Mobile
- Desktop
- Browser extensions
- SaaS and Self-Hosted deployments

Main goal of the architecture is security, scalability, and a single codebase for all clients.
Terminology is defined in `docs/glossary.md`.

---

## Open-Core Separation

Okkey uses an **open-core** model:

- `okkey/` contains the full open-source core
- `okkey-enterprise/` contains private enterprise extensions

Enterprise modules are **extensions over Core** (Plugins + Feature Interfaces) and never required for Core to run.

---

## Core Domain Model

Key product concepts (see `docs/glossary.md`):

- User and trusted Device
- Storage / Account (user data container)
- Workspace (group of vaults and members)
- Vault (secure container with its own key)
- Item (record inside a vault)

---

## Okkey General Architecture (Core)

                        ┌────────────────────────────┐
                        │           Clients          │
                        │                            │
                        │  Web App (React)           │
                        │  Mobile App (ReactNative)  │
                        │  Desktop App (Tauri)       │
                        │  Browser Extension         │
                        └─────────────┬──────────────┘
                                      │
                                      │ HTTPS / WebSocket
                                      │
                        ┌─────────────▼──────────────┐
                        │       Okkey Core API       │
                        │                            │
                        │ Auth Service               │
                        │ Vault Service              │
                        │ Sharing Service            │
                        │ Sync Service               │
                        │ Device Service             │
                        └─────────────┬──────────────┘
                                      │
                ┌─────────────────────┼─────────────────────┐
                │                     │                     │
                ▼                     ▼                     ▼

        ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
        │ PostgreSQL   │      │ Redis        │      │ MinIO        │
        │              │      │              │      │              │
        │ users        │      │ sessions     │      │ attachments  │
        │ vault meta   │      │ cache        │      │ files        │
        │ sharing meta │      │ locks        │      │ backups      │
        └──────────────┘      └──────────────┘      └──────────────┘

---

## Optional Enterprise Extension (Separate Repo)

Enterprise modules plug into the Core API via Feature Interfaces and the Plugin Registry.

                        ┌────────────────────────────┐
                        │   Enterprise Extensions    │
                        │  (okkey-enterprise repo)   │
                        │                            │
                        │  SSO / SCIM / Audit        │
                        │  Org Policies / Admin      │
                        └─────────────┬──────────────┘
                                      │
                                      │ Feature Interfaces
                                      ▼
                        ┌────────────────────────────┐
                        │       Okkey Core API       │
                        └────────────────────────────┘

---

## Cryptography (Rust Crypto Engine)

                   ┌────────────────────┐
                   │  Rust Crypto Core  │
                   │                    │
                   │ Argon2             │
                   │ AES-256-GCM        │
                   │ XChaCha20-Poly1305 │
                   │ Ed25519            │
                   │ X25519             │
                   └─────────┬──────────┘
                             │
                WASM bindings│
                             │
          ┌──────────────────▼─────────────────┐
          │            Clients                 │
          │                                    │
          │ encryption / decryption            │
          │ key derivation                     │
          │ signing                            │
          └────────────────────────────────────┘

---

## Main Principles

### Zero Knowledge

Server never sees decrypted user data.

All data:

- encrypted
- decrypted

exclusively on the client.

---

### End-to-End Encryption

All vault data:

```
encrypt → client
store → server
decrypt → client
```

---

### Split Key Architecture

Vault Key consists of 3 parts:

```
VaultKey = A + B + C
```

where:

```
A → server share
B → device share
C → master password share
```

Vault can be opened only with all three parts.

---

### Crypto Agility and Q-Day Readiness

Core uses explicit crypto versioning for encrypted artifacts and a strict production policy:

- `v1` classical cryptography
- `v2` hybrid ECC + PQ envelopes (production baseline)
- future pure-PQ modes

For the first production release, all production write paths are `v2` only, without legacy client-data obligations. Legacy `v1` behavior is limited to explicitly documented dev/test fixtures.

---

## High Level Architecture

```
Clients
│
│ HTTPS / WebSocket
▼
Okkey Core API
│
├ PostgreSQL
├ Redis
└ MinIO
```

---

## Main Components

### Clients

- Web App
- Mobile App
- Desktop App
- Browser Extension

---

### Backend

Okkey Core API is responsible for:

- authentication
- synchronization
- vault management
- access management

---

### Storage

Used:

```
PostgreSQL → metadata
Redis → cache / sessions
MinIO → attachments
```

---

## Crypto Engine

All cryptography is implemented in **Rust**.

It compiles to:

```
WASM
```

and is used in all clients.
