# Backend Architecture (Core)

Okkey backend is implemented as a **stateless API**.

**Core HTTP API contracts:** [`docs/api_contracts.md`](../api_contracts.md) and [`docs/openapi/core-api.yaml`](../openapi/core-api.yaml).

Backend does not perform cryptography and does not have access to decrypted data.

---

## Backend Responsibilities

Backend is responsible for:
- authentication
- device management
- event sync
- vault metadata
- sharing metadata

---

## Tech Stack

Backend is implemented using:
- Node.js
- Typescript
- Fastify / NestJS

Storage:
- PostgreSQL
- Redis
- Object Storage

---

## Core Services

Main backend services:
- Auth Service
- Vault Service
- Sharing Service
- Sync Service
- Device Service

### Auth Service

Responsible for:
- login
- sessions
- passkeys
- 2FA

### Vault Service

Manages vault metadata.
- create vault
- update vault
- delete vault

Vault data: encrypted

### Sharing Service

Manages access.
- invite users
- manage roles
- revoke access

### Sync Service

Implements event sync.
- store events
- broadcast events
- deliver events

### Device Service

Manages user devices.
- register device
- authorize device
- revoke device

### Transactional email

Auth codes, device approval, workspace invites (planned), and 2FA notices are sent only through the **central email layer** (`services/api/src/email/`): registry, `en`/`ru` templates, locale rules, and a single transport abstraction. See [`docs/backend-email.md`](../backend-email.md).

---

## Plugin / Extension Layer

Core backend exposes:
- Plugin Registry
- Feature Interfaces
- feature-flag hooks

Enterprise modules (from `okkey-enterprise/`) implement these interfaces.
Core must run fully without any enterprise plugins.

Example load order:

```
loadCorePlugins()

if enterprise_enabled:
    loadEnterprisePlugins()
```

Enterprise features are gated by:
- license key validation
- feature flags
- deployment mode

---

## Storage

PostgreSQL:
- users
- vaults
- items_metadata
- events
- devices
- vault_members

Redis:
- sessions
- cache
- locks

Object Storage:
- attachments
- backups

### Storage Layer

Core backend uses a dedicated storage layer (`services/api/src/storage`) with:
- Postgres connection and transaction wrapper
- Redis connection and cache/session helpers
- Base repositories for `users`, `workspaces`, `vaults`, `items`, `events`

Repositories are the only access point to persistent storage for service handlers.

---

## Security Principle

Backend never performs:
- vault decryption
- password access
- key derivation

It works only with:
- encrypted blobs
- metadata
