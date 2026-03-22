# Authentication Flows

This document describes all authentication processes in Okkey.

**Implemented HTTP email challenge API:** [`docs/api_contracts.md`](../api_contracts.md) (Auth section) and OpenAPI [`docs/openapi/core-api.yaml`](../openapi/core-api.yaml).

Architecture goals:

- secure authentication
- zero-knowledge access
- device authorization
- passkey support
- multi-device support

---

## Authentication Methods

Okkey supports several login methods.

Primary:
- Email + Email code
- Passkeys (WebAuthn)

Additional:
- TOTP 2FA
- Security Keys
- Device approval

---

## Identity Model

Each user has:
- User
- UserKeyPair
- Devices
- Sessions

---

## User Keys

When creating an account, the following are generated:
- UserPublicKey
- UserPrivateKey

Private key is stored:
- encrypted with VaultKey

This enables:
- secure vault sharing
- secure invites
- device authorization

---

## Registration Flow

New user registration.
1. user enters email -> email code
2. user creates master password
3. client generates VaultKey
4. split VaultKey → A B C
5. client generates UserKeyPair
6. encrypt UserPrivateKey with VaultKey
7. send server share A to backend
8. store encrypted keys

Server stores:
- user metadata
- server key share
- public key
- encrypted private key

---

## Login Flow (Password)

Login is performed without sending master password to the server.
1. user enters email -> email code
2. user enters master password
3. client derives password share (C) using Argon2
4. client fetches server share (A)
5. client reads device share (B)
6. reconstruct VaultKey
7. decrypt UserPrivateKey
8. start session

Server receives only:
- authentication proof
- session request

### Email Code Challenge (Core v1)

Core login uses explicit challenge endpoints:
- `POST /auth/email/start`
- `POST /auth/email/resend`
- `POST /auth/email/confirm`

Security defaults:
- one-time code: 6 digits
- code TTL: 5 minutes
- resend cooldown: 60 seconds
- max invalid attempts per challenge: 5
- rate limiting on start/resend/confirm

After successful `confirm`, backend returns an intermediate auth state.
Device registration/approval is handled by dedicated device flows.

---

## Passkey Login

Okkey supports WebAuthn passkeys.

Flow:
1. user selects passkey login
2. browser performs WebAuthn challenge
3. authenticator signs challenge
4. server verifies signature
5. session created
6. client unlocks vault

Passkeys are used for:
- passwordless login
- device verification

---

## Device Registration

Each device is registered separately.

Device contains:
- device_id
- device_public_key
- device_name
- created_at

On first login:
- generate device key
- store device share
- register device

---

## New Device Authorization

New device must be confirmed.

Confirmation methods:
- existing device approval
- email verification
- passkey verification

Flow:
```text
login attempt
↓
server detects new device
↓
user must approve device
↓
device share created
↓
device added
```

---

## 2FA Authentication

Okkey supports two-factor authentication.

Methods:
- TOTP
- Security keys

Flow:
```text
login
↓
password verification
↓
2FA challenge
↓
TOTP verification
↓
session issued
```

---

## Session Model

Backend uses session tokens.

Session contains:
```text
session_id
user_id
device_id
created_at
expires_at
```

Sessions are stored in Redis or PostgreSQL

---

## Session Security

Session is protected via:
- httpOnly cookies
- token rotation
- device binding

---

## Logout

Logout is performed via **session revoke**

Server:
- delete session
- invalidate tokens

---

## Recovery Flow

If user lost their device:

Recovery is possible via:
- recovery key
- account recovery flow

RecoveryKey is generated during registration.
- stored offline

---

## Authentication Security Rules

Main rules:

1. master password is never sent to the server
2. all keys are generated on the client
3. device authorization is mandatory
4. new devices require confirmation
5. private keys are always stored encrypted
## Enterprise Authentication Extensions

Enterprise authentication (SAML, OIDC, LDAP, SCIM provisioning) is implemented in the private `okkey-enterprise/` repo.
Core auth flows remain fully functional without enterprise modules.
