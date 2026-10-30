import type {
  SyncAppendEventRequestDto,
  SyncAppendEventsBatchResponseDto,
  SyncEventWireDto,
  SyncEventsListResponseDto,
} from "@okkey/types";
import { SYNC_EVENTS_BATCH_MAX } from "@okkey/types";
import { generateEntityId } from "@okkey/id";
import { eventsListHasMore } from "./events-list-page.js";
import { replayVaultEvents, type ReplayEngineOptions, type SyncMaterializedState } from "./replay-engine.js";

export type OutboxEntryStatus = "pending" | "sending" | "failed" | "dead";

export interface OutboxEntryPayload {
  vaultId: string;
  request: SyncAppendEventRequestDto;
}

export interface OutboxEntry extends OutboxEntryPayload {
  id: string;
  status: OutboxEntryStatus;
  attemptCount: number;
  createdAtMs: number;
  updatedAtMs: number;
  nextAttemptAtMs: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

export interface OutboxStore {
  load(): Promise<OutboxEntry[]>;
  save(entries: OutboxEntry[]): Promise<void>;
}

export interface OutboxTransport {
  appendVaultEvent(vaultId: string, body: SyncAppendEventRequestDto): Promise<SyncEventWireDto>;
  listVaultEvents(vaultId: string, afterVersion: number): Promise<SyncEventsListResponseDto>;
  /** Optional batch append — used by drain when ≥2 pending entries share a vault. */
  appendVaultEventsBatch?: (
    vaultId: string,
    body: { events: SyncAppendEventRequestDto[] },
  ) => Promise<SyncAppendEventsBatchResponseDto>;
}

export interface VersionMismatchDetails {
  code: "VERSION_MISMATCH";
  expectedBaseVersion: number;
  latestVersion: number;
}

export interface ItemUpdateRebaseContext {
  entry: OutboxEntry;
  latestVersion: number;
  state: SyncMaterializedState;
}

export interface OutboxHooks {
  onConflictResolved?: (entry: OutboxEntry) => void;
  onQueueStalled?: (entries: OutboxEntry[]) => void;
}

/** Marked dead when a peer already wrote the same item since our stale baseVersion. */
export const ITEM_UPDATE_CONFLICT = "ITEM_UPDATE_CONFLICT";

export interface OutboxClientOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  maxQueueSize?: number;
  nowMs?: () => number;
  random?: () => number;
  replayOptions?: Omit<ReplayEngineOptions, "vaultId" | "initialLastAppliedVersion">;
  /**
   * Decrypt item ciphertext for a vault during VERSION_MISMATCH replay.
   * Required to detect same-item concurrent edits (without this, updates may last-writer-wins).
   */
  decryptItemPayloadForVault?: (
    vaultId: string,
    encryptedPayloadBase64: string,
    itemId?: string | null,
  ) => Promise<Uint8Array>;
  rebaseItemUpdate?: (
    context: ItemUpdateRebaseContext,
  ) => Promise<Pick<SyncAppendEventRequestDto, "encryptedBlob">>;
  hooks?: OutboxHooks;
}

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 30_000;
const DEFAULT_JITTER_RATIO = 0.2;
const DEFAULT_MAX_QUEUE_SIZE = 5_000;

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function versionMismatchFromDetails(
  details: Record<string, unknown>,
): VersionMismatchDetails | undefined {
  if (
    typeof details.expectedBaseVersion === "number" &&
    typeof details.latestVersion === "number"
  ) {
    return {
      code: "VERSION_MISMATCH",
      expectedBaseVersion: details.expectedBaseVersion,
      latestVersion: details.latestVersion,
    };
  }
  return undefined;
}

/**
 * Recognise Core API 409 VERSION_MISMATCH shapes:
 * - `{ code, details: { expectedBaseVersion, latestVersion } }` (optionally `details.code`)
 * - `{ error: "VERSION_MISMATCH", details: { ... } }`
 * - `ApiRequestError`-like `{ body: { error: "VERSION_MISMATCH", details: { ... } } }`
 *
 * Do not require `details.code`; the server puts the code on `error` / top-level `code`.
 */
