import type { FolderPlaintextV1, ItemPlaintextV2, SyncEventWireDto, SyncEventsListResponseDto } from "@okkey/types";
import {
  FOLDER_PLAINTEXT_SCHEMA_VERSION,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
  ITEM_PLAINTEXT_SCHEMA_VERSION,
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
  parseAndNormalizeItemPlaintextUtf8,
  parseFolderPlaintextUtf8,
  parseItemFolderAssignPlaintextUtf8,
} from "@okkey/types";

type CoreEventType =
  | "ITEM_CREATE"
  | "ITEM_UPDATE"
  | "ITEM_DELETE"
  | "FOLDER_CREATE"
  | "FOLDER_UPDATE"
  | "FOLDER_DELETE"
  | "ITEM_FOLDER_ASSIGN"
  | "VAULT_CREATE"
  | "VAULT_SHARE"
  | "VAULT_KEY_ROTATION"
  | "DEVICE_ADD"
  | "DEVICE_REMOVE";

const SUPPORTED_ITEM_SCHEMAS = new Set<number>([
  ITEM_PLAINTEXT_SCHEMA_VERSION,
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
]);

const CORE_EVENT_TYPES = new Set<CoreEventType>([
  "ITEM_CREATE",
  "ITEM_UPDATE",
  "ITEM_DELETE",
  "FOLDER_CREATE",
  "FOLDER_UPDATE",
  "FOLDER_DELETE",
  "ITEM_FOLDER_ASSIGN",
  "VAULT_CREATE",
  "VAULT_SHARE",
  "VAULT_KEY_ROTATION",
  "DEVICE_ADD",
  "DEVICE_REMOVE",
]);

export type UnknownEventPolicy = "ignore" | "quarantine";
export type UnsupportedSchemaPolicy = "ignore" | "quarantine";

export interface ReplayEngineOptions {
  vaultId: string;
  currentUserId?: string;
  initialLastAppliedVersion?: number;
  unknownEventPolicy?: UnknownEventPolicy;
  unsupportedSchemaPolicy?: UnsupportedSchemaPolicy;
  decryptItemPayload?: (encryptedPayloadBase64: string) => Promise<Uint8Array>;
  decryptPersonalMetadataPayload?: (encryptedPayloadBase64: string) => Promise<Uint8Array>;
}

export interface ReplayQuarantineRecord {
  event: SyncEventWireDto;
  reason:
    | "UNKNOWN_EVENT_TYPE"
    | "UNSUPPORTED_PAYLOAD_SCHEMA_VERSION"
    | "DECRYPT_FAILED"
    | "INVALID_PAYLOAD"
    | "STALE_VERSION_NOT_DUPLICATE";
}

export interface SyncMaterializedState {
  items: Map<string, ItemPlaintextV2>;
  folders: Map<string, FolderPlaintextV1>;
  itemFolder: Map<string, string | null>;
  vaultLifecycle: {
    latestCreateVersion: number | null;
    latestShareVersion: number | null;
    latestKeyRotationVersion: number | null;
  };
  deviceLifecycle: {
    latestAddVersion: number | null;
    latestRemoveVersion: number | null;
  };
  lastAppliedVersion: number;
  appliedEventIds: Set<string>;
  quarantined: ReplayQuarantineRecord[];
}

export interface EventGapErrorDetails {
  expectedVersion: number;
  actualVersion: number;
  afterVersion: number;
}

export class EventGapError extends Error {
  readonly details: EventGapErrorDetails;

  constructor(details: EventGapErrorDetails) {
    super(
      `EVENT_GAP: expected version ${details.expectedVersion}, got ${details.actualVersion} after ${details.afterVersion}`,
    );
    this.name = "EventGapError";
    this.details = details;
  }
}

type HandlerResult = "applied" | "ignored" | "quarantined";
type EventHandler = (state: SyncMaterializedState, event: SyncEventWireDto) => Promise<HandlerResult>;

/**
 * Reads ciphertext envelope from wire DTOs. Defaults `crypto_version` to `2` only for **legacy /
 * transitional** API shapes missing the field; **outgoing** appends must always set `crypto_version`
 * explicitly (see `item-sync` builders).
 */
function getEventBlob(event: SyncEventWireDto): {
  crypto_version: number;
  payload: string;
} {
  const maybe = event as SyncEventWireDto & {
    encryptedBlob?: { crypto_version?: number; payload?: string };
    payloadSchemaVersion?: number;
    encryptedPayload?: string;
  };
  if (maybe.encryptedBlob?.payload) {
    return {
      crypto_version: maybe.encryptedBlob.crypto_version ?? 2,
      payload: maybe.encryptedBlob.payload,
    };
  }
  return {
    crypto_version: maybe.payloadSchemaVersion ?? 2,
    payload: maybe.encryptedPayload ?? "",
  };
}

