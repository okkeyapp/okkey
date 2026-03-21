# Core API Contracts (Draft)

This document defines minimal API contracts used by the SDKs.

## Auth

### POST /auth/email/start
Request:
```json
{ "email": "user@example.com" }
```
Response: `204 No Content`

### POST /auth/email/confirm
Request:
```json
{ "email": "user@example.com", "code": "123456" }
```
Response:
```json
{ "id": "session-id", "userId": "user-id", "deviceId": "device-id", "expiresAt": "...", "createdAt": "..." }
```

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