function toOutboxError(err: unknown): { code: string; message: string; versionMismatch?: VersionMismatchDetails } {
  if (isObject(err)) {
    const directCode = typeof err.code === "string" ? err.code : undefined;
    const directMsg = typeof err.message === "string" ? err.message : "unknown error";

    if (directCode === "VERSION_MISMATCH" && isObject(err.details)) {
      const mismatch = versionMismatchFromDetails(err.details);
      if (mismatch) {
        return { code: "VERSION_MISMATCH", message: directMsg, versionMismatch: mismatch };
      }
    }

    if (typeof err.error === "string" && err.error === "VERSION_MISMATCH" && isObject(err.details)) {
      const mismatch = versionMismatchFromDetails(err.details);
      if (mismatch) {
        return { code: "VERSION_MISMATCH", message: directMsg, versionMismatch: mismatch };
      }
    }

    if (isObject(err.body) && typeof err.body.error === "string" && err.body.error === "VERSION_MISMATCH") {
      const details = isObject(err.body.details) ? err.body.details : undefined;
      if (details) {
        const mismatch = versionMismatchFromDetails(details);
        if (mismatch) {
          return { code: "VERSION_MISMATCH", message: directMsg, versionMismatch: mismatch };
        }
      }
    }

    return {
      code: directCode ?? "UNKNOWN",
      message: directMsg,
    };
  }

  return {
    code: "UNKNOWN",
    message: err instanceof Error ? err.message : String(err),
  };
}

export function computeBackoffDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterRatio: number,
  random: () => number,
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = exp * jitterRatio;
  const delta = (random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(exp + delta));
}

export class InMemoryOutboxStore implements OutboxStore {
  private entries: OutboxEntry[] = [];

  async load(): Promise<OutboxEntry[]> {
    return this.entries.map((e) => ({ ...e, request: { ...e.request } }));
  }

  async save(entries: OutboxEntry[]): Promise<void> {
    this.entries = entries.map((e) => ({ ...e, request: { ...e.request } }));
  }
}

export class SyncOutboxClient {
  private loaded = false;
  private entries: OutboxEntry[] = [];
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitterRatio: number;
  private readonly maxQueueSize: number;
  private readonly nowMs: () => number;
  private readonly random: () => number;

  constructor(
    private readonly store: OutboxStore,
    private readonly transport: OutboxTransport,
    private readonly options: OutboxClientOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO;
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.random = options.random ?? (() => Math.random());
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.entries = await this.store.load();
    this.loaded = true;
  }

  private async flush(): Promise<void> {
    await this.store.save(this.entries);
  }

  async enqueue(payload: OutboxEntryPayload): Promise<OutboxEntry> {
    await this.ensureLoaded();
    if (this.entries.length >= this.maxQueueSize) {
      throw new Error("OUTBOX_CAPACITY_REACHED");
    }
    const now = this.nowMs();
    const entry: OutboxEntry = {
      id: generateEntityId(),
      vaultId: payload.vaultId,
      request: { ...payload.request },
      status: "pending",
      attemptCount: 0,
      createdAtMs: now,
      updatedAtMs: now,
      nextAttemptAtMs: now,
    };
    this.entries.push(entry);
    await this.flush();
    return { ...entry, request: { ...entry.request } };
  }

  async list(): Promise<OutboxEntry[]> {
    await this.ensureLoaded();
    return this.entries.map((e) => ({ ...e, request: { ...e.request } }));
  }

  async retryAll(): Promise<void> {
    await this.ensureLoaded();
    const now = this.nowMs();
    for (const e of this.entries) {
      if (e.status === "failed" || e.status === "dead") {
        e.status = "pending";
        e.nextAttemptAtMs = now;
        e.updatedAtMs = now;
      }
    }
    await this.flush();
  }

