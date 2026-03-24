# Sync Architecture

Okkey uses event log synchronization.

Goals:
- deterministic state rebuild on every client
- offline-first behavior with outbox retry
- single protocol for backend and all clients

---

## Core Model

Sync stream scope: per vault.

Every accepted event gets a strictly increasing `version` inside its vault stream.
Clients rebuild vault state by replaying events in ascending `version`.

```text
append encrypted event
↓
server assigns version
↓
clients fetch or receive events
↓
replay events in order
↓
materialized local state
```

---

## Event Envelope

Each event contains:
- `id`: immutable event id
- `workspace_id`: workspace context
- `vault_id`: stream id (vault stream)
- `event_type`: operation type
- `actor.user_id` and optional `actor.device_id`
- `payload_ciphertext`: encrypted payload blob
- `payload_encoding`: encoding of encrypted payload (`base64`)
- `payload_schema_version`: payload schema version for safe evolution
- `idempotency_key`: deduplication key for append retries
- `base_version`: client-known vault version before append
- `version`: server-assigned vault version after append
- `created_at`: server timestamp (RFC3339)
- optional `client_created_at`: client timestamp (RFC3339)

Payload is always encrypted on the client. Backend stores and transports opaque ciphertext only.

---

## Event Types (Core v1)

**Items (ciphertext = item plaintext JSON, encrypted with VaultKey):**

- `ITEM_CREATE`
- `ITEM_UPDATE`
- `ITEM_DELETE`

**Personal folder metadata (ciphertext encrypted with per-user metadata key — see below):**

- `FOLDER_CREATE` — new folder row (`idempotencyKey` **required**, same semantics as `ITEM_CREATE`)
- `FOLDER_UPDATE` — full folder row replace (rename and/or `parentFolderId` change); clients must reject moves that introduce a cycle in the folder tree before append
- `FOLDER_DELETE` — remove folder from materialized state; items are **not** deleted; assignments pointing at this folder become “unassigned” (`null`) on replay
- `ITEM_FOLDER_ASSIGN` — set or clear which folder contains an item for **this user** (`folderId: null` = vault root)

**Other:**

- `VAULT_CREATE`
- `VAULT_SHARE`
- `VAULT_KEY_ROTATION`
- `DEVICE_ADD`
- `DEVICE_REMOVE`

Unknown event types must be ignored safely by old clients if payload schema/version is unsupported.

### Personal metadata encryption (folders & assignments)

- Payload JSON schemas: `@okkey/types` — `FolderPlaintextV1` / `ItemFolderAssignPlaintextV1` (`payloadSchemaVersion` **1** for both families on the wire).
- Key: `derivePersonalVaultMetadataKey(passwordShareC, vaultId)` in `@okkey/crypto` (32-byte **C** from split-key registration + `vaultId`; **not** the shared VaultKey). Encrypt/decrypt: `encryptPersonalVaultMetadataPayload` / `decryptPersonalVaultMetadataPayload`.
- Rationale: shared vault members all hold the same VaultKey for item ciphertext; personal folders must stay private per user while still using one vault stream and version counter.

### Field sections and order inside an item

Section and field order for a record is part of **item plaintext v2** (`sections[]`, `fields[]`, `order` fields). Clients sync layout via `ITEM_UPDATE` (full encrypted item). No separate event type is required for reordering sections/fields.

---

## Replay Rules

Replay algorithm:
1. Read local materialized state.
2. Fetch events with `after_version`.
3. Apply events strictly by ascending `version`.
4. Persist updated materialized state and new local cursor.

Requirements:
- no gaps in applied versions
- replay must be deterministic for the same event sequence
- side effects are idempotent for repeated processing

**`ITEM_*` replay:** decrypt with VaultKey; see `@okkey/sync` `replayItemPlaintextEvents`.

**Folder / assignment replay:** `@okkey/sync` `replayFolderAndAssignEvents` — for each event, require `actorId === currentUserId` before decrypting (other users’ folder rows stay opaque). Decrypt with the personal metadata key; unsupported `payloadSchemaVersion` or malformed JSON is skipped (forward compatibility). Removing a folder clears `item → folder` mappings that referenced that folder id.

---

## Conflict Model

Conflict detection is version-based:
- client sends `base_version` on append
- server validates stream head
- if head changed, append is rejected with conflict metadata

Core policy for v1:
- `VERSION_MISMATCH` error when `base_version` is stale
- clients refetch new events, rebase local change, retry append
- tie-break for concurrent edits is effectively last accepted write (`LAST_WRITE_WINS`)

---

## Transport

- **HTTP contract (implemented):** see [`docs/api_contracts.md`](../api_contracts.md) and [`docs/openapi/core-api.yaml`](../openapi/core-api.yaml) for `GET/POST /vaults/:vaultId/events` — responses include `payloadSchemaVersion`, `idempotencyKey`, and `clientCreatedAt`; append accepts optional idempotency (required for `ITEM_CREATE` and `FOLDER_CREATE`) and enforces a maximum ciphertext size.
- Realtime channel: WebSocket (event push)
- Fallback: HTTP pull (`fetch events after version`)
- Both transports use the same event envelope and ordering guarantees

---

## Offline-First

Clients keep encrypted outbox entries locally:
- Web: IndexedDB
- Mobile/Desktop: SQLite

When connectivity returns:
1. drain outbox in FIFO order
2. resolve version conflicts via refetch + rebase
3. continue until outbox is empty

---

## Security

- Cryptography is client-side only.
- Event payloads and sensitive item content are never decrypted on backend.
- Backend validates metadata, ordering and authorization only.
