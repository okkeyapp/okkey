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
| `encrypted_private_key` | string | Yes | Base64 opaque blob (e.g. nonce \|\| XChaCha20-Poly1305 ciphertext). Min decoded length **41**. |
| `server_key_share` | string | Yes | Base64 of **32** bytes (share **A**). |
| `password_kdf_salt` | string | Yes | Base64 of **16** bytes (Argon2id salt). |
| `password_kdf_params_version` | integer | Yes | **1** only (`m=19456`, `t=2`, `p=1`). |
| `device_public_key` | string | Yes | Same rules as `POST /devices/register`. |
| `device_share` | string | Yes | Base64 of **32** bytes (share **B**). |
| `device_fingerprint` | string | Yes | Hex 32–128 chars. |
| `device_name` | string | Yes | |
| `platform`, `os_name`, `os_version`, `app_version`, `client_type`, `user_agent` | string | No | Default `unknown`; `user_agent` falls back to HTTP `User-Agent`. |
| `metadata` | object | No | Same optional fields as device register (override top-level per field). |

**Response `201`:**

| Field | Type |
|--------|------|
| `user_id` | uuid string |
| `workspace_id` | uuid string |
| `vault_id` | uuid string |
| `device_id` | uuid string |
| `device_status` | `"trusted"` |

Side effects (single DB transaction): insert user (with KDF columns), default workspace `"Personal"`, personal vault `"Personal"`, first device with status **trusted**.

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `REGISTRATION_BAD_REQUEST` | 400 | Invalid JSON, missing field, bad base64. |
| `CRYPTO_PAYLOAD_INVALID` | 400 | Wrong lengths, unsupported KDF version, bad keys. |
| `AUTH_CHALLENGE_EXPIRED` | 410 | Missing/expired `auth_state_id`. |
| `AUTH_CHALLENGE_INVALID` | 400 | Auth state not eligible (e.g. `userId` already set). |
| `REGISTRATION_ALREADY_COMPLETED` | 409 | User row already exists for email. |
| `REGISTRATION_CONFLICT` | 409 | Unique constraint (race / duplicate). |

**Idempotency:** Repeating the same `auth_state_id` after success returns **`201`** with the **same** JSON body while Redis still holds `registration:result:{authStateId}` (`REGISTRATION_RESULT_TTL_SECONDS`, default 7 days). Auth state is deleted after the first success.

**Client helper:** `@okkey/crypto` exports `buildRegistrationCryptoArtifacts` and `registrationArtifactsToWire` (WASM-only primitives).

---

## Vault metadata

Returns **non-secret** vault rows. No ciphertext.

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

## Sync (event log)

Per-vault encrypted event stream. Server stores **opaque** base64 payloads only.

Allowed `eventType` values (must match exactly):

`ITEM_CREATE`, `ITEM_UPDATE`, `ITEM_DELETE`, `FOLDER_CREATE`, `FOLDER_UPDATE`, `FOLDER_DELETE`, `ITEM_FOLDER_ASSIGN`, `VAULT_CREATE`, `VAULT_SHARE`, `VAULT_KEY_ROTATION`, `DEVICE_ADD`, `DEVICE_REMOVE`

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
      "encryptedPayload": "base64",
      "payloadSchemaVersion": 1,
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
| `encryptedPayload` | string | Yes | Standard base64; decoded length must be &gt; 0 and ≤ 512 KiB. |
| `baseVersion` | integer | Yes | Non-negative; must equal current latest version for append. |
| `payloadSchemaVersion` | integer | No | Defaults to `1`; schema tag for ciphertext/plaintext evolution (1–65535). |
| `idempotencyKey` | string (UUID) | **Required** for `ITEM_CREATE` and `FOLDER_CREATE`; optional otherwise | Dedup per vault; same key returns the stored event without a new version. |
| `clientCreatedAt` | string | No | ISO-8601 client timestamp (optional). |

**Response `201`:** Single event object (same shape as an element of `events` in the GET response).

**Errors:**

| `error` | HTTP | When |
|---------|------|------|
| `SYNC_BAD_REQUEST` | 400 | Invalid JSON; missing fields; invalid `baseVersion` type/range; `ITEM_CREATE` or `FOLDER_CREATE` without `idempotencyKey`; invalid UUID for `idempotencyKey`; invalid `clientCreatedAt`. |
| `SYNC_INVALID_EVENT_TYPE` | 400 | Unknown `eventType`. |
| `SYNC_INVALID_PAYLOAD` | 400 | Not valid base64 or empty payload. |
| `PAYLOAD_TOO_LARGE` | 413 | Decoded ciphertext exceeds 512 KiB. |
| `VERSION_MISMATCH` | 409 | `baseVersion` stale; `details` may include `expectedBaseVersion` and `latestVersion`. |
| `AUTH_REQUIRED` | 401 | No valid Bearer session and no allowed dev header. |
| `VAULT_NOT_FOUND` | 404 | Unknown vault. |
| `ACCESS_DENIED` | 403 | User cannot read vault. |

**Idempotency:** If `idempotencyKey` is set and an event with the same `(vaultId, idempotencyKey)` exists, the server returns that event (`201`) without appending again — use for `ITEM_CREATE` and `FOLDER_CREATE` retries.

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
