# Okkey Core HTTP API contracts

This document is the **canonical human-readable contract** for the Core HTTP API implemented in `services/api`. It must match handler behavior; when behavior changes, update this file, [`docs/openapi/core-api.yaml`](openapi/core-api.yaml), and shared TypeScript DTOs in the same change.

## Machine-readable spec

- **OpenAPI 3.0:** [`docs/openapi/core-api.yaml`](openapi/core-api.yaml) — same endpoints and shapes as here; use for codegen and tooling.

## Shared TypeScript types

Wire-aligned DTOs and the error body type live in `@okkey/types` (e.g. `CoreApiErrorBody`, `EmailAuthStartResponse`, `SyncEventsListResponseDto`). The thin HTTP client is `@okkey/api`; email login helpers are `@okkey/auth`. **Policy:** any contract change updates these packages in the same PR as the backend and this documentation.

## Versioning and compatibility

- **Pre-stable:** paths and payloads may evolve; clients should not assume frozen behavior until an explicit API version prefix (e.g. `/v1/...`) is introduced.
- **Additive changes** (new optional JSON fields, new error codes) are preferred; document them here and in OpenAPI.
- **Breaking changes** (removing fields, changing types, repurposing status codes) require a version bump or a new route namespace and a migration note in this file.
- **Error codes** (`error` string) are part of the contract; clients may branch on them for recovery flows.

## Global conventions

| Topic | Rule |
|--------|------|
| Base URL | Deployment-specific; default local dev is `http://localhost:4000`. |
| Content-Type | Request bodies: `application/json`. Responses: JSON unless noted. |
| Identifiers | UUIDs as lowercase string (8-4-4-4-12), unless otherwise specified. |
| Time | ISO-8601 UTC with millisecond precision where emitted by the server, e.g. `2026-01-01T12:05:00.000Z`. |
| Client IP (rate limits) | First hop in `X-Forwarded-For` when present; otherwise internal logic may treat IP as `unknown`. |
| Authentication (Core v1) | Prefer `Authorization: Bearer <access_token>` from `POST /auth/session/bootstrap` (after email confirm when 2FA is off) or `POST /auth/two-factor/verify` (when 2FA is on). `X-User-Id` remains a **non-production fallback** when enabled by environment (off by default in `production`). |
| Device approval | `POST /devices/:deviceId/approve` and `POST /devices/:deviceId/reject` additionally require `X-Device-Id: <trusted approver device uuid>`. |

## Error model

Failed requests return JSON with:

| Field | Type | Required |
|--------|------|----------|
| `error` | string | Yes — domain error code (see per-route tables). |
| `message` | string | Yes — human-readable description (not for i18n keys). |
| `requestId` | string | Yes — correlates with server logs. |
| `details` | object | No — structured hints (e.g. version conflict metadata). |

Example:

```json
{
  "error": "VERSION_MISMATCH",
  "message": "baseVersion is stale",
  "requestId": "req_01HZZZZ",
  "details": {
    "expectedBaseVersion": 3,
    "latestVersion": 5
  }
}
```

Unrecoverable failures may return `500` with `error: "INTERNAL_SERVER_ERROR"`.

Malformed route parameters (missing `workspaceId` / `vaultId` in path) may return `400` with `error: "BAD_REQUEST"` (vault routes) or the domain-specific `*_BAD_REQUEST` code on other routes.

---

## Auth (email challenge)

Flow: **start** → (optional **resend**) → **confirm** → receive `authStateId` and `nextStep`.

### `POST /auth/email/start`

Starts login: creates a short-lived challenge, sends code to email (provider-dependent).

**Auth:** none.

**Request body:**

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `email` | string | Yes | Trimmed; normalized to lower case server-side. |
| `locale` | string | No | Passed to email template layer when supported. |

**Response `200`:**

| Field | Type | Description |
|--------|------|-------------|
| `challengeId` | string | Opaque id for resend/confirm. |
| `expiresAt` | string | Challenge expiry (ISO-8601 UTC). |
| `resendAvailableAt` | string | Earliest time resend is allowed (ISO-8601 UTC). |

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `AUTH_BAD_REQUEST` | 400 | Invalid JSON or missing `email`. |
| `AUTH_EMAIL_INVALID` | 400 | Email fails validation. |
| `AUTH_RATE_LIMITED` | 429 | Start/resend rate limit exceeded. |

### `POST /auth/email/resend`

Resends the code for an existing challenge.

**Auth:** none.

**Request body:**

| Field | Type | Required |
|--------|------|----------|
| `challengeId` | string | Yes |
| `locale` | string | No |

**Response `200`:** Same shape as start.

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `AUTH_BAD_REQUEST` | 400 | Invalid JSON or missing `challengeId`. |
| `AUTH_RESEND_TOO_EARLY` | 400 | Before `resendAvailableAt`. |
| `AUTH_CODE_EXPIRED` | 400 | Challenge no longer valid. |
| `AUTH_RATE_LIMITED` | 429 | Rate limit. |

### `POST /auth/email/confirm`

Validates the code and returns an auth state handle for the next onboarding step.

**Auth:** none.

**Request body:**

| Field | Type | Required |
|--------|------|----------|
| `challengeId` | string | Yes |
| `code` | string | Yes | Typically 6 digits; server compares hashed value. |

**Response `200`:**

