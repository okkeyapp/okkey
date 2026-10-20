# Crypto V2 (Q-Day) Architecture

This document defines the Core roadmap for post-quantum readiness without breaking zero-knowledge guarantees.

---

## Goals

- Add crypto agility through explicit versioning.
- Introduce hybrid ECC + PQ sharing envelopes.
- Enforce `Q-Day-ready by default` from the first production release.
- Preserve client-side cryptography and split-key model.

---

## Non-Goals

- Moving cryptography to backend.
- Replacing Core with enterprise-only cryptography.
- Treating legacy client-data compatibility as a first-release production obligation.

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

Profile resolution is runtime-driven via a versioned config registry in `packages/crypto/src/config/` (`v1.ts`, `v2.ts`, `index.ts`).
SDK entrypoint `getCryptoConfig(version)` is the single public resolver for profile selection.

Baseline policy by environment:

- `dev`: `v1`, `v2` (fixtures and compatibility tests allowed).
- `stage`: `v2` only for new write operations.
- `prod`: `v2` only for new write operations.

For first production release, Core does not guarantee legacy client-data migration flows. Legacy compatibility remains test-only unless explicitly approved by release policy.

Resolver policy:

- unsupported profile versions must fail through typed SDK error (`CryptoSdkError`);
- write paths must resolve profile via `getCryptoConfig(version)` and must not hardcode profile branches in production flows.

---

## Key-transport claims (Q-Day #2)

Honest inventory lives in `okkey-internal/docs/core/qday-pq-key-transport-claim-map.md`. Summary for Core tip (`dev`):

| Surface | Posture | Claim |
|---------|---------|-------|
| Shared vault key wrap / rotate | Hybrid `hybrid_ecc_pq_v1`; ECC = per-user Ed25519→X25519 (`per_user_ed25519_x25519_v1`); legacy Alice unwrap only | «Per-recipient hybrid ECC+PQ vault-key wrap» |
| Critical signatures | `hybrid_ed25519_pq_bind_v1` | «Critical vault ops signed with Ed25519 + PQ bind» |
| Capsule guest key | OOB fragment / `out_of_band` — **not** hybrid KEM (`oob_fragment_not_kem`) | «Capsule guest key is OOB in URL fragment, not hybrid KEM» |
| Split-key / new-device share B | Opaque 32-byte local — **out of hybrid-KEM scope** (`opaque_local_not_hybrid_kem`) | «PQ applies to identity keys, not share-B transport» |
| Offline recovery secret | Argon2id + AEAD | **not** «PQ-KEM wrapped» |

Enterprise device-recovery + contact-release hops (hybrid via Core `encryptHybrid`, packed recipient 1216 B) are documented in `okkey-enterprise/docs/architecture/11_account_recovery_protocol.md`.

Policy locks: `services/api/src/capsule/key-transport-policy.ts`, `services/api/src/registration/split-key-transport-policy.ts`.

## Hybrid Sharing Model

Key sharing uses a hybrid envelope containing both ECC and PQ ciphertext components. Decrypt path is selected by verified capabilities, never by silent downgrade.

### Vault key wrap ECC leg

- **New wraps:** recipient X25519 derived from Ed25519 identity (`ed25519_public_to_x25519` / `ed25519_secret_to_x25519`); `meta.ecc_mode = per_user_ed25519_x25519_v1`.
- **Legacy unwrap only:** `meta.ecc_mode = interim_static_v1` (or missing) → RFC 7748 Alice. Do not write new interim wraps.

Helpers: `packages/crypto/src/vault-key-wrap.ts`.

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
  - `recipient_public_key` is **X25519**; `sender_private_key` is unused (ephemeral X25519 is generated inside)
- `decrypt_hybrid(recipient_private_key, recipient_pq_private_key, aad, envelope)` -> `plaintext`
- `ed25519_secret_to_x25519` / `ed25519_public_to_x25519` — libsodium-compatible conversion so vault wraps bind the ECC leg to existing Ed25519 identity (`users.public_key`) without a separate X25519 column

Vault key wrap (`packages/crypto` `wrapVaultKeyForRecipient` / `unwrapVaultKeyForSelf`):

- New writes: `meta.ecc_mode = "per_user_ed25519_x25519_v1"` (convert recipient Ed25519 → X25519, then hybrid encrypt)
- Legacy unwrap: `meta.ecc_mode = "interim_static_v1"` (or missing) uses RFC7748 Alice; do not emit new interim wraps

TypeScript wrapper names in `@okkey/crypto`:

- `generatePQKeys()`
- `encryptHybrid(...)`
- `decryptHybrid(...)`
- `ed25519SecretToX25519(...)` / `ed25519PublicToX25519(...)`
- `hybridEnvelopeFixedHeaderLen()`
- `wrapVaultKeyForRecipient(...)` / `unwrapVaultKeyForSelf(...)`

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

- No post-factum migration obligations for first production client data.
- `v2` is required for new production writes from day one.
- Legacy migration tooling is limited to internal pre-prod/test data.
- Vault-level `crypto_version` metadata and replay-safe updates remain mandatory invariants.
- Internal tooling runbook and guardrails are documented in `docs/security/6.23-preprod-migration-tooling.md`.

---

## Rotation Policy

Key rotation remains mandatory for access changes and is upgraded to hybrid rewrap for all active recipients. Rotation and migration updates must remain event-log-safe and rollback-safe.

---

## Compatibility Matrix

System target behavior:

- `dev`: `v1` and `v2` allowed for fixtures and compatibility tests.
- `stage`: only `v2` writes; downgrade blocked.
- `prod`: only `v2` writes; downgrade blocked; no legacy exceptions by default.

Release gates and readiness checklist are defined in `docs/release_policy_qday.md`.

---

## Security Controls

Required controls include:

- downgrade attack tests;
- mixed-fleet compatibility tests;
- missing PQ key tests;
- fuzz/property tests for hybrid envelope decode/decrypt.

---

## Hybrid Signatures for Critical Artifacts (6.18)

To protect authenticity and integrity of critical sync/sharing operations, Core adds a hybrid signature path.

Scope (first iteration):

- sync append path for critical events (`VAULT_SHARE`, `VAULT_KEY_ROTATION`);
- sharing/rotation operations that produce these events (`share/revoke/rotate/update-role`);
- replay pipeline validation for configured critical event types.
- invite artifacts are planned by product scope; invite HTTP (`GET/POST /invitations/:token`) lives on the enterprise `workspace-members` plugin, not Core.

Out of scope:

- retroactive full re-signing of historical data.

### Signature Envelope (v1)

Canonical envelope:

```ts
type HybridSignatureEnvelopeV1 = {
  version: 1;
  algorithm: "hybrid_ed25519_pq_bind_v1";
  key_id: string;
  context:
    | "sync.append"
    | "vault.share"
    | "vault.revoke"
    | "vault.rotate"
    | "vault.member_role_update";
  signer_pq_public_key: string; // base64
  payload_hash: string; // base64(SHA-256(canonical_payload_bytes))
  signature: string; // base64
  created_at: string; // RFC3339
};
```

Canonical payload form:

- deterministic JSON serialization with recursively sorted object keys;
- no backend plaintext access required: signing/verification runs over ciphertext envelope structures;
- context-specific domain separation is mandatory.

### Verification Path

Server verify gate:

1. parse envelope and validate version/algorithm/context;
2. verify signer binding (`signer_pq_public_key` matches actor PQ identity metadata);
3. recompute `payload_hash` from canonical payload;
4. cryptographically verify signature against actor Ed25519 public key;
5. reject on failure with `SIGNATURE_INVALID`.

Policy behavior:

- `compat`: signature optional; if provided, strict verification applies;
- `strict`: signature required for critical operations; missing signature rejected (`SIGNATURE_REQUIRED`).

Replay behavior:

- replay engine can enforce signature presence and integrity for configured critical event types;
- invalid or missing signatures in enforced mode cause fail-fast security error.

### Fuzz and Property Program (6.13)

Mandatory artifacts for `v2` hybrid safety:

- Rust fuzz harnesses under `rust/crypto-engine/fuzz/`:
  - `hybrid_decode`
  - `hybrid_decrypt`
  - `signature_verify`
- Rust property tests in `rust/crypto-engine/src/property_tests.rs`.
- TS/WASM property + contract tests in `packages/crypto/test/hybrid.property.test.mjs` and `packages/crypto/test/hybrid.contracts.test.mjs`.
- Golden vector contract fixture: `packages/crypto/test/fixtures/hybrid-envelope-golden-v1.json`.

CI rollout:

- quick blocking lane for PR/push:
  - workflow: `.github/workflows/crypto-fuzz-quick.yml`
  - commands: `yarn test:crypto:property`, `yarn test:crypto:contracts`, `yarn fuzz:crypto:quick`
- extended lane for nightly/manual:
  - workflow: `.github/workflows/crypto-fuzz-extended.yml`
  - command: `yarn fuzz:crypto:extended`

Triage process and required crash artifacts are documented in:

- `docs/security/crypto-fuzz-triage.md`
