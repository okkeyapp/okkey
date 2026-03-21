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
Response:
```json
[{ "id": "vault-id", "workspaceId": "workspace-id", "name": "Personal", "isPersonal": true, "ownerId": "user-id", "createdAt": "...", "updatedAt": "..." }]
```

## Items

### GET /vaults/:vaultId/items
Response:
```json
[{ "id": "item-id", "vaultId": "vault-id", "encryptedData": "...", "version": 1, "createdAt": "...", "updatedAt": "..." }]
```