| Field | Type | Description |
|--------|------|-------------|
| `authStateId` | string | Opaque; used by future registration/device flows. |
| `userExists` | boolean | Whether a user row exists for this email. |
| `nextStep` | string | `"registration"` if new user; `"two_factor"` if existing user with 2FA enabled; otherwise `"device_check"`. |

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `AUTH_BAD_REQUEST` | 400 | Invalid JSON or missing `challengeId` / `code`. |
| `AUTH_CODE_INVALID` | 400 | Wrong code (and attempts may decrement). |
| `AUTH_CODE_ATTEMPTS_EXCEEDED` | 400 | Too many failed attempts. |
| `AUTH_CODE_EXPIRED` | 400 | Challenge expired. |
| `AUTH_RATE_LIMITED` | 429 | Confirm rate limit. |

**Idempotency:** confirm is **not** idempotent; repeating with the same code after success may fail.

**Auth state TTL:** For `nextStep: "registration"`, the server stores `authStateId` in Redis longer than for returning users (`REGISTRATION_AUTH_STATE_TTL_SECONDS`, default 3600s) so the client can finish crypto and call register complete. For `nextStep: "two_factor"`, TTL is `AUTH_PENDING_TWO_FACTOR_TTL_SECONDS` (default 600s).

### `POST /auth/session/bootstrap`

Creates a **Bearer session** after a successful email code challenge when **2FA is not** required for this account.

**Auth:** none.

**Request body** (JSON; `auth_state_id` accepted as snake_case alias):

| Field | Type | Required |
|--------|------|----------|
| `authStateId` | string | Yes |

**Response `200` (snake_case):**

| Field | Type |
|--------|------|
| `access_token` | string |
| `expires_at` | string (ISO-8601 UTC) |
| `user_id` | uuid string |
| `token_type` | `"Bearer"` |

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `AUTH_BAD_REQUEST` | 400 | Missing `authStateId`. |
| `TWO_FACTOR_REQUIRED` | 400 | Account has 2FA; use `POST /auth/two-factor/verify` instead. |
| `AUTH_CHALLENGE_INVALID` | 400 | Auth state is not for an existing user session (e.g. registration flow). |
| `AUTH_CHALLENGE_EXPIRED` | 410 | Unknown or expired `authStateId`. |

**Side effects:** Redis auth state for this `authStateId` is deleted on success.

### `POST /auth/two-factor/verify`

Completes login when `nextStep` from email confirm was `"two_factor"`. Accepts **either** a valid **TOTP** code (6 digits, RFC 6238 / SHA-1 / 30s step) **or** a **backup code** (one-time; stored hashed server-side).

**Auth:** none.

**Request body:**

| Field | Type | Required |
|--------|------|----------|
| `authStateId` | string | Yes |
| `code` | string | Yes |

**Response `200`:** Same shape as `POST /auth/session/bootstrap`.

**Errors (non-exhaustive):**

| `error` | HTTP | When |
|---------|------|------|
| `AUTH_BAD_REQUEST` | 400 | Missing fields. |
| `TWO_FACTOR_SETUP_INVALID` | 400 | Auth state does not expect 2FA. |
| `TWO_FACTOR_NOT_ENABLED` | 400 | User has no TOTP row (misconfiguration). |
| `TWO_FACTOR_INVALID_CODE` | 400 | Wrong TOTP. |
| `TWO_FACTOR_BACKUP_INVALID` | 400 | Wrong backup code (non-TOTP-shaped input). |
| `TWO_FACTOR_BACKUP_DEPLETED` | 400 | No unused backup codes left; user must use TOTP (or add new codes after authenticated recovery flow). |
| `TWO_FACTOR_ATTEMPTS_EXCEEDED` | 429 | Too many failures for this `authStateId`. |
| `AUTH_RATE_LIMITED` | 429 | Per-IP verify limit. |
| `AUTH_CHALLENGE_EXPIRED` | 410 | Auth state missing/expired. |

### `GET /auth/two-factor/status`

**Auth:** `Authorization: Bearer` and/or `X-User-Id` (same rules as Vault routes).

**Response `200`:**

| Field | Type |
|--------|------|
| `enabled` | boolean |
| `backupCodesRemaining` | number |

### `POST /auth/two-factor/totp/enroll/start`

Starts TOTP enrollment for an authenticated user. Returns a **base32 secret** and `otpauthUri` for the authenticator app. Pending enrollment lives in Redis until confirm or TTL.

**Auth:** Bearer / `X-User-Id`.

**Response `200`:** `enrollmentId`, `secretBase32`, `otpauthUri`, `periodSeconds` (30), `digits` (6), `algorithm` (`SHA1`).

**Errors:** `TWO_FACTOR_ALREADY_ENABLED`, `AUTH_REQUIRED`.

### `POST /auth/two-factor/totp/enroll/confirm`

**Auth:** Bearer / `X-User-Id`.

**Request body:**

| Field | Type | Required |
|--------|------|----------|
| `enrollmentId` | string | Yes |
| `code` | string | Yes | Valid TOTP from the pending secret |

**Response `200`:** `{ "backupCodes": string[] }` — **plaintext codes shown once**; server stores only SHA-256 hashes (with server pepper).

**Errors:** `TWO_FACTOR_SETUP_INVALID`, `TWO_FACTOR_INVALID_CODE`, `TWO_FACTOR_ALREADY_ENABLED`.

**Policy:** Enabling 2FA is allowed only for an **authenticated** user (Bearer session or dev header). It is **not** tied to the post-registration Redis auth state; new accounts obtain a session through the same bootstrap/2FA flow as returning users once a login path exists from registration.

### `POST /auth/two-factor/backup-codes/regenerate`

**Auth:** Bearer / `X-User-Id`.

**Request body:** `{ "totpCode": "<6-digit>" }` (or `totp_code` snake_case).

**Response `200`:** `{ "backupCodes": string[] }` — previous unused backup codes are invalidated.

