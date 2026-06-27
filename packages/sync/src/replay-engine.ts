import type { ItemPlaintextV2, SyncEventWireDto, SyncEventsListResponseDto } from "@okkey/types";
import {
  ITEM_PLAINTEXT_SCHEMA_VERSION,
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
  parseAndNormalizeItemPlaintextUtf8,
} from "@okkey/types";

type CoreEventType =
  | "ITEM_CREATE"
  | "ITEM_UPDATE"
  | "ITEM_DELETE"
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
  /** From `GET /vaults/:vaultId` (`cryptoVersion`). Server is authoritative; use with replayed `MAX(crypto_version)` for client-side checks. */
  vaultCryptoVersion?: number;
  currentUserId?: string;
  initialLastAppliedVersion?: number;
  unknownEventPolicy?: UnknownEventPolicy;
  unsupportedSchemaPolicy?: UnsupportedSchemaPolicy;
  decryptItemPayload?: (encryptedPayloadBase64: string) => Promise<Uint8Array>;
  decryptPersonalMetadataPayload?: (encryptedPayloadBase64: string) => Promise<Uint8Array>;
  /** Integrity verifier for signature envelopes embedded into critical events. */
  verifyEventSignature?: (input: {
    event: SyncEventWireDto;
    payload: unknown;
    envelope: Record<string, unknown>;
  }) => Promise<boolean> | boolean;
  /** Defaults to VAULT_SHARE/VAULT_KEY_ROTATION. */
  requiredSignatureEventTypes?: string[];
}

export interface ReplayQuarantineRecord {
  event: SyncEventWireDto;
  reason:
    | "UNKNOWN_EVENT_TYPE"
    | "UNSUPPORTED_PAYLOAD_SCHEMA_VERSION"
    | "DECRYPT_FAILED"
    | "INVALID_PAYLOAD"
    | "STALE_VERSION_NOT_DUPLICATE"
    | "SIGNATURE_REQUIRED"
    | "SIGNATURE_INVALID";
}

export interface SyncMaterializedState {
  items: Map<string, ItemPlaintextV2>;
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

export class SignatureValidationError extends Error {
  readonly eventId: string;
  readonly eventType: string;
  readonly reason: "SIGNATURE_REQUIRED" | "SIGNATURE_INVALID";

  constructor(eventId: string, eventType: string, reason: "SIGNATURE_REQUIRED" | "SIGNATURE_INVALID") {
    super(`${reason}: ${eventType} (${eventId})`);
    this.name = "SignatureValidationError";
    this.eventId = eventId;
    this.eventType = eventType;
    this.reason = reason;
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

function sortForDeterministicReplay(events: SyncEventWireDto[]): SyncEventWireDto[] {
  return [...events].sort((a, b) => {
    if (a.version !== b.version) return a.version - b.version;
    if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    return a.id.localeCompare(b.id);
  });
}

function extractEventSignatureEnvelope(event: SyncEventWireDto): Record<string, unknown> | null {
  const fromTopLevel = (event as SyncEventWireDto & { signature?: unknown }).signature;
  if (fromTopLevel && typeof fromTopLevel === "object" && !Array.isArray(fromTopLevel)) {
    return fromTopLevel as unknown as Record<string, unknown>;
  }
  const maybe = event as SyncEventWireDto & {
    encryptedBlob?: { meta?: Record<string, unknown> };
  };
  const fromMeta = maybe.encryptedBlob?.meta?.signature;
  if (fromMeta && typeof fromMeta === "object" && !Array.isArray(fromMeta)) {
    return fromMeta as Record<string, unknown>;
  }
  return null;
}

function signatureContextMatchesEventType(eventType: string, context: unknown): boolean {
  if (typeof context !== "string") {
    return false;
  }
  if (eventType === "VAULT_SHARE") {
    return context === "vault.share" || context === "sync.append";
  }
  if (eventType === "VAULT_KEY_ROTATION") {
    return (
      context === "vault.revoke" ||
      context === "vault.rotate" ||
      context === "vault.member_role_update" ||
      context === "sync.append"
    );
  }
  return context === "sync.append";
}

export class SyncReplayEngine {
  private readonly options: Required<
    Pick<ReplayEngineOptions, "vaultId" | "unknownEventPolicy" | "unsupportedSchemaPolicy">
  > &
    Omit<ReplayEngineOptions, "vaultId" | "unknownEventPolicy" | "unsupportedSchemaPolicy">;

  private readonly state: SyncMaterializedState;
  private readonly handlers: Map<string, EventHandler>;
  private readonly requiredSignatureEventTypes: Set<string>;

  constructor(options: ReplayEngineOptions) {
    this.options = {
      ...options,
      unknownEventPolicy: options.unknownEventPolicy ?? "quarantine",
      unsupportedSchemaPolicy: options.unsupportedSchemaPolicy ?? "quarantine",
    };
    this.state = createInitialState(options.initialLastAppliedVersion ?? 0);
    this.handlers = new Map<string, EventHandler>();
    this.requiredSignatureEventTypes = new Set(options.requiredSignatureEventTypes ?? []);
    this.registerCoreHandlers();
  }

  registerHandler(eventType: string, handler: EventHandler): void {
    this.handlers.set(eventType, handler);
  }

  getStateSnapshot(): SyncMaterializedState {
    return {
      ...this.state,
      items: new Map(this.state.items),
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

      await this.assertCriticalEventSignature(ev);
      await handler(this.state, ev);
      this.state.lastAppliedVersion = ev.version;
      this.state.appliedEventIds.add(ev.id);
    }

    return this.getStateSnapshot();
  }

  private async assertCriticalEventSignature(event: SyncEventWireDto): Promise<void> {
    if (!this.requiredSignatureEventTypes.has(event.eventType)) {
      return;
    }
    const envelope = extractEventSignatureEnvelope(event);
    if (!envelope) {
      throw new SignatureValidationError(event.id, event.eventType, "SIGNATURE_REQUIRED");
    }
    const payload = {
      vaultId: event.vaultId,
      eventType: event.eventType,
      encryptedBlob: event.encryptedBlob,
    };
    if (typeof envelope.payload_hash !== "string" || envelope.payload_hash.length === 0) {
      throw new SignatureValidationError(event.id, event.eventType, "SIGNATURE_INVALID");
    }
    if (!signatureContextMatchesEventType(event.eventType, envelope.context)) {
      throw new SignatureValidationError(event.id, event.eventType, "SIGNATURE_INVALID");
    }
    if (this.options.verifyEventSignature) {
      const verified = await this.options.verifyEventSignature({ event, payload, envelope });
      if (!verified) {
        throw new SignatureValidationError(event.id, event.eventType, "SIGNATURE_INVALID");
      }
    }
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
