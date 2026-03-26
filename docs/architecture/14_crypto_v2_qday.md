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