### `POST /auth/two-factor/disable`

**Auth:** Bearer / `X-User-Id`.

**Request body:** either `{ "totpCode": "..." }` or `{ "backupCode": "..." }` (snake_case aliases allowed). Using a backup code **consumes** that code.

**Response `200`:** `{ "disabled": true }`

**Errors:** `TWO_FACTOR_NOT_ENABLED`, `TWO_FACTOR_INVALID_CODE`, `TWO_FACTOR_BACKUP_INVALID`, `TWO_FACTOR_SETUP_INVALID`.

### TOTP secret storage (server)

The server stores the TOTP shared secret **only as AES-256-GCM ciphertext** (key derived from `SESSION_SECRET`). It is **never** logged or returned after enrollment confirm.

### Session row after bootstrap / 2FA verify

On successful `POST /auth/session/bootstrap` or `POST /auth/two-factor/verify`, Core inserts a row into `sessions` with:

| Column | Value (Core v1) |
|--------|------------------|
| `user_id` | Authenticated user. |
| `token_hash` | SHA-256 (hex) of the opaque `access_token`; the raw token appears **only** in the JSON response. |
| `expires_at` | Now + `SESSION_TTL_SECONDS`. |
| `device_id` | **`NULL` at issuance.** Device binding for vault crypto (`4.7`) is handled by `POST /devices/register` and related flows using the authenticated user; linking `sessions.device_id` after device registration may be added later without changing the login/2FA contract. |

Token rotation / refresh is **not** implemented in Core v1; clients treat the access token as a long-lived session handle until expiry or explicit logout (when implemented).

### `POST /auth/register/complete`

Completes **new user** onboarding after email confirm. Accepts only server-side split-key material **A**, encrypted user private key, KDF metadata, and the first device (share **B** + metadata). The master password, password share **C**, and raw `VaultKey` **never** appear on the wire.

**Split-key model (Core v1):** 32-byte XOR: `VaultKey = A ⊕ B ⊕ C` with `C = Argon2id(master_password, salt, params_v1)` (32-byte output). Client proves knowledge of the password only by producing consistent ciphertext; the server stores `A`, salt, and `password_kdf_params_version`.

**Auth:** none (authorization is the valid `auth_state_id` for a not-yet-registered email).

**Request body** (snake_case; binary fields standard base64):

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `auth_state_id` | string | Yes | From `POST /auth/email/confirm`. |
| `user_public_key` | string | Yes | Base64 of **32** raw Ed25519 public key bytes. |
| `user_public_pq_key` | string | Yes | Base64 of **1184** raw ML-KEM-768 encapsulation key bytes. |
| `encrypted_private_key` | object (`EncryptedBlob`) | Yes | Versioned encrypted envelope. Required keys: `crypto_version`, `algorithm`, `payload`, `meta`. Min decoded payload length **2473** bytes (XChaCha20-Poly1305 over hybrid identity bundle). |
| `server_key_share` | string | Yes | Base64 of **32** bytes (share **A**). |
| `password_kdf_salt` | string | Yes | Base64 of **16** bytes (Argon2id salt). |
| `password_kdf_params_version` | integer | Yes | Profile version. Core currently validates `1` and `2`; environment policy may restrict writes to `2` only. |
| `device_public_key` | string | Yes | Same rules as `POST /devices/register`. |
| `device_share` | string | Yes | Base64 of **32** bytes (share **B**). |
| `device_fingerprint` | string | Yes | Hex 32–128 chars. |
| `device_name` | string | Yes | |
| `personal_workspace_name` | string | No | Optional label for the default workspace and personal vault (max 128 chars after trim, no ASCII control characters). When omitted, the server uses **`Personal`**. |
| `platform`, `os_name`, `os_version`, `app_version`, `client_type`, `user_agent` | string | No | Default `unknown`; `user_agent` falls back to HTTP `User-Agent`. |
| `metadata` | object | No | Same optional fields as device register (override top-level per field). Includes optional `crypto_capable: boolean` capability hint used by rollout policy in strict mode. |

**Response `201`:**

| Field | Type |
|--------|------|
| `user_id` | uuid string |
| `workspace_id` | uuid string |
| `vault_id` | uuid string |
| `device_id` | uuid string |
| `device_status` | `"trusted"` |

Side effects (single DB transaction): insert user (with KDF columns), default workspace (name from `personal_workspace_name` or **`Personal`**), personal vault with the **same** name, first device with status **trusted**.

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `REGISTRATION_BAD_REQUEST` | 400 | Invalid JSON, missing field, bad base64. |
| `CRYPTO_PAYLOAD_INVALID` | 400 | Wrong lengths, unsupported KDF version, bad keys. |
| `CRYPTO_PROFILE_NOT_ALLOWED` | 400 | Requested crypto profile is forbidden by environment policy. |
| `CRYPTO_CAPABILITY_REQUIRED` | 400 | Strict rollout mode requires PQ-capable user/device capabilities for this write path. |
| `AUTH_CHALLENGE_EXPIRED` | 410 | Missing/expired `auth_state_id`. |
| `AUTH_CHALLENGE_INVALID` | 400 | Auth state not eligible (e.g. `userId` already set). |
| `REGISTRATION_ALREADY_COMPLETED` | 409 | User row already exists for email. |
| `REGISTRATION_CONFLICT` | 409 | Unique constraint (race / duplicate). |

**Idempotency:** Repeating the same `auth_state_id` after success returns **`201`** with the **same** JSON body while Redis still holds `registration:result:{authStateId}` (`REGISTRATION_RESULT_TTL_SECONDS`, default 7 days). Auth state is deleted after the first success.

