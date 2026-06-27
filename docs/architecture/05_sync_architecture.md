# Sync Architecture

Okkey uses event log synchronization.

Goals:
- deterministic state rebuild on every client
- offline-first behavior with outbox retry
- single protocol for backend and all clients

---

## Core Model

Vault items and lifecycle use **per-vault** streams. Personal folder metadata uses a separate **per-workspace, per-user** stream (`GET/POST /workspaces/:workspaceId/personal-events`).

Every accepted event gets a strictly increasing `version` inside its stream.
Clients rebuild state by replaying events in ascending `version`.

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
- optional `signature`: hybrid signature envelope for integrity-critical event payloads
- `idempotency_key`: deduplication key for append retries
- `base_version`: client-known vault version before append
- `version`: server-assigned vault version after append
- `created_at`: server timestamp (RFC3339)
- optional `client_created_at`: client timestamp (RFC3339)

Payload is always encrypted on the client. Backend stores and transports opaque ciphertext only.
For integrity-critical operations, signature metadata is stored with event payload envelope metadata (`EncryptedBlob.meta.signature`) and may also be exposed as top-level wire field.

---

## Event Types (Core v1)

**Vault stream (`/vaults/:vaultId/events`):**

- `ITEM_CREATE`
- `ITEM_UPDATE`
- `ITEM_DELETE`
- `VAULT_CREATE`
- `VAULT_SHARE`
- `VAULT_KEY_ROTATION`
- `DEVICE_ADD`
- `DEVICE_REMOVE`

**Workspace personal metadata stream (`/workspaces/:workspaceId/personal-events`) — per user, encrypted with personal metadata key:**

- `FOLDER_CREATE` — new folder row (`idempotencyKey` **required**)
- `FOLDER_UPDATE` — full folder row replace (rename and/or `parentFolderId` change); clients must reject moves that introduce a cycle before append
- `FOLDER_DELETE` — remove folder from materialized state; items are **not** deleted; assignments pointing at this folder become “unassigned” (`null`) on replay
- `ITEM_FOLDER_ASSIGN` — set or clear which folder contains an item for **this user** within the workspace (`folderId: null` = no folder)

**Other (vault stream only):**

- see vault lifecycle events above

Unknown event types must be ignored safely by old clients if payload schema/version is unsupported.

### Personal metadata encryption (folders & assignments)

- Payload JSON schemas: `@okkey/types` — `FolderPlaintextV2` / `ItemFolderAssignPlaintextV2` (`schemaVersion` **2**).
- Key: `derivePersonalWorkspaceMetadataKey(passwordShareC, workspaceId)` in `@okkey/crypto` (32-byte **C** from split-key registration + `workspaceId`; **not** the shared VaultKey). Encrypt/decrypt: `encryptPersonalVaultMetadataPayload` / `decryptPersonalVaultMetadataPayload`.
- Scope: folders belong to a **workspace**, not a vault. Items from any vault in the workspace can be assigned to folders via `itemId`.

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
- signature policy (when enabled) must fail-fast for invalid or missing signatures on critical event types

**`ITEM_*` replay (vault stream):** decrypt with VaultKey; see `@okkey/sync` `replayItemPlaintextEvents`.

**Folder / assignment replay (workspace personal stream):** `@okkey/sync` `replayWorkspaceFolderEvents` — decrypt with `derivePersonalWorkspaceMetadataKey`; unsupported `schemaVersion` or malformed JSON is skipped. Removing a folder clears `item → folder` mappings that referenced that folder id.

### Signature validation in replay (6.18)

`@okkey/sync` replay engine supports optional signature enforcement:

- policy is configured with `requiredSignatureEventTypes` (defaults to disabled for compatibility);
- for configured critical types (for example `VAULT_SHARE`, `VAULT_KEY_ROTATION`) replay requires a signature envelope;
- replay validates minimal envelope invariants (`payload_hash`, context-event mapping) and can delegate cryptographic verification via `verifyEventSignature` hook;
- invalid or missing signatures produce fail-fast security error (`SignatureValidationError`) rather than silent ignore.

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

## Rotation Atomicity (6.11)

For `VAULT_KEY_ROTATION` flows (`POST /shares/revoke`, `POST /key/rotate`, `PATCH /shares/:userId`), Core enforces an
append-driven atomic sequence in a single DB transaction:

1. lock vault stream head (`vaults` row + `events` guard query),
2. validate idempotency/base-version guard,
3. validate full recipient coverage and wrap policy,
4. apply membership/key mutations,
5. append exactly one `VAULT_KEY_ROTATION` event,
6. commit.

Invariants:
- no `vault_keys` mutation is allowed when append guard fails (`VERSION_MISMATCH` / idempotency conflict),
- replay is the source of truth: active key state must always correspond to committed rotation events,
- repeated delivery with the same idempotency request must be deterministic no-op.

Idempotency semantics for rotation:
- same `idempotencyKey` + same rotation request fingerprint => no-op success (no extra writes),
- same `idempotencyKey` + different rotation payload/wrap set => `IDEMPOTENCY_KEY_CONFLICT` (`409`).

The request fingerprint is stored in `EncryptedBlob.meta.rotation_request_fingerprint` for
`VAULT_KEY_ROTATION` payloads and is used only for conflict detection; ciphertext remains opaque to backend.

---

## Transport

- **HTTP contract (implemented):** see [`docs/api_contracts.md`](../api_contracts.md) and [`docs/openapi/core-api.yaml`](../openapi/core-api.yaml) for `GET/POST /vaults/:vaultId/events` — responses include `payloadSchemaVersion`, `idempotencyKey`, and `clientCreatedAt`; append accepts optional idempotency (required for `ITEM_CREATE` and `FOLDER_CREATE`) and enforces a maximum ciphertext size.
- Realtime channel: WebSocket (event push)
- Fallback: HTTP pull (`fetch events after version`)
- Both transports use the same event envelope and ordering guarantees

---

## Offline-First

Clients keep encrypted outbox entries locally:
- Web: IndexedDB (`IndexedDbOutboxStore` in `@okkey/sync`)
- Mobile/Desktop: SQLite (`SqliteOutboxStore` in `@okkey/sync`, driver-injected)

When connectivity returns:
1. drain outbox in FIFO order
2. resolve version conflicts via refetch + rebase
3. continue until outbox is empty

### Outbox v1 behavior

- **Persisted schema (SDK-level):** `id`, `vaultId`, `request`, `status`, `attemptCount`,
  `nextAttemptAtMs`, `lastErrorCode`, `lastErrorMessage`, timestamps.
- **Statuses:** `pending -> sending -> (removed on success)`; transient failures go to `failed`;
  after max attempts entry becomes `dead` and requires manual `retryAll`.
- **Drain order:** FIFO by creation time (and stable tie-break by id).
- **Retry:** exponential backoff with jitter, configurable max attempts and queue size guard.
- **Conflict (`VERSION_MISMATCH`):**
  1. fetch remote events after stale `base_version`;
  2. replay with `@okkey/sync` deterministic replay engine;
  3. rebase local update (for v1 `ITEM_UPDATE`, via client hook) and retry append with
     `baseVersion = latestVersion`.
- **Conflict policy v1:** last write wins on server accept; after conflict the client must
  realign local state with replayed server stream before retrying append.
- **No secrets in logs:** only error codes/statuses and queue metadata.

---

## Security

- Cryptography is client-side only.
- Event payloads and sensitive item content are never decrypted on backend.
- Backend validates metadata, ordering and authorization only.
