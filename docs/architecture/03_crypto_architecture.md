# Crypto Architecture

Okkey uses **client-side cryptography**.

All user data:

- encrypt → client
- store → server
- decrypt → client

Server **never has access to decrypted data**.

---

## Crypto Engine

All cryptography is implemented in Rust:
```text
rust/crypto-engine
```

Rust is chosen for the following reasons:
- memory safety
- high performance
- proven cryptographic libraries
- ability to compile to WASM

Crypto engine compiles to:
- WASM

and is used via:
- packages/crypto

Crypto engine primitives (Core):
- Argon2id (KDF)
- AES-256-GCM (AEAD)
- XChaCha20-Poly1305 (AEAD)
- Ed25519 (signing)
- X25519 (key exchange)

---

## Supported Algorithms

Okkey uses modern cryptographic algorithms.

Key derivation:
- Argon2id

Symmetric encryption:
- XChaCha20-Poly1305
- AES-256-GCM

Public key cryptography:
- Ed25519 → signatures
- X25519 → key exchange

Key derivation helpers:
- HKDF

Random generation:
- Secure OS RNG

---

## Key Hierarchy

Okkey uses a multi-level key system.

```text
Account
↓
Vault Key
↓
Vault Keys
↓
Item Keys
```

---

## Account Vault Key
VaultKey is used for account access.

VaultKey **is not stored directly**.

It is assembled from three parts.

---

## Split Key Model
```text
VaultKey = A + B + C
```

In Core v1 transport math, **+** is **32-byte XOR** (element-wise) over the derived key material: `VaultKey = A ⊕ B ⊕ C`.

where:
- A — Server Share
- B — Device Share
- C — Password Share

### A — Server Share
Stored on the server (32-byte share `server_key_share` on the user row, together with KDF salt/version for **C**).
- not the full VaultKey
- stored in database

### B — Device Share
Stored in the device's secure storage.
- iOS → Keychain
- Android → Keystore
- Desktop → OS Secure Storage
- Web → IndexedDB + WebCrypto

### C — Password Share
Derived from master password.
```text
C = Argon2id(master_password)
```

---

## Vault Unlock Flow
When user opens vault:

1. fetch server share
2. read device share
3. derive password share
4. reconstruct VaultKey
5. decrypt user private key
6. decrypt vault keys

---

## User Key Pair

Each user has:
- UserPublicKey
- UserPrivateKey

Private key is stored:
- encrypted with VaultKey

This enables:

- secure sharing
- secure device authorization
- encrypted invites

---

## Vault Keys

Each vault has a separate key. For example:
- VaultKey_personal
- VaultKey_team
- VaultKey_devops

Items inside vault:
- encrypted with VaultKey

---

## Attachments Encryption

Files are encrypted separately.

```text
AttachmentKey
↓
encrypt file
↓
store encrypted in object storage
```

AttachmentKey: encrypted with VaultKey

---

## Key Rotation

When access changes:
- generate new VaultKey
- re-encrypt items
- distribute keys

Rotation is used for:

- user removal
- role change
- security events

---

## Crypto Rules

Okkey cryptography rules:

1. Cryptography is implemented only in Rust.
2. Typescript does not implement crypto algorithms.
3. Backend never decrypts vault data.
4. All keys are transferred only in encrypted form.
5. All operations are performed on the client.

---

## Q-Day / Post-Quantum Extension Principles

For Q-Day readiness in Core first production release, the crypto layer follows these rules:

1. Every new encrypted artifact carries explicit `crypto_version` and `algorithm` metadata.
2. Production write paths are `v2` only; `v1` is allowed only for explicit dev/test fixtures.
3. Sharing envelopes move to hybrid mode (ECC + PQ) before any pure-PQ cutover.
4. Capability detection per user/device must not introduce silent downgrade or legacy fallback in production.
5. Migration and key rotation are event-log-safe and idempotent.
6. Downgrade attempts to weaker crypto versions are rejected by policy.
7. First production release has no legacy client-data compatibility obligations.

### Event log monotonicity (server)

For each vault, the sync/event log stores `payload_schema_version` per row. The server enforces:

- `MAX(payload_schema_version)` over existing events for that vault is a **floor**: new appends must satisfy `requested_crypto_version >= floor` (unless there are no events yet).
- This is independent of **environment** allowlist checks (`CRYPTO_ALLOWED_PROFILE_VERSIONS`). Both must pass.

See also: `docs/architecture/08_security_model.md` (Downgrade threats).

Environment baseline policy for new writes:

- `dev`: legacy `v1` may be used for fixtures/tests.
- `stage` and `production`: only `v2` is accepted for new encrypted write paths.
