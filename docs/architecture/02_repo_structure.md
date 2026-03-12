# Okkey Repository Structure

Okkey uses a **monorepo architecture**.
This allows all applications to use shared libraries, cryptography, and SDKs.

Main goals of the structure:

- single crypto engine
- shared SDKs for clients
- separation of backend and clients
- convenient development and CI/CD
- support for self-hosted infrastructure

---

# Root Structure

```
okkey
 │
 ├ apps/
 ├ packages/
 ├ services/
 ├ rust/
 ├ infrastructure/
 ├ docs/
 │
 ├ CONTEXT.md
 └ README.md
```

---

## apps
Applications that users interact with.

```
apps/
 ├ web
 ├ mobile
 ├ desktop
 └ extension
```

### apps/web
Main web application.

Technologies:
- React
- Next.js
- Typescript

Responsible for:
- UI
- vault management
- sharing
- account settings

### apps/mobile
Mobile application (ios, android).

Technologies:
- React Native
- Typescript

Secure storage:
- iOS Keychain
- Android Keystore

### apps/desktop
Desktop application.

Technologies:
- Tauri
- React UI
- Rust backend

Advantages:

- small size
- native performance
- secure OS integration

### apps/extension
Browser extension.

Technologies:
- React
- WebExtension API
- Typescript

Support:
- Chrome
- Firefox
- Edge
- Opera

Extension is used for:
- autofill
- password capture
- quick vault access

---

## packages
Shared libraries used by all applications.

```
packages/
 ├ api/
 ├ auth/
 ├ crypto/
 ├ vault/
 ├ sync/
 ├ ui/
 ├ hooks/
 └ types/
```

### packages/api
SDK for communicating with Okkey API.

Contains:
- REST client
- WebSocket client
- API types

Used by:
- apps/web
- apps/mobile
- apps/desktop
- apps/extension

### packages/auth
Authentication logic.

Contains:
- login flows
- passkey
- 2FA
- device authorization
- session handling

### packages/crypto
Bindings for Rust crypto engine.

Contains:
- WASM loader
- crypto API
- key derivation
- encryption helpers

IMPORTANT:

Typescript **never implements cryptography**.
All operations are performed via Rust WASM.

### packages/vault
Vault logic.

Contains:
- vault decryption
- vault encryption
- item CRUD
- key handling
- sharing logic

### packages/sync
Data synchronization.

Contains:
- event processing
- conflict resolution
- offline sync
- local state management

### packages/ui
Shared UI React components.

Used by:
- apps/web
- apps/mobile
- apps/desktop
- apps/extension

### packages/hooks
React hooks for working with Okkey.

For example:
- useVault()
- useAuth()
- useSync()

### packages/types
Common system types.

Contains:
- API types
- vault types
- event types
- crypto types

---

## services
Okkey backend services.

```
services/
 ├ api/
 └ worker/
```

### services/api
Main backend server.

Technologies:
- Node.js
- Typescript
- Fastify / NestJS
- PostgreSQL
- Redis

Main services:
- Auth Service
- Vault Service
- Sharing Service
- Sync Service
- Device Service

Backend performs only:
- authentication
- sync
- sharing metadata
- device management
- event storage

Backend **never has access to decrypted vault data**.

### services/worker
Background processes.

Performs:
- key rotation tasks
- cleanup
- email notifications
- background sync jobs

---

## rust
Rust components of the system.

```
rust/
 └ crypto-engine/
```

### rust/crypto-engine
Cryptographic core of Okkey.

Contains:
- Argon2id
- XChaCha20-Poly1305
- Ed25519
- X25519
- HKDF
- secure random

Compiles to:
- WASM

Used by:
- packages/crypto
- apps/web
- apps/mobile
- apps/desktop
- apps/extension

---

## infrastructure
Deployment infrastructure.

```
infrastructure/
 ├ docker/
 ├ terraform/
 └ kubernetes/
```

### infrastructure/docker
Docker configuration.

Contains:
- docker-compose.yml
- Dockerfiles

For running self-hosted:
```
docker compose up
```

### infrastructure/terraform
Infrastructure as Code.

Used for SaaS deployment.

### infrastructure/kubernetes
Kubernetes deployment manifests.

For enterprise and cloud clusters.

---

## docs
Project documentation.

```
docs/
 └ architecture/
```

### docs/architecture
Architectural documents.
