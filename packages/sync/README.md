# @okkey/sync

Sync SDK interfaces for Okkey Core.

## Usage

```ts
import type { SyncAdapter, SyncQueue } from "@okkey/sync";
```

## Replay engine

`SyncReplayEngine` provides deterministic vault replay for Core v1 events:

- strict ordering by `version` (with deterministic tie-breaks),
- gap detection (`EventGapError`),
- handler registry by `eventType`,
- cursor tracking via `lastAppliedVersion`,
- safe policy for unknown event types and unsupported schema versions (`ignore` or `quarantine`).

Minimal example:

```ts
import { SyncReplayEngine } from "@okkey/sync";

const engine = new SyncReplayEngine({
  vaultId,
  currentUserId,
  decryptItemPayload: decryptWithVaultKey,
  decryptPersonalMetadataPayload: decryptWithPersonalMetadataKey,
});

await engine.replayFromFetcher((vId, afterVersion) =>
  apiClient.listVaultEvents(vId, afterVersion),
);

const state = engine.getStateSnapshot();
```

### Adding a new event type

1. Register a handler with `engine.registerHandler("EVENT_NAME", handler)`.
2. Keep the handler pure/idempotent for repeated delivery.
3. Validate `payloadSchemaVersion` explicitly in the handler.
4. Add fixture-based tests for deterministic replay and duplicate delivery.

Reference fixtures and integration replay tests live in:
`services/api/test/fixtures/sync-replay/` and `services/api/test/sync-replay-engine.test.ts`.

## Outbox stores

`@okkey/sync` now provides platform stores behind one `OutboxStore` interface:

- `IndexedDbOutboxStore` for web clients (IndexedDB).
- `SqliteOutboxStore` for mobile/desktop clients (inject any SQLite driver that
  implements `execute/query` async API).
- `InMemoryOutboxStore` for tests and non-persistent scenarios.
