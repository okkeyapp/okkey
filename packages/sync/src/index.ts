import type {
  AppendEventRequest,
  AppendEventResult,
  FetchEventsQuery,
  FetchEventsResult,
} from "@okkey/types";

export interface SyncAdapter {
  fetchEvents(query: FetchEventsQuery): Promise<FetchEventsResult>;
  appendEvent(request: AppendEventRequest): Promise<AppendEventResult>;
}

export interface SyncQueue {
  enqueue(request: AppendEventRequest): Promise<void>;
  drain(adapter: SyncAdapter): Promise<void>;
  size(): Promise<number>;
}

/** Item event replay only (no WASM). Helpers that encrypt payloads live in `@okkey/sync/item-sync`. */
export { replayItemPlaintextEvents, type ItemVaultReplayState } from "./item-replay.js";

export {
  replayFolderAndAssignEvents,
  type FolderVaultReplayState,
} from "./folder-replay.js";

export {
  replayWorkspaceFolderEvents,
  buildFolderTreeFromFlat,
  type WorkspaceFolderReplayState,
  type WorkspaceFolderTreeNode,
} from "./workspace-folder-replay.js";

export {
  WorkspacePersonalOutboxClient,
  InMemoryWorkspacePersonalOutboxStore,
  computeWorkspacePersonalBackoffDelayMs,
  type WorkspacePersonalOutboxEntry,
  type WorkspacePersonalOutboxEntryPayload,
  type WorkspacePersonalOutboxStore,
  type WorkspacePersonalOutboxTransport,
} from "./workspace-personal-outbox.js";

export { wouldIntroduceFolderParentCycle, type FolderParentRef } from "./folder-tree.js";

export {
  EventGapError,
  SignatureValidationError,
  SyncReplayEngine,
  replayVaultEvents,
  type EventGapErrorDetails,
  type ReplayEngineOptions,
  type ReplayQuarantineRecord,
  type SyncMaterializedState,
  type UnknownEventPolicy,
  type UnsupportedSchemaPolicy,
} from "./replay-engine.js";

export {
  InMemoryOutboxStore,
  SyncOutboxClient,
  computeBackoffDelayMs,
  type ItemUpdateRebaseContext,
  type OutboxClientOptions,
  type OutboxEntry,
  type OutboxEntryPayload,
  type OutboxEntryStatus,
  type OutboxHooks,
  type OutboxStore,
  type OutboxTransport,
  type VersionMismatchDetails,
} from "./outbox.js";

export { IndexedDbOutboxStore, type IndexedDbOutboxStoreOptions } from "./outbox-store-indexeddb.js";
export { SqliteOutboxStore, type SqliteDriver, type SqliteOutboxStoreOptions } from "./outbox-store-sqlite.js";

export {
  buildFolderCreateAppendRequest,
  buildFolderUpdateAppendRequest,
  buildFolderDeleteAppendRequest,
  buildItemFolderAssignAppendRequest,
} from "./folder-sync.js";
