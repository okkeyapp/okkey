# Crypto V2 (Q-Day) Architecture

This document defines the Core roadmap for post-quantum readiness without breaking zero-knowledge guarantees.

---

## Goals

- Add crypto agility through explicit versioning.
- Introduce hybrid ECC + PQ sharing envelopes.
- Keep backward compatibility during migration.
- Preserve client-side cryptography and split-key model.

---

## Non-Goals

- Moving cryptography to backend.
- Replacing Core with enterprise-only cryptography.
- Breaking v1 vault decryptability.

---

## Versioned Encrypted Artifacts

All new encrypted artifacts use versioned wrappers:

```ts
type EncryptedBlob = {
  crypto_version: number;
  algorithm: "classical" | "hybrid" | "pq";
  payload: Uint8Array;
  meta?: Record<string, unknown>;
};
```

Applies to wrapped vault keys, item payload envelopes, encrypted private keys, and capsules.

---

## Crypto Profiles

- `v1`: current classical profile.
- `v2`: hybrid profile (ECC + PQ envelope).
- `v3+`: reserved for future PQ-first profiles.

Profile resolution is runtime-driven via a versioned config registry.

Baseline policy by environment:

- `dev`: `v1`, `v2` (fixtures and compatibility tests allowed).
- `stage`: `v2` only for new write operations.
- `prod`: `v2` only for new write operations.

---

## Hybrid Sharing Model

During migration, key sharing uses a hybrid envelope containing both ECC and PQ ciphertext components. Decrypt path is selected by verified capabilities, never by silent downgrade.

### Canonical Hybrid Envelope (v1)

For `crypto_version=v2` hybrid transport, the binary envelope is fixed and versioned:

- `version` (`u8`) = `1`
- `kdf_id` (`u8`) = `1` (`SHA-256(domain || ecc_shared || pq_shared || aad)`)
- `aead_id` (`u8`) = `1` (`XChaCha20-Poly1305`)
- `reserved` (`u8`) = `0`
- `ecc_ephemeral_public_key` (`32 bytes`, X25519)
- `pq_ciphertext` (`1088 bytes`, ML-KEM-768 ciphertext)
- `nonce` (`24 bytes`, XChaCha20-Poly1305 nonce)
- `ciphertext` (`N bytes`, AEAD payload with 16-byte tag suffix)

`hybrid_envelope_fixed_header_len` is therefore `1+1+1+1+32+1088+24 = 1148 bytes`.

Validation requirements:

- strict byte lengths for ECC/PQ/nonce fields;
- reject unsupported `version`, `kdf_id`, `aead_id`;
- reject envelopes shorter than fixed header + AEAD tag;
- decrypt only through Rust engine primitives (no JS/TS crypto fallback path).

### Rust/WASM Primitive API (6.6)

Core primitive entrypoints for hybrid transport:

- `generate_pq_keys()` -> `[mlkem768_decapsulation_key || mlkem768_encapsulation_key]`
- `encrypt_hybrid(sender_private_key, recipient_public_key, recipient_pq_public_key, aad, plaintext)` -> `hybrid_envelope_v1`
- `decrypt_hybrid(recipient_private_key, recipient_pq_private_key, aad, envelope)` -> `plaintext`

TypeScript wrapper names in `@okkey/crypto`:

- `generatePQKeys()`
- `encryptHybrid(...)`
- `decryptHybrid(...)`
- `hybridEnvelopeFixedHeaderLen()`

---

## WASM + SDK Version-Aware API (6.7)

`@okkey/crypto` provides a stable version-aware surface above raw WASM exports:

- `getHybridEnvelopeConfig()` returns canonical envelope params (version, ids, fixed lengths) sourced from WASM.
- `decodeHybridEnvelope(envelope)` validates header ids/lengths and returns structured views.
- `encodeHybridEnvelope(parts)` builds a binary envelope with strict part length checks.
- `generatePQKeys()`, `encryptHybrid(...)`, `decryptHybrid(...)` remain primary runtime primitives.

Error model for SDK consumers:

- all WASM runtime failures are mapped to `CryptoSdkError`;
- stable codes: `UNSUPPORTED_ALGORITHM`, `INVALID_KEY_LENGTH`, `MALFORMED_ENVELOPE`, `DECRYPT_FAILED`, `INTERNAL`;
- clients must branch by `code` instead of parsing low-level WASM messages.

Cross-layer compatibility requirement:

- same envelope contract is asserted by tests through Rust unit checks + WASM smoke + TS API integration tests;
- no JS/TS crypto fallback implementation is allowed for hybrid/PQ primitives.

---

## Migration Strategy

- Lazy migration on unlock/access for active users.
- Background migrations for large vaults.
- Idempotent migration modules (`v1_to_v2` etc.).
- Vault-level `crypto_version` metadata and replay-safe updates.

---

## Rotation Policy

Key rotation remains mandatory for access changes and is upgraded to hybrid rewrap for all active recipients. Rotation and migration updates must remain event-log-safe and rollback-safe.

---

## Compatibility Matrix

System target behavior:

- old user + old vault: supported;
- new user + old vault: supported;
- old user + new vault: supported via policy-approved fallback;
- new user + new vault: hybrid path enabled.

---

## Security Controls

Required controls include:

- downgrade attack tests;
- mixed-fleet compatibility tests;
- missing PQ key tests;
- fuzz/property tests for hybrid envelope decode/decrypt.