function createInitialState(initialLastAppliedVersion: number): SyncMaterializedState {
  return {
    items: new Map<string, ItemPlaintextV2>(),
    folders: new Map<string, FolderPlaintextV1>(),
    itemFolder: new Map<string, string | null>(),
    vaultLifecycle: {
      latestCreateVersion: null,
      latestShareVersion: null,
      latestKeyRotationVersion: null,
      },
    deviceLifecycle: {
      latestAddVersion: null,
      latestRemoveVersion: null,
    },
    lastAppliedVersion: initialLastAppliedVersion,
    appliedEventIds: new Set<string>(),
    quarantined: [],
  };
}

function clearAssignmentsToFolder(itemFolder: Map<string, string | null>, folderId: string): void {
  for (const [itemId, assignedFolderId] of itemFolder.entries()) {
    if (assignedFolderId === folderId) {
      itemFolder.set(itemId, null);
    }
  }
}

function removeFolder(state: SyncMaterializedState, folderId: string): void {
  state.folders.delete(folderId);
  clearAssignmentsToFolder(state.itemFolder, folderId);
}

function sortForDeterministicReplay(events: SyncEventWireDto[]): SyncEventWireDto[] {
  return [...events].sort((a, b) => {
    if (a.version !== b.version) return a.version - b.version;
    if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    return a.id.localeCompare(b.id);
  });
}

export class SyncReplayEngine {
  private readonly options: Required<
    Pick<ReplayEngineOptions, "vaultId" | "unknownEventPolicy" | "unsupportedSchemaPolicy">
  > &
    Omit<ReplayEngineOptions, "vaultId" | "unknownEventPolicy" | "unsupportedSchemaPolicy">;

  private readonly state: SyncMaterializedState;
  private readonly handlers: Map<string, EventHandler>;

  constructor(options: ReplayEngineOptions) {
    this.options = {
      ...options,
      unknownEventPolicy: options.unknownEventPolicy ?? "quarantine",
      unsupportedSchemaPolicy: options.unsupportedSchemaPolicy ?? "quarantine",
    };
    this.state = createInitialState(options.initialLastAppliedVersion ?? 0);
    this.handlers = new Map<string, EventHandler>();
    this.registerCoreHandlers();
  }

  registerHandler(eventType: string, handler: EventHandler): void {
    this.handlers.set(eventType, handler);
  }

  getStateSnapshot(): SyncMaterializedState {
    return {
      ...this.state,
      items: new Map(this.state.items),
      folders: new Map(this.state.folders),
      itemFolder: new Map(this.state.itemFolder),
      appliedEventIds: new Set(this.state.appliedEventIds),
      quarantined: [...this.state.quarantined],
      vaultLifecycle: { ...this.state.vaultLifecycle },
      deviceLifecycle: { ...this.state.deviceLifecycle },
    };
  }

  async applyEvents(events: SyncEventWireDto[]): Promise<SyncMaterializedState> {
    const ordered = sortForDeterministicReplay(events);
    for (const ev of ordered) {
      if (ev.vaultId !== this.options.vaultId) {
        continue;
      }
      if (this.state.appliedEventIds.has(ev.id)) {
        continue;
      }

      const expectedNextVersion = this.state.lastAppliedVersion + 1;
      if (ev.version > expectedNextVersion) {
        throw new EventGapError({
          expectedVersion: expectedNextVersion,
          actualVersion: ev.version,
          afterVersion: this.state.lastAppliedVersion,
        });
      }
      if (ev.version < expectedNextVersion) {
        this.state.quarantined.push({ event: ev, reason: "STALE_VERSION_NOT_DUPLICATE" });
        continue;
      }

      const handler = this.handlers.get(ev.eventType);
      if (!handler) {
        this.handleUnknownType(ev);
        this.state.lastAppliedVersion = ev.version;
        this.state.appliedEventIds.add(ev.id);
        continue;
      }

      await handler(this.state, ev);
      this.state.lastAppliedVersion = ev.version;
      this.state.appliedEventIds.add(ev.id);
    }

    return this.getStateSnapshot();
  }

  async replayFromFetcher(
    fetchPage: (vaultId: string, afterVersion: number) => Promise<SyncEventsListResponseDto>,
  ): Promise<SyncMaterializedState> {
    while (true) {
      const page = await fetchPage(this.options.vaultId, this.state.lastAppliedVersion);
      if (!page.events.length) {
        return this.getStateSnapshot();
      }
      await this.applyEvents(page.events);
    }
  }

  private handleUnknownType(event: SyncEventWireDto): void {
    if (!CORE_EVENT_TYPES.has(event.eventType as CoreEventType)) {
      if (this.options.unknownEventPolicy === "quarantine") {
        this.state.quarantined.push({ event, reason: "UNKNOWN_EVENT_TYPE" });
      }
    }
  }

  private quarantineUnsupported(event: SyncEventWireDto): HandlerResult {
    if (this.options.unsupportedSchemaPolicy === "quarantine") {
      this.state.quarantined.push({
        event,
        reason: "UNSUPPORTED_PAYLOAD_SCHEMA_VERSION",
      });
      return "quarantined";
    }
    return "ignored";
  }

