import type {
  SyncAppendEventRequestDto,
  WorkspacePersonalEventWireDto,
  WorkspacePersonalEventsListResponseDto,
} from "@okkey/types";
import { generateEntityId } from "@okkey/id";
import { replayWorkspaceFolderEvents } from "./workspace-folder-replay.js";

export type WorkspacePersonalOutboxEntryStatus = "pending" | "sending" | "failed" | "dead";

export interface WorkspacePersonalOutboxEntryPayload {
  workspaceId: string;
  request: SyncAppendEventRequestDto;
}

export interface WorkspacePersonalOutboxEntry extends WorkspacePersonalOutboxEntryPayload {
  id: string;
  status: WorkspacePersonalOutboxEntryStatus;
  attemptCount: number;
  createdAtMs: number;
  updatedAtMs: number;
  nextAttemptAtMs: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

export interface WorkspacePersonalOutboxStore {
  load(): Promise<WorkspacePersonalOutboxEntry[]>;
  save(entries: WorkspacePersonalOutboxEntry[]): Promise<void>;
}

export interface WorkspacePersonalOutboxTransport {
  appendWorkspacePersonalEvent(
    workspaceId: string,
    body: SyncAppendEventRequestDto,
  ): Promise<WorkspacePersonalEventWireDto>;
  listWorkspacePersonalEvents(
    workspaceId: string,
    afterVersion: number,
  ): Promise<WorkspacePersonalEventsListResponseDto>;
}

export interface WorkspacePersonalVersionMismatchDetails {
  code: "VERSION_MISMATCH";
  expectedBaseVersion: number;
  latestVersion: number;
}

export interface WorkspacePersonalOutboxClientOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  maxQueueSize?: number;
  nowMs?: () => number;
  random?: () => number;
  decryptPersonalMetadataPayload?: (encryptedPayloadBase64: string) => Promise<Uint8Array>;
}

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 30_000;
const DEFAULT_JITTER_RATIO = 0.2;
const DEFAULT_MAX_QUEUE_SIZE = 5_000;

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function computeWorkspacePersonalBackoffDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterRatio: number,
  random: () => number,
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = exp * jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.round(exp + jitter));
}

function toOutboxError(err: unknown): {
  code: string;
  message: string;
  versionMismatch?: WorkspacePersonalVersionMismatchDetails;
} {
  if (isObject(err)) {
    const directCode = typeof err.code === "string" ? err.code : undefined;
    const directMsg = typeof err.message === "string" ? err.message : "unknown error";

    const versionMismatchFromDetails = (
      details: Record<string, unknown>,
    ): WorkspacePersonalVersionMismatchDetails | undefined => {
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
    };

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

    return { code: directCode ?? "UNKNOWN", message: directMsg };
  }
  return { code: "UNKNOWN", message: err instanceof Error ? err.message : String(err) };
}

export class InMemoryWorkspacePersonalOutboxStore implements WorkspacePersonalOutboxStore {
  private entries: WorkspacePersonalOutboxEntry[] = [];

  async load(): Promise<WorkspacePersonalOutboxEntry[]> {
    return this.entries.map((e) => ({ ...e, request: { ...e.request } }));
  }

  async save(entries: WorkspacePersonalOutboxEntry[]): Promise<void> {
    this.entries = entries.map((e) => ({ ...e, request: { ...e.request } }));
  }
}

export class WorkspacePersonalOutboxClient {
  private loaded = false;
  private entries: WorkspacePersonalOutboxEntry[] = [];
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitterRatio: number;
  private readonly maxQueueSize: number;
  private readonly nowMs: () => number;
  private readonly random: () => number;

  constructor(
    private readonly store: WorkspacePersonalOutboxStore,
    private readonly transport: WorkspacePersonalOutboxTransport,
    private readonly options: WorkspacePersonalOutboxClientOptions = {},
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

  async enqueue(payload: WorkspacePersonalOutboxEntryPayload): Promise<WorkspacePersonalOutboxEntry> {
    await this.ensureLoaded();
    if (this.entries.length >= this.maxQueueSize) {
      throw new Error("OUTBOX_CAPACITY_REACHED");
    }
    const now = this.nowMs();
    const entry: WorkspacePersonalOutboxEntry = {
      id: generateEntityId(),
      workspaceId: payload.workspaceId,
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

  async list(): Promise<WorkspacePersonalOutboxEntry[]> {
    await this.ensureLoaded();
    return this.entries.map((e) => ({ ...e, request: { ...e.request } }));
  }

  private nextSendableEntry(workspaceId?: string): WorkspacePersonalOutboxEntry | undefined {
    const now = this.nowMs();
    return this.entries
      .filter(
        (e) =>
          (!workspaceId || e.workspaceId === workspaceId) &&
          (e.status === "pending" || e.status === "failed") &&
          e.nextAttemptAtMs <= now,
      )
      .sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id))[0];
  }

  private async fetchAllAfterVersion(
    workspaceId: string,
    afterVersion: number,
  ): Promise<WorkspacePersonalEventWireDto[]> {
    const out: WorkspacePersonalEventWireDto[] = [];
    let cursor = afterVersion;
    while (true) {
      const page = await this.transport.listWorkspacePersonalEvents(workspaceId, cursor);
      if (!page.events.length) break;
      out.push(...page.events);
      const next = page.events[page.events.length - 1]?.version ?? cursor;
      if (next <= cursor) break;
      cursor = next;
    }
    return out;
  }

  private async handleVersionMismatch(
    entry: WorkspacePersonalOutboxEntry,
    conflict: WorkspacePersonalVersionMismatchDetails,
  ): Promise<void> {
    if (this.options.decryptPersonalMetadataPayload) {
      const remoteEvents = await this.fetchAllAfterVersion(
        entry.workspaceId,
        conflict.expectedBaseVersion,
      );
      await replayWorkspaceFolderEvents(
        remoteEvents,
        entry.workspaceId,
        this.options.decryptPersonalMetadataPayload,
        conflict.expectedBaseVersion,
      );
    }
    entry.request.baseVersion = conflict.latestVersion;
    entry.status = "pending";
    entry.nextAttemptAtMs = this.nowMs();
    entry.lastErrorCode = undefined;
    entry.lastErrorMessage = undefined;
    entry.updatedAtMs = this.nowMs();
  }

  async drain(workspaceId?: string): Promise<void> {
    await this.ensureLoaded();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const entry = this.nextSendableEntry(workspaceId);
      if (!entry) {
        await this.flush();
        return;
      }

      entry.status = "sending";
      entry.updatedAtMs = this.nowMs();
      await this.flush();

      try {
        await this.transport.appendWorkspacePersonalEvent(entry.workspaceId, entry.request);
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
            computeWorkspacePersonalBackoffDelayMs(
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
