import {
  PLAN_QUOTA_EXCEEDED,
  SYNC_EVENTS_BATCH_MAX,
  type SyncAppendEventRequestDto,
  type SyncAppendEventsBatchResponseDto,
  type SyncEventWireDto,
  type SyncEventsListResponseDto,
} from "@okkey/types";
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
  /**
   * Optional batch append. Drain uses it when at least two pending entries
   * share a vault. Each event keeps its idempotency key so a retry cannot
   * insert a second row.
   */
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
  /** Test hook. Production waits out the backoff delay. */
  sleep?: (ms: number) => Promise<void>;
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
type OutboxParsedError = {
  code: string;
  message: string;
  status?: number;
  versionMismatch?: VersionMismatchDetails;
};

function readHttpStatus(err: Record<string, unknown>): number | undefined {
  if (typeof err.status === "number") return err.status;
  if (typeof err.statusCode === "number") return err.statusCode;
  return undefined;
}

function toOutboxError(err: unknown): OutboxParsedError {
  if (isObject(err)) {
    const directCode = typeof err.code === "string" ? err.code : undefined;
    const directMsg = typeof err.message === "string" ? err.message : "unknown error";
    const status = readHttpStatus(err);

    if (directCode === "VERSION_MISMATCH" && isObject(err.details)) {
      const mismatch = versionMismatchFromDetails(err.details);
      if (mismatch) {
        return { code: "VERSION_MISMATCH", message: directMsg, status, versionMismatch: mismatch };
      }
    }

    if (typeof err.error === "string" && err.error === "VERSION_MISMATCH" && isObject(err.details)) {
      const mismatch = versionMismatchFromDetails(err.details);
      if (mismatch) {
        return { code: "VERSION_MISMATCH", message: directMsg, status, versionMismatch: mismatch };
      }
    }

    if (isObject(err.body) && typeof err.body.error === "string" && err.body.error === "VERSION_MISMATCH") {
      const details = isObject(err.body.details) ? err.body.details : undefined;
      if (details) {
        const mismatch = versionMismatchFromDetails(details);
        if (mismatch) {
          return { code: "VERSION_MISMATCH", message: directMsg, status, versionMismatch: mismatch };
        }
      }
    }

    if (isObject(err.body) && typeof err.body.error === "string") {
      const bodyMessage = typeof err.body.message === "string" ? err.body.message.trim() : "";
      return {
        code: err.body.error,
        message: bodyMessage || directMsg,
        status,
      };
    }

    return {
      code: directCode ?? "UNKNOWN",
      message: directMsg,
      status,
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
  private readonly sleep: (ms: number) => Promise<void>;

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
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
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
        (entry) =>
          entry.id !== first.id &&
          entry.vaultId === first.vaultId &&
          (entry.status === "pending" || entry.status === "failed") &&
          entry.nextAttemptAtMs <= now,
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

  /** Assign contiguous base versions to every due entry, oldest first. */
  private renumberPendingBaseVersions(vaultId: string, startVersion: number): void {
    const now = this.nowMs();
    const pending = this.entries
      .filter(
        (entry) =>
          entry.vaultId === vaultId &&
          (entry.status === "pending" || entry.status === "failed") &&
          entry.nextAttemptAtMs <= now,
      )
      .sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
    let version = startVersion;
    for (const entry of pending) {
      entry.request = { ...entry.request, baseVersion: version };
      entry.updatedAtMs = now;
      version += 1;
    }
  }

  private isTerminalConflict(parsed: OutboxParsedError): boolean {
    if (parsed.versionMismatch) {
      return false;
    }
    return (
      parsed.status === 409 ||
      parsed.code === "VERSION_MISMATCH" ||
      parsed.code === "SYNC_ITEM_ALREADY_EXISTS"
    );
  }

  private applyTransportFailure(entry: OutboxEntry, parsed: OutboxParsedError): void {
    entry.attemptCount += 1;
    entry.lastErrorCode = parsed.code;
    entry.lastErrorMessage = parsed.message;
    entry.updatedAtMs = this.nowMs();
    if (
      this.isTerminalConflict(parsed) ||
      entry.attemptCount >= this.maxAttempts ||
      parsed.code === PLAN_QUOTA_EXCEEDED
    ) {
      entry.status = "dead";
      entry.nextAttemptAtMs = Number.MAX_SAFE_INTEGER;
      return;
    }
    entry.status = "failed";
    entry.nextAttemptAtMs =
      this.nowMs() +
      computeBackoffDelayMs(
        entry.attemptCount,
        this.baseDelayMs,
        this.maxDelayMs,
        this.jitterRatio,
        this.random,
      );
  }

  private failConflict(entries: OutboxEntry[], parsed: OutboxParsedError): void {
    const now = this.nowMs();
    for (const entry of entries) {
      entry.status = "dead";
      entry.lastErrorCode = parsed.code || "VERSION_MISMATCH";
      entry.lastErrorMessage = parsed.message;
      entry.nextAttemptAtMs = Number.MAX_SAFE_INTEGER;
      entry.updatedAtMs = now;
    }
  }

  /**
   * One rebase for this conflict. Every in-flight entry is pending before
   * renumber so a later sibling is not left on a stale baseVersion.
   */
  private async recoverVersionMismatch(
    batch: OutboxEntry[],
    conflict: VersionMismatchDetails,
  ): Promise<void> {
    const now = this.nowMs();
    for (const entry of batch) {
      if (entry.status === "sending") {
        entry.status = "pending";
        entry.nextAttemptAtMs = now;
        entry.updatedAtMs = now;
      }
    }
    const first = batch[0]!;
    await this.handleVersionMismatch(first, conflict);
    const start =
      first.status === "dead" ? conflict.latestVersion : first.request.baseVersion;
    this.renumberPendingBaseVersions(first.vaultId, start);
  }

  private async sendOne(
    entry: OutboxEntry,
    appended: SyncEventWireDto[],
    rebasedOnce: Set<string>,
  ): Promise<void> {
    entry.status = "sending";
    entry.updatedAtMs = this.nowMs();
    await this.flush();
    try {
      const created = await this.transport.appendVaultEvent(entry.vaultId, entry.request);
      appended.push(created);
      this.entries = this.entries.filter((candidate) => candidate.id !== entry.id);
      await this.flush();
    } catch (err) {
      const parsed = toOutboxError(err);
      if (parsed.versionMismatch) {
        if (rebasedOnce.has(entry.id)) {
          this.failConflict([entry], parsed);
          await this.flush();
          return;
        }
        rebasedOnce.add(entry.id);
        await this.recoverVersionMismatch([entry], parsed.versionMismatch);
        await this.flush();
        return;
      }
      this.applyTransportFailure(entry, parsed);
      await this.flush();
    }
  }

  /**
   * @returns true when this batch failed and later events for the vault must
   * wait, so a following chunk is not appended against a tip the failed batch
   * has not moved yet.
   */
  private async sendBatch(
    batch: OutboxEntry[],
    appended: SyncEventWireDto[],
    rebasedOnce: Set<string>,
  ): Promise<boolean> {
    const sendBatch = this.transport.appendVaultEventsBatch;
    if (!sendBatch) {
      return false;
    }
    const now = this.nowMs();
    for (const entry of batch) {
      entry.status = "sending";
      entry.updatedAtMs = now;
    }
    await this.flush();
    try {
      const response = await sendBatch(batch[0]!.vaultId, {
        events: batch.map((entry) => entry.request),
      });
      appended.push(...response.events);
      const sentIds = new Set(batch.map((entry) => entry.id));
      this.entries = this.entries.filter((entry) => !sentIds.has(entry.id));
      await this.flush();
      return false;
    } catch (err) {
      const parsed = toOutboxError(err);
      if (parsed.versionMismatch) {
        if (batch.every((entry) => rebasedOnce.has(entry.id))) {
          this.failConflict(batch, parsed);
          await this.flush();
          return true;
        }
        for (const entry of batch) {
          rebasedOnce.add(entry.id);
        }
        await this.recoverVersionMismatch(batch, parsed.versionMismatch);
        await this.flush();
        return false;
      }
      for (const entry of batch) {
        this.applyTransportFailure(entry, parsed);
      }
      await this.flush();
      return true;
    }
  }

  private finishDrain(appended: SyncEventWireDto[]): SyncEventWireDto[] {
    const stalled = this.entries.filter((entry) => entry.status === "dead");
    if (stalled.length) {
      this.options.hooks?.onQueueStalled?.(
        stalled.map((entry) => ({ ...entry, request: { ...entry.request } })),
      );
    }
    return appended;
  }

  /**
   * Drain pending appends. Returns successfully appended wire events in order
   * so callers can materialize local state without a follow-up list GET when
   * versions are contiguous from the last applied tip.
   *
   * A 409 is handled once: version mismatch is rebased and retried a single
   * time, any other conflict is reported and not retried. Transient failures
   * take one attempt here and wait out their backoff.
   */
  async drain(vaultId?: string): Promise<SyncEventWireDto[]> {
    await this.ensureLoaded();
    const appended: SyncEventWireDto[] = [];
    const rebasedOnce = new Set<string>();
    const canBatch = typeof this.transport.appendVaultEventsBatch === "function";
    const maxSteps = Math.max(8, this.entries.length * 3 + 8);
    let steps = 0;

    while (true) {
      steps += 1;
      if (steps > maxSteps) {
        const now = this.nowMs();
        for (const entry of this.entries) {
          if (entry.status === "sending" || entry.status === "pending") {
            entry.status = "failed";
            entry.lastErrorCode = entry.lastErrorCode ?? "UNKNOWN";
            entry.lastErrorMessage = entry.lastErrorMessage ?? "drain step limit";
            entry.nextAttemptAtMs = now + this.maxDelayMs;
            entry.updatedAtMs = now;
          }
        }
        await this.flush();
        return this.finishDrain(appended);
      }

      const batch = canBatch ? this.nextSendableBatch(vaultId) : [];
      if (batch.length >= 2) {
        const halt = await this.sendBatch(batch, appended, rebasedOnce);
        if (halt) {
          return this.finishDrain(appended);
        }
        continue;
      }

      const entry = this.nextSendableEntry(vaultId);
      if (!entry) {
        await this.flush();
        return this.finishDrain(appended);
      }
      await this.sendOne(entry, appended, rebasedOnce);
    }
  }

  /**
   * Drain, then retry entries that are waiting on backoff. Stops after
   * `maxRounds` passes or when nothing retryable remains. Conflicts marked
   * dead are not retried.
   */
  async drainRetrying(vaultId?: string, maxRounds?: number): Promise<SyncEventWireDto[]> {
    await this.ensureLoaded();
    const rounds = Math.max(1, maxRounds ?? this.maxAttempts);
    const appended: SyncEventWireDto[] = [];
    for (let round = 0; round < rounds; round += 1) {
      appended.push(...(await this.drain(vaultId)));
      const waiting = this.entries.filter(
        (entry) =>
          (!vaultId || entry.vaultId === vaultId) &&
          entry.status === "failed" &&
          entry.nextAttemptAtMs > this.nowMs(),
      );
      if (waiting.length === 0 || round === rounds - 1) {
        return appended;
      }
      const nextAt = Math.min(...waiting.map((entry) => entry.nextAttemptAtMs));
      const delay = Math.min(this.maxDelayMs, Math.max(0, nextAt - this.nowMs()));
      await this.sleep(delay);
    }
    return appended;
  }
}
