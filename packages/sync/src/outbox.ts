import type { SyncAppendEventRequestDto, SyncEventWireDto, SyncEventsListResponseDto } from "@okkey/types";
import { generateEntityId } from "@okkey/id";
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

export interface OutboxClientOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  maxQueueSize?: number;
  nowMs?: () => number;
  random?: () => number;
  replayOptions?: Omit<ReplayEngineOptions, "vaultId" | "initialLastAppliedVersion">;
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

function toOutboxError(err: unknown): { code: string; message: string; versionMismatch?: VersionMismatchDetails } {
  if (isObject(err)) {
    const directCode = typeof err.code === "string" ? err.code : undefined;
    const directMsg = typeof err.message === "string" ? err.message : "unknown error";
    if (directCode === "VERSION_MISMATCH" && isObject(err.details)) {
      const d = err.details;
      if (
        d.code === "VERSION_MISMATCH" &&
        typeof d.expectedBaseVersion === "number" &&
        typeof d.latestVersion === "number"
      ) {
        return {
          code: "VERSION_MISMATCH",
          message: directMsg,
          versionMismatch: {
            code: "VERSION_MISMATCH",
            expectedBaseVersion: d.expectedBaseVersion,
            latestVersion: d.latestVersion,
          },
        };
      }
    }

    if (isObject(err.body) && isObject(err.body.details)) {
      const details = err.body.details;
      if (
        details.code === "VERSION_MISMATCH" &&
        typeof details.expectedBaseVersion === "number" &&
        typeof details.latestVersion === "number"
      ) {
        return {
          code: "VERSION_MISMATCH",
          message: directMsg,
          versionMismatch: {
            code: "VERSION_MISMATCH",
            expectedBaseVersion: details.expectedBaseVersion,
            latestVersion: details.latestVersion,
          },
        };
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
    }
    return out;
  }

  private async handleVersionMismatch(entry: OutboxEntry, conflict: VersionMismatchDetails): Promise<void> {
    const remoteEvents = await this.fetchAllAfterVersion(entry.vaultId, conflict.expectedBaseVersion);
    const replay = await replayVaultEvents(remoteEvents, {
      vaultId: entry.vaultId,
      initialLastAppliedVersion: conflict.expectedBaseVersion,
      ...this.options.replayOptions,
    });

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

  async drain(vaultId?: string): Promise<void> {
    await this.ensureLoaded();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const entry = this.nextSendableEntry(vaultId);
      if (!entry) {
        const stalled = this.entries.filter((e) => e.status === "dead");
        if (stalled.length) {
          this.options.hooks?.onQueueStalled?.(stalled.map((e) => ({ ...e, request: { ...e.request } })));
        }
        await this.flush();
        return;
      }

      entry.status = "sending";
      entry.updatedAtMs = this.nowMs();
      await this.flush();

      try {
        await this.transport.appendVaultEvent(entry.vaultId, entry.request);
        this.entries = this.entries.filter((e) => e.id !== entry.id);
        await this.flush();
        continue;
      } catch (err) {
        const parsed = toOutboxError(err);
        if (parsed.versionMismatch) {
          await this.handleVersionMismatch(entry, parsed.versionMismatch);
          await this.flush();
          continue;
        }

        entry.attemptCount += 1;
        entry.lastErrorCode = parsed.code;
        entry.lastErrorMessage = parsed.message;
        entry.updatedAtMs = this.nowMs();
        if (entry.attemptCount >= this.maxAttempts) {
          entry.status = "dead";
          entry.nextAttemptAtMs = Number.MAX_SAFE_INTEGER;
        } else {
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
        await this.flush();
      }
    }
  }
}
