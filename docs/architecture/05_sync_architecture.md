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

- `ITEM_CREATE`
- `ITEM_UPDATE`
- `ITEM_DELETE`
- `VAULT_CREATE`
- `VAULT_SHARE`
- `VAULT_KEY_ROTATION`
- `DEVICE_ADD`
- `DEVICE_REMOVE`

Unknown event types must be ignored safely by old clients if payload schema/version is unsupported.

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