**Client helper:** `@okkey/crypto` exports `buildRegistrationCryptoArtifacts` and `registrationArtifactsToWire` (WASM-only primitives).

---

## Vault metadata

Returns **non-secret** vault rows. No ciphertext.

### `GET /workspaces`

Lists workspaces the authenticated user may access (owner or `workspace_members` row).

**Auth:** Prefer `Authorization: Bearer <access_token>`. Optional `X-User-Id` only when enabled by environment for non-production / dev.

**Response `200`:** JSON array of workspace objects:

| Field | Type | Notes |
|--------|------|--------|
| `id` | string | UUID |
| `name` | string | |
| `ownerId` | string | UUID |
| `planTier` | string | e.g. `FREE` |
| `createdAt` | string | ISO-8601 UTC |
| `updatedAt` | string | ISO-8601 UTC |

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `AUTH_REQUIRED` | 401 | No valid Bearer session and no allowed dev header. |

### `GET /workspaces/:workspaceId/vaults`

Lists vaults in a workspace the user may access.

**Auth:** Prefer `Authorization: Bearer <access_token>`. Optional `X-User-Id` only when enabled by environment for non-production / dev (see global conventions table).

**Response `200`:** JSON array of vault objects:

| Field | Type | Notes |
|--------|------|--------|
| `id` | string | UUID |
| `workspaceId` | string | UUID |
| `name` | string | |
| `isPersonal` | boolean | |
| `ownerId` | string \| null | UUID or null |
| `cryptoVersion` | integer | Vault crypto profile **floor** (1–65535). New vaults are created at **v2** only. The server never decreases this value; sync append and vault sharing must use ciphertext with `crypto_version` ≥ this floor. |
| `createdAt` | string | ISO-8601 UTC |
| `updatedAt` | string | ISO-8601 UTC |

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `BAD_REQUEST` | 400 | Missing `workspaceId` in path. |
| `AUTH_REQUIRED` | 401 | No valid Bearer session and no allowed dev header. |
| `WORKSPACE_NOT_FOUND` | 404 | Unknown workspace id. |
| `ACCESS_DENIED` | 403 | User not a member of the workspace. |

### `GET /vaults/:vaultId`

Returns a single vault if the user can read it.

**Auth:** Same as workspace vault list — Bearer preferred; optional `X-User-Id` when allowed by config.

**Response `200`:** Single vault object (same fields as list item).

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `BAD_REQUEST` | 400 | Missing `vaultId` in path. |
| `AUTH_REQUIRED` | 401 | No valid Bearer session and no allowed dev header. |
| `VAULT_NOT_FOUND` | 404 | Unknown vault. |
| `ACCESS_DENIED` | 403 | User cannot read this vault. |

---

## Vault sharing and keys

Core v1 sharing model: each recipient gets their own `EncryptedVaultKey_for_user` (client-side wrapped with recipient public key). Server stores only ciphertext wraps and membership metadata.

### `GET /vaults/:vaultId/key`

Returns current user wrapped vault key for an accessible vault.

**Auth:** Bearer preferred; optional `X-User-Id` when allowed by config.

**Response `200`:** `{ "encryptedVaultKey": EncryptedBlob }`

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `BAD_REQUEST` | 400 | Missing `vaultId` path param. |
| `AUTH_REQUIRED` | 401 | No valid auth context. |
| `VAULT_NOT_FOUND` | 404 | Unknown vault. |
| `ACCESS_DENIED` | 403 | User cannot read vault. |
| `VAULT_KEY_NOT_FOUND` | 404 | No wrapped key row for this user. |

### `GET /vaults/:vaultId/shares`

Lists explicit `vault_members` with their public keys and (when present) wrapped keys. Intended for vault owner/admin share management.

**Auth:** Bearer preferred; optional `X-User-Id` when allowed by config.

**Response `200`:**

```json
{
  "vaultId": "uuid",
  "members": [
    {
      "userId": "uuid",
      "email": "user@example.com",
      "publicKey": "base64",
      "publicPqKey": "base64-or-null",
      "role": "member",
      "encryptedVaultKey": "EncryptedBlob-or-null"
    }
  ]
}
```

**Errors:** `BAD_REQUEST`, `AUTH_REQUIRED`, `VAULT_NOT_FOUND`, `ACCESS_DENIED`, `VAULT_SHARE_FORBIDDEN`.

### `POST /vaults/:vaultId/shares`

Grants or updates explicit shared access for a workspace member, stores recipient wrapped key, and appends sync event `VAULT_SHARE`.

**Auth:** Bearer preferred; optional `X-User-Id` when allowed by config.

**Request body:**

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `recipientUserId` | uuid | Yes | Must already have workspace access. |
| `encryptedVaultKey` | object (`EncryptedBlob`) | Yes | Wrapped key for recipient in canonical envelope. In production hybrid-by-default path: `crypto_version >= 2` and `meta.key_wrap_scheme = \"hybrid_ecc_pq_v1\"`. |
| `encryptedPayload` | object (`EncryptedBlob`) | Yes | Opaque sync ciphertext for `VAULT_SHARE`. |
| `signature` | object (`HybridSignatureEnvelope`) | Yes | Hybrid integrity signature (`context = vault.share`). |
| `baseVersion` | integer | Yes | Expected event-log head version. |
| `idempotencyKey` | uuid | No | Optional event dedup key. |
| `clientCreatedAt` | string | No | Optional ISO-8601 client timestamp. |
| `role` | string | No | Membership role; default `member`. |

**Response `201`:** `{ "shared": true }`

### `POST /vaults/:vaultId/shares/revoke`

