# Core API Contracts (Draft)

This document defines minimal API contracts used by the SDKs.

## Auth

### POST /auth/email/start
Request:
```json
{ "email": "user@example.com", "locale": "en" }
```
Response:
```json
{
  "challengeId": "challenge-id",
  "expiresAt": "2026-01-01T12:05:00.000Z",
  "resendAvailableAt": "2026-01-01T12:01:00.000Z"
}
```

### POST /auth/email/resend
Request:
```json
{ "challengeId": "challenge-id", "locale": "en" }
```
Response:
```json
{
  "challengeId": "challenge-id",
  "expiresAt": "2026-01-01T12:05:00.000Z",
  "resendAvailableAt": "2026-01-01T12:01:00.000Z"
}
```

### POST /auth/email/confirm
Request:
```json
{ "challengeId": "challenge-id", "code": "123456" }
```
Response:
```json
{
  "authStateId": "auth-state-id",
  "userExists": true,
  "nextStep": "device_check"
}
```

### Auth error codes

- `AUTH_BAD_REQUEST`
- `AUTH_EMAIL_INVALID`
- `AUTH_CODE_INVALID`
- `AUTH_CODE_EXPIRED`
- `AUTH_CODE_ATTEMPTS_EXCEEDED`
- `AUTH_RESEND_TOO_EARLY`
- `AUTH_RATE_LIMITED`

## User

### GET /me
Response:
```json
{ "id": "user-id", "email": "user@example.com", "publicKey": "...", "createdAt": "...", "updatedAt": "..." }
```

## Vaults

### GET /workspaces/:workspaceId/vaults
Headers:
```text
X-User-Id: <user-id>
```
Response:
```json
[{ "id": "vault-id", "workspaceId": "workspace-id", "name": "Personal", "isPersonal": true, "ownerId": "user-id", "createdAt": "...", "updatedAt": "..." }]
```

Errors:
- `AUTH_REQUIRED` (401)
- `WORKSPACE_NOT_FOUND` (404)
- `ACCESS_DENIED` (403)

### GET /vaults/:vaultId
Headers:
```text
X-User-Id: <user-id>
```
Response:
```json
{ "id": "vault-id", "workspaceId": "workspace-id", "name": "Personal", "isPersonal": true, "ownerId": "user-id", "createdAt": "...", "updatedAt": "..." }
```

Errors:
- `AUTH_REQUIRED` (401)
- `VAULT_NOT_FOUND` (404)
- `ACCESS_DENIED` (403)

## Items

### GET /vaults/:vaultId/items
Response:
```json
[{ "id": "item-id", "vaultId": "vault-id", "encryptedData": "...", "version": 1, "createdAt": "...", "updatedAt": "..." }]
```

## Sync

### GET /vaults/:vaultId/events?afterVersion=0
Headers:
```text
X-User-Id: <user-id>
```
Response:
```json
{
  "vaultId": "vault-id",
  "afterVersion": 0,
  "events": [
    {
      "id": "event-id",
      "vaultId": "vault-id",
      "actorId": "user-id",
      "eventType": "ITEM_CREATE",
      "encryptedPayload": "base64...",
      "version": 1,
      "createdAt": "..."
    }
  ]
}
```

### POST /vaults/:vaultId/events
Headers:
```text
X-User-Id: <user-id>
```
Request:
```json
{
  "eventType": "ITEM_UPDATE",
  "encryptedPayload": "base64...",
  "baseVersion": 1
}
```
Response:
```json
{
  "id": "event-id",
  "vaultId": "vault-id",
  "actorId": "user-id",
  "eventType": "ITEM_UPDATE",
  "encryptedPayload": "base64...",
  "version": 2,
  "createdAt": "..."
}
```

Sync errors:
- `AUTH_REQUIRED` (401)
- `ACCESS_DENIED` (403)
- `VAULT_NOT_FOUND` (404)
- `SYNC_BAD_REQUEST` (400)
- `SYNC_INVALID_EVENT_TYPE` (400)
- `SYNC_INVALID_PAYLOAD` (400)
- `VERSION_MISMATCH` (409)

## Devices

### POST /devices/register
Headers:
```text
X-User-Id: <user-id>
X-Forwarded-For: <ip>
```
Request:
```json
{
  "device_public_key": "base64-public-key",
  "device_share": "base64-device-share",
  "device_fingerprint": "0123abcd...",
  "device_name": "MacBook Pro",
  "platform": "desktop",
  "os_name": "macOS",
  "os_version": "14.5",
  "app_version": "1.0.0",
  "client_type": "desktop",
  "user_agent": "okkey-desktop/1.0.0"
}
```
Response:
```json
{
  "device_id": "device-id",
  "status": "trusted"
}
```
Possible `status` values:
- `trusted`
- `pending_approval`

Device errors:
- `AUTH_REQUIRED` (401)
- `DEVICE_BAD_REQUEST` (400)
- `DEVICE_INVALID_FINGERPRINT` (400)
- `DEVICE_INVALID_PUBLIC_KEY` (400)
- `DEVICE_DUPLICATE_CONFLICT` (409)

### POST /devices/:deviceId/approve
Headers:
```text
X-User-Id: <user-id>
X-Device-Id: <trusted-device-id>
```
Response:
```json
{
  "device_id": "device-id",
  "status": "trusted"
}
```
Notes:
- Approval requires a trusted approver device (`X-Device-Id`).
- Pending approval challenge window is controlled by `DEVICE_APPROVAL_TTL_SECONDS` (default: `600`).

### POST /devices/:deviceId/reject
Headers:
```text
X-User-Id: <user-id>
X-Device-Id: <trusted-device-id>
```
Request:
```json
{
  "reason": "unknown login"
}
```
Response:
```json
{
  "device_id": "device-id",
  "status": "revoked"
}
```

Device approval errors:
- `AUTH_REQUIRED` (401)
- `DEVICE_APPROVAL_NOT_FOUND` (404)
- `DEVICE_APPROVAL_EXPIRED` (410)
- `DEVICE_APPROVAL_ALREADY_RESOLVED` (409)
- `DEVICE_APPROVAL_ACCESS_DENIED` (403)
