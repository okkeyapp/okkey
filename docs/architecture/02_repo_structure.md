# Okkey Repository Structure (Open-Source Core)

Okkey uses an **open-core** model with **two repositories**:

- `okkey/` — open-source core (this repository)
- `okkey-enterprise/` — private enterprise extensions

This document describes **only the open-source core**.

Main goals of the structure:

- single crypto engine
- shared SDKs for clients
- separation of backend and clients
- convenient development and CI/CD
- support for self-hosted infrastructure
- clear enterprise extension boundary

---

# Root Structure (okkey/)

```
okkey
 │
 ├ apps/
 ├ packages/
 ├ services/
 ├ rust/
 ├ infrastructure/
 └ docs/
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

- Vite
- React
- TypeScript

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

---

## services

Backend services.

```
services/
 ├ api/
 └ worker/
```

The Core backend exposes the **Plugin Registry** and **Feature Interfaces**.
Enterprise modules implement these interfaces in the `okkey-enterprise/` repo.

---

## rust

Crypto engine (Rust + WASM).

```
rust/
 └ crypto-engine/
```

---

## infrastructure

Self-hosting and deployment artifacts.

```
infrastructure/
 ├ docker/
 ├ terraform/
 └ kubernetes/
```

---

# Enterprise Repository (Separate)

Enterprise code lives in `okkey-enterprise/` and contains only extensions.
See `okkey-enterprise/docs/architecture/` for details.