Revokes explicit member access, applies key rotation wraps for all remaining active recipients, and appends sync event `VAULT_KEY_ROTATION`.

**Auth:** Bearer preferred; optional `X-User-Id` when allowed by config.

**Request body:**

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `recipientUserId` | uuid | Yes | Member to revoke. |
| `rotatedVaultKeys` | array | Yes | Non-empty full recipient set after revoke (`{ userId, encryptedVaultKey: EncryptedBlob }[]`), each wrap follows the same hybrid-by-default contract in production. |
| `encryptedPayload` | object (`EncryptedBlob`) | Yes | Opaque sync ciphertext for `VAULT_KEY_ROTATION`. |
| `signature` | object (`HybridSignatureEnvelope`) | Yes | Hybrid integrity signature (`context = vault.revoke`). |
| `baseVersion` | integer | Yes | Expected event-log head version. |
| `idempotencyKey` | uuid | No | Optional event dedup key. |
| `clientCreatedAt` | string | No | Optional ISO-8601 client timestamp. |

**Response `200`:** `{ "revoked": true }`

Idempotency behavior:
- same `idempotencyKey` + equivalent rotation payload => deterministic no-op,
- same `idempotencyKey` + different payload => `IDEMPOTENCY_KEY_CONFLICT` (`409`).

**Errors (share/revoke family):** `VAULT_SHARE_BAD_REQUEST`, `VAULT_SHARE_FORBIDDEN`, `VAULT_SHARE_INVALID_RECIPIENT`, `VAULT_SHARE_RECIPIENT_PQ_REQUIRED`, `VAULT_KEY_WRAP_INVALID`, `MEMBERSHIP_CONFLICT`, `VERSION_MISMATCH`, `IDEMPOTENCY_KEY_CONFLICT`, `CRYPTO_PROFILE_NOT_ALLOWED`, `CRYPTO_DOWNGRADE_NOT_ALLOWED`, `CRYPTO_CAPABILITY_REQUIRED`, `ACCESS_DENIED`, `VAULT_NOT_FOUND`, `AUTH_REQUIRED`.

**`CRYPTO_DOWNGRADE_NOT_ALLOWED` (sharing / rotation):** Same HTTP body shape as for Sync append (see **Sync** → `POST /vaults/:vaultId/events` in the errors table below). The server rejects requests where any `EncryptedBlob` in the body has `crypto_version` **below the vault row floor** (`vault.crypto_version` in Postgres) or **below the current maximum** `payload_schema_version` already stored for that vault’s event stream.

### `POST /vaults/:vaultId/key/rotate`

Standalone key rotation trigger (security incident or manual rotation). The client generates new vault key material, re-wraps it for **all current active recipients** (workspace owner + vault owner + all `vault_members`), and submits all wraps atomically. Appends `VAULT_KEY_ROTATION` event. No membership changes.

**Auth:** Bearer preferred; optional `X-User-Id` when allowed by config.

**Request body:**

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `rotatedVaultKeys` | array | Yes | Non-empty; **must cover every active recipient** (`{ userId, encryptedVaultKey: EncryptedBlob }[]`). Each wrap must follow the hybrid-by-default contract in production (`crypto_version >= 2`, `meta.key_wrap_scheme = "hybrid_ecc_pq_v1"`, `meta.recipient_user_id` matches). |
| `encryptedPayload` | object (`EncryptedBlob`) | Yes | Opaque sync ciphertext for `VAULT_KEY_ROTATION` event. |
| `signature` | object (`HybridSignatureEnvelope`) | Yes | Hybrid integrity signature (`context = vault.rotate`). |
| `baseVersion` | integer | Yes | Expected event-log head version. |
| `idempotencyKey` | uuid | No | Optional event dedup key. |
| `clientCreatedAt` | string | No | Optional ISO-8601 client timestamp. |
| `reason` | string | No | `"security_incident"` or `"manual"`. Informational only. |

**Response `200`:** `{ "rotated": true }`

Idempotency behavior:
- same `idempotencyKey` + equivalent rotation payload => deterministic no-op,
- same `idempotencyKey` + different payload => `IDEMPOTENCY_KEY_CONFLICT` (`409`).

**Errors:** `VAULT_SHARE_BAD_REQUEST`, `VAULT_KEY_WRAP_INVALID` (missing or unknown recipient, hybrid policy violation), `VERSION_MISMATCH` (concurrent rotation), `IDEMPOTENCY_KEY_CONFLICT`, `CRYPTO_DOWNGRADE_NOT_ALLOWED`, `CRYPTO_CAPABILITY_REQUIRED`, `VAULT_SHARE_FORBIDDEN`, `ACCESS_DENIED`, `VAULT_NOT_FOUND`, `AUTH_REQUIRED`.

### `PATCH /vaults/:vaultId/shares/:userId`

Updates a vault member's role and **atomically rotates the vault key**. Every role change requires the client to supply fresh re-wraps for all active recipients to prevent stale key access. Appends `VAULT_KEY_ROTATION` event alongside the role update in the same DB transaction.

**Auth:** Bearer preferred; optional `X-User-Id` when allowed by config.

**Path params:** `:userId` — the member whose role is being changed.

**Request body:**

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `newRole` | string | Yes | New role string (e.g. `"admin"`, `"member"`). |
| `rotatedVaultKeys` | array | Yes | Non-empty; **must cover every active recipient** (`{ userId, encryptedVaultKey: EncryptedBlob }[]`). Same hybrid contract as `POST /key/rotate`. |
| `encryptedPayload` | object (`EncryptedBlob`) | Yes | Opaque sync ciphertext for `VAULT_KEY_ROTATION` event. |
| `signature` | object (`HybridSignatureEnvelope`) | Yes | Hybrid integrity signature (`context = vault.member_role_update`). |
| `baseVersion` | integer | Yes | Expected event-log head version. |
| `idempotencyKey` | uuid | No | Optional event dedup key. |
| `clientCreatedAt` | string | No | Optional ISO-8601 client timestamp. |

