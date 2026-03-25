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

export { wouldIntroduceFolderParentCycle, type FolderParentRef } from "./folder-tree.js";

export {
  EventGapError,
  SyncReplayEngine,
  replayVaultEvents,
  type EventGapErrorDetails,
  type ReplayEngineOptions,
  type ReplayQuarantineRecord,
  type SyncMaterializedState,
  type UnknownEventPolicy,
  type UnsupportedSchemaPolicy,
} from "./replay-engine.js";