  private registerCoreHandlers(): void {
    const itemHandler: EventHandler = async (state, event) => {
      const blob = getEventBlob(event);
      if (!SUPPORTED_ITEM_SCHEMAS.has(blob.crypto_version)) {
        return this.quarantineUnsupported(event);
      }
      if (!this.options.decryptItemPayload) {
        return "ignored";
      }

      let plaintext: Uint8Array;
      try {
        plaintext = await this.options.decryptItemPayload(blob.payload);
      } catch {
        state.quarantined.push({ event, reason: "DECRYPT_FAILED" });
        return "quarantined";
      }

      const parsed = parseAndNormalizeItemPlaintextUtf8(plaintext);
      if (!parsed || parsed.vaultId !== this.options.vaultId) {
        state.quarantined.push({ event, reason: "INVALID_PAYLOAD" });
        return "quarantined";
      }

      if (parsed.deleted) {
        state.items.delete(parsed.itemId);
      } else {
        state.items.set(parsed.itemId, parsed);
      }
      return "applied";
    };
    this.registerHandler("ITEM_CREATE", itemHandler);
    this.registerHandler("ITEM_UPDATE", itemHandler);
    this.registerHandler("ITEM_DELETE", itemHandler);

    const folderHandler: EventHandler = async (state, event) => {
      const blob = getEventBlob(event);
      if (blob.crypto_version !== FOLDER_PLAINTEXT_SCHEMA_VERSION) {
        return this.quarantineUnsupported(event);
      }
      if (!this.options.currentUserId || event.actorId !== this.options.currentUserId) {
        return "ignored";
      }
      if (!this.options.decryptPersonalMetadataPayload) {
        return "ignored";
      }

      let plaintext: Uint8Array;
      try {
        plaintext = await this.options.decryptPersonalMetadataPayload(blob.payload);
      } catch {
        state.quarantined.push({ event, reason: "DECRYPT_FAILED" });
        return "quarantined";
      }

      const row = parseFolderPlaintextUtf8(plaintext);
      if (!row || row.vaultId !== this.options.vaultId) {
        state.quarantined.push({ event, reason: "INVALID_PAYLOAD" });
        return "quarantined";
      }

      if (event.eventType === "FOLDER_DELETE" || row.deleted) {
        removeFolder(state, row.folderId);
      } else {
        state.folders.set(row.folderId, row);
      }
      return "applied";
    };
    this.registerHandler("FOLDER_CREATE", folderHandler);
    this.registerHandler("FOLDER_UPDATE", folderHandler);
    this.registerHandler("FOLDER_DELETE", folderHandler);

    this.registerHandler("ITEM_FOLDER_ASSIGN", async (state, event) => {
      const blob = getEventBlob(event);
      if (blob.crypto_version !== ITEM_FOLDER_ASSIGN_SCHEMA_VERSION) {
        return this.quarantineUnsupported(event);
      }
      if (!this.options.currentUserId || event.actorId !== this.options.currentUserId) {
        return "ignored";
      }
      if (!this.options.decryptPersonalMetadataPayload) {
        return "ignored";
      }

      let plaintext: Uint8Array;
      try {
        plaintext = await this.options.decryptPersonalMetadataPayload(blob.payload);
      } catch {
        state.quarantined.push({ event, reason: "DECRYPT_FAILED" });
        return "quarantined";
      }

      const assign = parseItemFolderAssignPlaintextUtf8(plaintext);
      if (!assign || assign.vaultId !== this.options.vaultId) {
        state.quarantined.push({ event, reason: "INVALID_PAYLOAD" });
        return "quarantined";
      }
      state.itemFolder.set(assign.itemId, assign.folderId);
      return "applied";
    });

    this.registerHandler("VAULT_CREATE", async (state, event) => {
      state.vaultLifecycle.latestCreateVersion = event.version;
      return "applied";
    });
    this.registerHandler("VAULT_SHARE", async (state, event) => {
      state.vaultLifecycle.latestShareVersion = event.version;
      return "applied";
    });
    this.registerHandler("VAULT_KEY_ROTATION", async (state, event) => {
      state.vaultLifecycle.latestKeyRotationVersion = event.version;
      return "applied";
    });
    this.registerHandler("DEVICE_ADD", async (state, event) => {
      state.deviceLifecycle.latestAddVersion = event.version;
      return "applied";
    });
    this.registerHandler("DEVICE_REMOVE", async (state, event) => {
      state.deviceLifecycle.latestRemoveVersion = event.version;
      return "applied";
    });
  }
}

export async function replayVaultEvents(
  events: SyncEventWireDto[],
  options: ReplayEngineOptions,
): Promise<SyncMaterializedState> {
  const engine = new SyncReplayEngine(options);
  await engine.applyEvents(events);
  return engine.getStateSnapshot();
}