**Response `200`:** `{ "updated": true }`

Idempotency behavior:
- same `idempotencyKey` + equivalent rotation payload => deterministic no-op,
- same `idempotencyKey` + different payload => `IDEMPOTENCY_KEY_CONFLICT` (`409`).

**Errors:** `VAULT_SHARE_BAD_REQUEST`, `VAULT_SHARE_FORBIDDEN`, `VAULT_SHARE_INVALID_RECIPIENT`, `VAULT_KEY_WRAP_INVALID`, `MEMBERSHIP_CONFLICT` (member not found in vault), `VERSION_MISMATCH`, `IDEMPOTENCY_KEY_CONFLICT`, `CRYPTO_DOWNGRADE_NOT_ALLOWED`, `CRYPTO_CAPABILITY_REQUIRED`, `ACCESS_DENIED`, `VAULT_NOT_FOUND`, `AUTH_REQUIRED`.

---

## Sync (event log)

Per-vault encrypted event stream. Server stores encrypted payloads in canonical envelope form.

`EncryptedBlob` shape (wire/storage):

```json
{
  "crypto_version": 2,
  "algorithm": "opaque",
  "payload": "base64",
  "meta": {}
}
```

`HybridSignatureEnvelope` shape:

```json
{
  "version": 1,
  "algorithm": "hybrid_ed25519_pq_bind_v1",
  "key_id": "user-signing-key-id",
  "context": "sync.append",
  "signer_pq_public_key": "base64",
  "payload_hash": "base64",
  "signature": "base64",
  "created_at": "2026-01-01T12:00:00.000Z"
}
```

Allowed `eventType` values (must match exactly):

`ITEM_CREATE`, `ITEM_UPDATE`, `ITEM_DELETE`, `VAULT_CREATE`, `VAULT_SHARE`, `VAULT_KEY_ROTATION`, `DEVICE_ADD`, `DEVICE_REMOVE`

### `GET /vaults/:vaultId/events?afterVersion=<n>`

**Auth:** Bearer preferred; optional `X-User-Id` when allowed by config.

**Query:**

| Param | Type | Default | Notes |
|--------|------|---------|--------|
| `afterVersion` | integer | `0` | Non-negative; return events with `version > afterVersion`. |

**Response `200`:**

```json
{
  "vaultId": "uuid",
  "afterVersion": 0,
  "events": [
    {
      "id": "uuid",
      "vaultId": "uuid",
      "actorId": "uuid-or-null",
      "eventType": "ITEM_CREATE",
      "encryptedBlob": {
        "crypto_version": 2,
        "algorithm": "opaque",
        "payload": "base64",
        "meta": {}
      },
      "idempotencyKey": "uuid-or-null",
      "clientCreatedAt": "2026-01-01T11:59:00.000Z",
      "version": 1,
      "createdAt": "2026-01-01T12:00:00.000Z"
    }
  ]
}
```

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `SYNC_BAD_REQUEST` | 400 | Missing `vaultId`, invalid `afterVersion`, or invalid JSON on POST sibling. |
| `AUTH_REQUIRED` | 401 | No valid Bearer session and no allowed dev header. |
| `VAULT_NOT_FOUND` | 404 | Unknown vault. |
| `ACCESS_DENIED` | 403 | User cannot read vault. |

### `POST /vaults/:vaultId/events`

Appends one event if `baseVersion` matches current stream head.

**Auth:** Bearer preferred; optional `X-User-Id` when allowed by config.

**Request body:**

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `eventType` | string | Yes | One of allowed types. |
| `encryptedBlob` | object (`EncryptedBlob`) | Yes | Canonical encrypted envelope; `payload` decoded length must be &gt; 0 and ≤ 512 KiB. |
| `signature` | object (`HybridSignatureEnvelope`) | Conditional | Required for critical event types `VAULT_SHARE` and `VAULT_KEY_ROTATION`; optional for other event types. Context must be `sync.append`. |
| `baseVersion` | integer | Yes | Non-negative; must equal current latest version for append. |
| `idempotencyKey` | string (UUID) | **Required** for `ITEM_CREATE`; optional otherwise | Dedup per vault; same key returns the stored event without a new version. |
| `clientCreatedAt` | string | No | ISO-8601 client timestamp (optional). |

