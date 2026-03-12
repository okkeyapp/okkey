# Okkey System Overview

Okkey is an end-to-end encrypted password manager with support for:

- Web
- Mobile
- Desktop
- Browser extensions
- SaaS and Self-Hosted deployments

Main goal of the architecture — security, scalability, and a single codebase for all clients.

## Okkey General Architecture

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
                        │         Okkey API          │
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

## High Level Architecture

```
Clients
│
│ HTTPS / WebSocket
▼
Okkey API
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

Okkey API is responsible for:

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
