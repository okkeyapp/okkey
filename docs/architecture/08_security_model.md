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