**Response `201`:** Single event object (same shape as an element of `events` in the GET response).

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `SYNC_BAD_REQUEST` | 400 | Invalid JSON; missing fields; invalid `baseVersion` type/range; `ITEM_CREATE` without `idempotencyKey`; invalid UUID for `idempotencyKey`; invalid `clientCreatedAt`. |
| `SYNC_INVALID_EVENT_TYPE` | 400 | Unknown `eventType`. |
| `SYNC_INVALID_PAYLOAD` | 400 | Not valid base64 or empty payload. |
| `CRYPTO_PROFILE_NOT_ALLOWED` | 400 | Requested crypto profile is forbidden by environment policy. `details` may include `reason: "policy"`, `requestedVersion`, `allowedVersions`. |
| `CRYPTO_DOWNGRADE_NOT_ALLOWED` | 400 | Anti-downgrade: the new ciphertext’s `crypto_version` is **below** the vault’s persisted **floor** (`vault.crypto_version`; new vaults use **v2**, value never decreases) **or** **below** `MAX(payload_schema_version)` over events already stored for this vault (monotonic stream). The server returns whichever check fails first; `details` may include `reason: "downgrade"`, `vaultId`, `establishedMaxVersion`, `requestedVersion`. |
| `CRYPTO_CAPABILITY_REQUIRED` | 400 | Strict rollout mode blocks writes for subjects without required PQ capabilities. `details` may include `reason: "capability"`, `rolloutMode`, `operation`, `missingCapabilities`. |
| `SIGNATURE_REQUIRED` | 400 | Signature is required by active rollout policy for this operation. |
| `SIGNATURE_INVALID` | 400 | Signature envelope malformed, signer binding mismatch, or cryptographic verify failed. |
| `PAYLOAD_TOO_LARGE` | 413 | Decoded ciphertext exceeds 512 KiB. |
| `VERSION_MISMATCH` | 409 | `baseVersion` stale; `details` may include `expectedBaseVersion` and `latestVersion`. |
| `AUTH_REQUIRED` | 401 | No valid Bearer session and no allowed dev header. |
| `VAULT_NOT_FOUND` | 404 | Unknown vault. |
| `ACCESS_DENIED` | 403 | User cannot read vault. |

**Idempotency:** If `idempotencyKey` is set and an event with the same `(vaultId, idempotencyKey)` exists, the server returns that event (`201`) without appending again — use for `ITEM_CREATE` retries.

### `GET /workspaces/:workspaceId/personal-events?afterVersion=<n>`

**Auth:** Bearer required.

Per-user workspace personal metadata stream (folders, item→folder assignments). Same envelope shape as vault events except `workspaceId` instead of `vaultId`.

**Response `200`:**

```json
{
  "workspaceId": "uuid",
  "userId": "uuid",
  "afterVersion": 0,
  "events": [
    {
      "id": "uuid",
      "workspaceId": "uuid",
      "actorId": "uuid",
      "eventType": "FOLDER_CREATE",
      "encryptedBlob": {
        "crypto_version": 2,
        "algorithm": "opaque",
        "payload": "base64",
        "meta": {}
      },
      "idempotencyKey": "uuid-or-null",
      "clientCreatedAt": null,
      "version": 1,
      "createdAt": "2026-01-01T12:00:00.000Z"
    }
  ]
}
```

Allowed `eventType` values: `FOLDER_CREATE`, `FOLDER_UPDATE`, `FOLDER_DELETE`, `ITEM_FOLDER_ASSIGN`.

**Errors:** `SYNC_BAD_REQUEST`, `AUTH_REQUIRED`, `WORKSPACE_NOT_FOUND`, `ACCESS_DENIED`.

### `POST /workspaces/:workspaceId/personal-events`

Appends one personal metadata event if `baseVersion` matches the current stream head for `(workspaceId, userId)`.

**Request body:** Same fields as vault append (`eventType`, `encryptedBlob`, `baseVersion`, optional `idempotencyKey`, optional `clientCreatedAt`). `idempotencyKey` is **required** for `FOLDER_CREATE`.

**Response `201`:** Single event object.

**Errors:** Same family as vault append (`VERSION_MISMATCH`, `SYNC_INVALID_EVENT_TYPE`, `PAYLOAD_TOO_LARGE`, etc.) plus `WORKSPACE_NOT_FOUND`, `ACCESS_DENIED`.

---

## Capsules (secure share links)

Capsules store encrypted payloads only; decryption happens client-side.

### `POST /workspaces/:workspaceId/capsules`

Creates a capsule for authenticated creator. FREE plan is gated.

**Auth:** Bearer preferred; optional `X-User-Id` when allowed by config.

**Request body:**

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `type` | string | Yes | `item` \| `field` \| `file` |
| `encryptedPayload` | object (`EncryptedBlob`) | Yes | Canonical encrypted blob envelope |
| `filePayload` | object (`EncryptedBlob`) | No | Encrypted file blob envelope (for `type=file`) stored in object storage |
| `keyTransportMode` | string | No | Key delivery transport policy: `fragment` \| `out_of_band`; default `out_of_band` |
| `expiresAt` | string | No | ISO-8601 future timestamp |
| `maxViews` | integer | No | 1..10000 |
| `password` | string | No | Optional open password (server stores KDF hash only) |
| `allowedRecipientEmails` | string[] | No | Optional recipient allowlist (stored as hashed values) |

**Response `201`:** capsule metadata:

`capsuleId`, `type`, `expiresAt`, `maxViews`, `viewCount`, `passwordRequired`, `createdAt`

**Errors (non-exhaustive):** `AUTH_REQUIRED`, `WORKSPACE_NOT_FOUND`, `ACCESS_DENIED`, `FEATURE_NOT_AVAILABLE`, `CAPSULE_BAD_REQUEST`, `CRYPTO_PROFILE_NOT_ALLOWED`, `CRYPTO_CAPABILITY_REQUIRED`, `CAPSULE_UNSAFE_KEY_TRANSPORT`, `PAYLOAD_TOO_LARGE`.

### `GET /capsules/:capsuleId`

Returns public metadata for active capsule.

**Auth:** none.

`capsuleId` must be UUID. Unsafe key placement in URL query/path is rejected.

**Response `200`:** same metadata shape as create response.

**Errors:** `CAPSULE_NOT_FOUND`, `CAPSULE_EXPIRED`, `CAPSULE_VIEW_LIMIT_EXCEEDED`, `CAPSULE_REVOKED`.

### `POST /capsules/:capsuleId/open`

Consumes/open capsule by link with optional password.

**Auth:** none.

