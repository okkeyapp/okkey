# Security Model

Okkey is designed as a **zero-knowledge password manager**.

This means:

server cannot read user data.

---

## Core Security Principles
- Zero Knowledge
- End-to-End Encryption
- Split Key Architecture
- Device Authorization
- Key Rotation
- Crypto Agility (versioned cryptography)
- Downgrade Resistance (no silent fallback to weaker profiles)

### Downgrade threats (policy decision)

| Scenario | Server behavior |
|----------|-----------------|
| New event uses a **lower** `crypto_version` / `payload_schema_version` than the **maximum already stored** for that vault’s event stream | **Reject** (`CRYPTO_DOWNGRADE_NOT_ALLOWED`); the stream floor only moves forward. |
| New write uses a profile **not** in `CRYPTO_ALLOWED_PROFILE_VERSIONS` for the deployment | **Reject** (`CRYPTO_PROFILE_NOT_ALLOWED`). |
| `EncryptedBlob` is malformed (missing fields, wrong `algorithm` for allowlist, strip attack on envelope) | **Reject** on parse (`SYNC_BAD_REQUEST` / `CRYPTO_PAYLOAD_INVALID` / similar). |
| First event in an **empty** vault stream | No stream floor yet; only **environment** policy applies. |

Clients should call `assertCryptoVersionNotBelowFloor` (from `@okkey/types`) before enqueueing sync writes when the vault’s established max version is known from replay.

---

## Zero Knowledge

Server stores only:
- encrypted vault data
- encrypted keys
- metadata

Server never has:
- master password
- vault keys
- plaintext secrets

---

## End-to-End Encryption

All secret data:
```text
encrypt → client
decrypt → client
```

---

## Split Key Security

VaultKey is split into:
- server share
- device share
- password share

This prevents single factor compromise.

---

## Device Authorization

New device requires confirmation.

Methods:
- email verification
- existing device approval
- passkey

---

## Second factor (Core open-source)

Core enforces optional **TOTP** (RFC 6238) plus **one-time backup codes** after the email challenge when the user has enabled 2FA. The server stores TOTP material encrypted at rest and backup codes as one-way hashes only; it never sees vault plaintext. **WebAuthn / security keys as a second factor** are out of scope for Core and belong in enterprise extensions.

---

## Key Rotation

When access changes: **rotate vault keys**

This prevents use of old keys.

---

## Server Breach Scenario

If server is compromised:

Attacker gets only:
- encrypted vault data
- encrypted keys

Without:
- device share
- password share

vault remains protected.

---

# Client Security

Clients use:
- secure storage
- sandbox environments
- memory protections

---

# Cryptographic Guarantees

Okkey ensures:
- confidentiality
- integrity
- authentication
- forward secrecy

---

## Q-Day Security Posture

For post-quantum readiness, Core introduces:

- explicit `crypto_version` on encrypted payloads and wrapped keys;
- hybrid ECC+PQ key sharing as production baseline (`v2`);
- no silent fallback to weaker crypto profiles in production;
- no legacy client-data obligations in first production release;
- mandatory rotation and anti-downgrade controls that prevent stale weak wraps;
- security tests for downgrade attacks, missing PQ material, and hybrid parser robustness.