  private nextSendableEntry(vaultId?: string): OutboxEntry | undefined {
    const now = this.nowMs();
    return this.entries
      .filter((e) => (!vaultId || e.vaultId === vaultId) && (e.status === "pending" || e.status === "failed") && e.nextAttemptAtMs <= now)
      .sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id))[0];
  }

  private async fetchAllAfterVersion(vaultId: string, afterVersion: number): Promise<SyncEventWireDto[]> {
    const out: SyncEventWireDto[] = [];
    let cursor = afterVersion;
    while (true) {
      const page = await this.transport.listVaultEvents(vaultId, cursor);
      if (!page.events.length) break;
      out.push(...page.events);
      const next = page.events[page.events.length - 1]?.version ?? cursor;
      if (next <= cursor) break;
      cursor = next;
      if (!eventsListHasMore(page)) break;
    }
    return out;
  }

  private remoteEventsTouchItem(events: SyncEventWireDto[], itemId: string): boolean {
    const itemTypes = new Set(["ITEM_CREATE", "ITEM_UPDATE", "ITEM_DELETE"]);
    return events.some(
      (event) => itemTypes.has(event.eventType) && event.referencedItemId === itemId,
    );
  }

  private async handleVersionMismatch(entry: OutboxEntry, conflict: VersionMismatchDetails): Promise<void> {
    const remoteEvents = await this.fetchAllAfterVersion(entry.vaultId, conflict.expectedBaseVersion);
    const decryptItemPayload =
      this.options.decryptItemPayloadForVault != null
        ? (encryptedPayloadBase64: string, itemId?: string | null) =>
            this.options.decryptItemPayloadForVault!(entry.vaultId, encryptedPayloadBase64, itemId)
        : this.options.replayOptions?.decryptItemPayload;
    const replay = await replayVaultEvents(remoteEvents, {
      vaultId: entry.vaultId,
      initialLastAppliedVersion: conflict.expectedBaseVersion,
      ...this.options.replayOptions,
      ...(decryptItemPayload ? { decryptItemPayload } : {}),
    });

    const referencedItemId = entry.request.referencedItemId;
    const isSameItemMutation =
      (entry.request.eventType === "ITEM_UPDATE" || entry.request.eventType === "ITEM_DELETE") &&
      typeof referencedItemId === "string" &&
      referencedItemId.length > 0;
    // Peer already wrote this item since our baseVersion — do not last-writer-wins overwrite.
    const touchedViaWire =
      isSameItemMutation && referencedItemId
        ? this.remoteEventsTouchItem(remoteEvents, referencedItemId)
        : false;
    const touchedViaReplay =
      isSameItemMutation && referencedItemId ? replay.items.has(referencedItemId) : false;
    if (touchedViaWire || touchedViaReplay) {
      entry.status = "dead";
      entry.lastErrorCode = ITEM_UPDATE_CONFLICT;
      entry.lastErrorMessage = "item was updated concurrently";
      entry.nextAttemptAtMs = Number.MAX_SAFE_INTEGER;
      entry.updatedAtMs = this.nowMs();
      return;
    }

    if (entry.request.eventType === "ITEM_UPDATE" && this.options.rebaseItemUpdate) {
      const rebased = await this.options.rebaseItemUpdate({
        entry,
        latestVersion: conflict.latestVersion,
        state: replay,
      });
      const rebasedAny = rebased as { encryptedBlob?: unknown; encryptedPayload?: string; payloadSchemaVersion?: number };
      if (rebasedAny.encryptedBlob) {
        entry.request.encryptedBlob = rebasedAny.encryptedBlob as SyncAppendEventRequestDto["encryptedBlob"];
      } else if (rebasedAny.encryptedPayload) {
        entry.request.encryptedBlob = {
          crypto_version: rebasedAny.payloadSchemaVersion ?? 2,
          algorithm: "opaque",
          payload: rebasedAny.encryptedPayload,
          meta: {},
        };
      }
    }

    entry.request.baseVersion = conflict.latestVersion;
    entry.status = "pending";
    entry.nextAttemptAtMs = this.nowMs();
    entry.lastErrorCode = undefined;
    entry.lastErrorMessage = undefined;
    entry.updatedAtMs = this.nowMs();
    this.options.hooks?.onConflictResolved?.(entry);
  }

  private nextSendableBatch(vaultId?: string): OutboxEntry[] {
    const first = this.nextSendableEntry(vaultId);
    if (!first) {
      return [];
    }
    const now = this.nowMs();
    const batch: OutboxEntry[] = [first];
    const rest = this.entries
      .filter(
        (e) =>
          e.id !== first.id &&
          e.vaultId === first.vaultId &&
          (e.status === "pending" || e.status === "failed") &&
          e.nextAttemptAtMs <= now,
      )
      .sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
    for (const entry of rest) {
      if (batch.length >= SYNC_EVENTS_BATCH_MAX) {
        break;
      }
      batch.push(entry);
    }
    return batch;
  }

  private renumberPendingBaseVersions(vaultId: string, startVersion: number): void {
    const now = this.nowMs();
    const pending = this.entries
      .filter(
        (e) =>
          e.vaultId === vaultId &&
          (e.status === "pending" || e.status === "failed") &&
          e.nextAttemptAtMs <= now,
      )
      .sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
    let version = startVersion;
    for (const entry of pending) {
      entry.request = { ...entry.request, baseVersion: version };
      entry.updatedAtMs = now;
      version += 1;
    }
  }

  /**
   * Drain pending appends. Returns successfully appended wire events in order
   * so callers can materialize local state without a follow-up list GET when
   * versions are contiguous from the last applied tip.
   */
  async drain(vaultId?: string): Promise<SyncEventWireDto[]> {
    await this.ensureLoaded();
    const appended: SyncEventWireDto[] = [];
    const canBatch = typeof this.transport.appendVaultEventsBatch === "function";

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = canBatch ? this.nextSendableBatch(vaultId) : [];
      const entry = batch.length >= 2 ? undefined : this.nextSendableEntry(vaultId);
      if (batch.length < 2 && !entry) {
        const stalled = this.entries.filter((e) => e.status === "dead");
        if (stalled.length) {
          this.options.hooks?.onQueueStalled?.(stalled.map((e) => ({ ...e, request: { ...e.request } })));
        }
        await this.flush();
        return appended;
      }

      if (batch.length >= 2) {
        for (const e of batch) {
          e.status = "sending";
          e.updatedAtMs = this.nowMs();
        }
        await this.flush();
        try {
          const response = await this.transport.appendVaultEventsBatch!(batch[0]!.vaultId, {
            events: batch.map((e) => e.request),
          });
          appended.push(...response.events);
          const sentIds = new Set(batch.map((e) => e.id));
          this.entries = this.entries.filter((e) => !sentIds.has(e.id));
          await this.flush();
          continue;
        } catch (err) {
          const parsed = toOutboxError(err);
          if (parsed.versionMismatch) {
            const first = batch[0]!;
            await this.handleVersionMismatch(first, parsed.versionMismatch);
            // Peer writes moved the tip — renumber the whole pending queue for this vault.
            this.renumberPendingBaseVersions(first.vaultId, first.request.baseVersion);
            for (const e of batch) {
              if (e.id !== first.id && e.status === "sending") {
                e.status = "pending";
                e.nextAttemptAtMs = this.nowMs();
                e.updatedAtMs = this.nowMs();
              }
            }
            await this.flush();
            continue;
          }

          for (const e of batch) {
            e.attemptCount += 1;
            e.lastErrorCode = parsed.code;
            e.lastErrorMessage = parsed.message;
            e.updatedAtMs = this.nowMs();
            if (e.attemptCount >= this.maxAttempts) {
              e.status = "dead";
              e.nextAttemptAtMs = Number.MAX_SAFE_INTEGER;
            } else {
              e.status = "failed";
              e.nextAttemptAtMs =
                this.nowMs() +
                computeBackoffDelayMs(
                  e.attemptCount,
                  this.baseDelayMs,
                  this.maxDelayMs,
                  this.jitterRatio,
                  this.random,
                );
            }
          }
          await this.flush();
          continue;
        }
      }

      const single = entry!;
      single.status = "sending";
      single.updatedAtMs = this.nowMs();
      await this.flush();

      try {
        const created = await this.transport.appendVaultEvent(single.vaultId, single.request);
        appended.push(created);
        this.entries = this.entries.filter((e) => e.id !== single.id);
        await this.flush();
        continue;
      } catch (err) {
        const parsed = toOutboxError(err);
        if (parsed.versionMismatch) {
          await this.handleVersionMismatch(single, parsed.versionMismatch);
          this.renumberPendingBaseVersions(single.vaultId, single.request.baseVersion);
          await this.flush();
          continue;
        }

        single.attemptCount += 1;
        single.lastErrorCode = parsed.code;
        single.lastErrorMessage = parsed.message;
        single.updatedAtMs = this.nowMs();
        if (single.attemptCount >= this.maxAttempts) {
          single.status = "dead";
          single.nextAttemptAtMs = Number.MAX_SAFE_INTEGER;
        } else {
          single.status = "failed";
          single.nextAttemptAtMs =
            this.nowMs() +
            computeBackoffDelayMs(
              single.attemptCount,
              this.baseDelayMs,
              this.maxDelayMs,
              this.jitterRatio,
              this.random,
            );
        }
        await this.flush();
      }
    }
  }
}