**Request body:** optional `{ "password": "...", "recipientEmail": "user@example.com", "keyTransportMode": "fragment|out_of_band" }`

Unsafe key placement in URL query/path is rejected (`CAPSULE_UNSAFE_KEY_TRANSPORT`). Use fragment or out-of-band key delivery only.

**Response `200`:** metadata + `encryptedPayload` (`EncryptedBlob`), and optional `filePayload` (`EncryptedBlob`) for file capsules.

**Errors:** `RATE_LIMITED`, `CAPSULE_UNSAFE_KEY_TRANSPORT`, `CAPSULE_NOT_FOUND`, `CAPSULE_EXPIRED`, `CAPSULE_VIEW_LIMIT_EXCEEDED`, `CAPSULE_REVOKED`, `CAPSULE_PASSWORD_REQUIRED`, `CAPSULE_PASSWORD_INVALID`, `CAPSULE_RECIPIENT_REQUIRED`, `CAPSULE_RECIPIENT_FORBIDDEN`.

### `POST /capsules/:capsuleId/revoke`

Revokes capsule by creator.

**Auth:** Bearer preferred; optional `X-User-Id` when allowed by config.

`capsuleId` must be UUID. Unsafe key placement in URL query/path is rejected.

**Response `200`:** `{ "revoked": true }`

**Errors:** `AUTH_REQUIRED`, `CAPSULE_NOT_FOUND`.

---

## Devices

JSON field names use **snake_case** on the wire for device registration (matches implemented handlers).

### `POST /devices/register`

Registers or updates a device for the authenticated user. May return `pending_approval` when the user already has trusted devices.

**Auth:** Bearer preferred; optional `X-User-Id` when allowed by config.

**Request body:**

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `device_public_key` | string | Yes | Non-empty standard base64 after decode. |
| `device_share` | string | Yes | Non-empty base64 device share blob. |
| `device_fingerprint` | string | Yes | Hex, length 32–128 (case-insensitive), trimmed. |
| `device_name` | string | Yes | Display name. |
| `platform` | string | No | Default `unknown` if omitted and no `metadata`. |
| `os_name` | string | No | Same |
| `os_version` | string | No | Same |
| `app_version` | string | No | Same |
| `client_type` | string | No | Same |
| `user_agent` | string | No | Falls back to HTTP `User-Agent` or `unknown`. |
| `metadata` | object | No | Optional nested object with the same optional string fields; overrides top-level when both present (per-field). |

**Response `200`:**

| Field | Type | Values |
|--------|------|--------|
| `device_id` | string | UUID |
| `status` | string | `trusted` \| `pending_approval` |

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `DEVICE_BAD_REQUEST` | 400 | Invalid JSON; missing required fields; invalid `device_share`. |
| `DEVICE_INVALID_FINGERPRINT` | 400 | Fingerprint format invalid. |
| `DEVICE_INVALID_PUBLIC_KEY` | 400 | Public key not valid base64. |
| `DEVICE_DUPLICATE_CONFLICT` | 409 | Unique constraint / duplicate registration conflict. |
| `AUTH_REQUIRED` | 401 | No valid Bearer session and no allowed dev header. |

### `POST /devices/:deviceId/approve`

**Auth:** `Authorization: Bearer` (or allowed `X-User-Id`) **and** `X-Device-Id` (approver must be a trusted device for this user).

**Response `200`:** `{ "device_id": "uuid", "status": "trusted" }`

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `DEVICE_BAD_REQUEST` | 400 | Missing `deviceId` in path. |
| `DEVICE_APPROVAL_ACCESS_DENIED` | 403 | Approver missing or not allowed. |
| `DEVICE_APPROVAL_NOT_FOUND` | 404 | No pending approval for this device. |
| `DEVICE_APPROVAL_EXPIRED` | 410 | Approval window elapsed (`DEVICE_APPROVAL_TTL_SECONDS`, default 600). |
| `DEVICE_APPROVAL_ALREADY_RESOLVED` | 409 | Already approved or rejected. |
| `AUTH_REQUIRED` | 401 | No valid Bearer session and no allowed dev header. |

### `POST /devices/:deviceId/reject`

**Auth:** Bearer (or allowed `X-User-Id`) **and** `X-Device-Id`.

**Request body:** optional `{ "reason": "string" }` (invalid JSON → `DEVICE_BAD_REQUEST`).

**Response `200`:** `{ "device_id": "uuid", "status": "revoked" }`

**Errors:** Same family as approve.

---

## Not yet exposed over HTTP (Core)

The following are **not** implemented as public routes in the current `services/api` router; they may appear in SDK/domain types for future use:

- `GET /me`
- `GET /vaults/:vaultId/items`

Document them when routes are added.

---

## Related tasks

- **4.4** — email challenge model (this doc).
- **4.7** — device registration + metadata (snake_case wire fields).
- **4.10** — approve / reject and approval errors.
- **4.9** — registration split-key: `POST /auth/register/complete` (this document).
- **4.11** — TOTP + backup codes, session bootstrap, Bearer auth for Vault/Sync/Device (this document).

---

## Operational configuration (reference)

Auth and device flows depend on env-tunable limits (see `services/api/.env.example`), including:

- `AUTH_CODE_TTL_SECONDS`, `AUTH_RESEND_COOLDOWN_SECONDS`, `AUTH_CODE_MAX_ATTEMPTS`
- Rate limit windows / thresholds for start, confirm, resend
- `DEVICE_APPROVAL_TTL_SECONDS`

These affect **when** errors such as `AUTH_CODE_EXPIRED` or `DEVICE_APPROVAL_EXPIRED` occur, not the error wire shape.
