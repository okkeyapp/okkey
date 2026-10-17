import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { Logger } from "../logger.ts";
import {
  extractLeadingEmailVerificationCode,
  formatEmailFailureReason,
  isRetryableEmailSendFailure,
  redactEmailMessageForDeadLetter,
  sanitizeEmailSubjectForLogs,
} from "./errors.ts";
import type { EmailMessage, EmailSender } from "./service.ts";


/** Ready jobs waiting for a worker (Redis LIST). */
export const EMAIL_QUEUE_KEY = "okkey:email:queue";
/** Delayed retries (Redis ZSET, score = unix ms when eligible). */
export const EMAIL_DELAYED_KEY = "okkey:email:delayed";
/** Dead-letter after max attempts (Redis LIST). */
export const EMAIL_DEAD_KEY = "okkey:email:dead";

/** Domain-separated label so the seal key is not shared with other SESSION_SECRET derivations. */
const DEAD_LETTER_SEAL_LABEL = "okkey:email:dead-letter-seal:v1";

export type EmailDeliveryMode = "sync" | "queue";

export type EmailJob = {
  id: string;
  createdAt: string;
  attempts: number;
  message: EmailMessage;
  lastError?: string;
  /**
   * Sealed original `message` for dead-letter jobs whose open fields were redacted.
   * Re-queue the same JSON onto `okkey:email:queue`; the consumer unseals before send
   * and removes a matching copy from the dead-letter list.
   */
  sealedDelivery?: string;
};

export type EmailQueueRedis = {
  lPush(key: string, ...values: string[]): Promise<number>;
  rPop(key: string): Promise<string | null>;
  /** Blocking pop from the right; timeoutSeconds 0 = wait forever. Returns null on timeout. */
  brPop(key: string, timeoutSeconds: number): Promise<string | null>;
  /** Remove up to `count` matching members (0 = all). */
  lRem(key: string, count: number, element: string): Promise<number>;
  zAdd(key: string, score: number, member: string): Promise<number>;
  zRangeByScore(key: string, min: number, max: number, limit: number): Promise<string[]>;
  zRem(key: string, ...members: string[]): Promise<number>;
};

export type EmailQueueOptions = {
  maxAttempts?: number;
  /** Base backoff in ms; attempt n waits base * 2^(n-1). */
  backoffBaseMs?: number;
  maxBackoffMs?: number;
};

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BACKOFF_BASE_MS = 2_000;
const DEFAULT_MAX_BACKOFF_MS = 120_000;

export function resolveEmailDeliveryMode(
  nodeEnv: string,
  envValue: string | undefined = process.env.EMAIL_DELIVERY_MODE,
): EmailDeliveryMode {
  if (envValue !== undefined) {
    const normalized = envValue.toLowerCase().trim();
    if (normalized === "sync" || normalized === "immediate") {
      return "sync";
    }
    if (normalized === "queue" || normalized === "async" || normalized === "redis") {
      return "queue";
    }
  }
  // Production self-host / SaaS: queue. Local + tests: sync (logger works without worker).
  return nodeEnv === "production" ? "queue" : "sync";
}

export function computeEmailRetryDelayMs(
  attemptsAfterFailure: number,
  options: EmailQueueOptions = {},
): number {
  const base = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const max = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const exp = Math.max(0, attemptsAfterFailure - 1);
  return Math.min(max, base * 2 ** exp);
}

export function serializeEmailJob(job: EmailJob): string {
  return JSON.stringify(job);
}

export function parseEmailJob(raw: string): EmailJob {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("email job payload is not an object");
  }
  const record = parsed as Record<string, unknown>;
  const message = record.message;
  if (!message || typeof message !== "object") {
    throw new Error("email job missing message");
  }
  const msg = message as Record<string, unknown>;
  for (const field of ["to", "from", "subject", "text", "html"] as const) {
    if (typeof msg[field] !== "string") {
      throw new Error(`email job message.${field} must be a string`);
    }
  }
  const inlineAttachments = parseInlineAttachments(msg.inlineAttachments);
  const sealedDelivery =
    typeof record.sealedDelivery === "string" && record.sealedDelivery.length > 0
      ? record.sealedDelivery
      : undefined;
  return {
    id: typeof record.id === "string" ? record.id : randomUUID(),
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    attempts: typeof record.attempts === "number" && Number.isFinite(record.attempts) ? record.attempts : 0,
    lastError: typeof record.lastError === "string" ? record.lastError : undefined,
    ...(sealedDelivery ? { sealedDelivery } : {}),
    message: {
      to: msg.to as string,
      from: msg.from as string,
      subject: msg.subject as string,
      text: msg.text as string,
      html: msg.html as string,
      ...(inlineAttachments ? { inlineAttachments } : {}),
    },
  };
}

const SEAL_PREFIX = "v1";

/**
 * Derive a stable AES-256 key from `EMAIL_DEAD_LETTER_SEAL_KEY` (or a fallback secret).
 * Same secret → same key across restarts and worker replicas (no Redis race).
 */
export function resolveDeadLetterSealKey(secret: string): Buffer {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error("email dead-letter seal secret is empty");
  }
  return createHash("sha256").update(`${DEAD_LETTER_SEAL_LABEL}:${trimmed}`, "utf8").digest();
}

/** Seal a full delivery message for storage alongside a redacted dead-letter job. */
export function sealEmailDelivery(message: EmailMessage, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(message), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    SEAL_PREFIX,
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

/** Reverse {@link sealEmailDelivery}. */
export function unsealEmailDelivery(sealed: string, key: Buffer): EmailMessage {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== SEAL_PREFIX) {
    throw new Error("invalid sealed email delivery payload");
  }
  const iv = Buffer.from(parts[1]!, "base64url");
  const encrypted = Buffer.from(parts[2]!, "base64url");
  const tag = Buffer.from(parts[3]!, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const parsed = JSON.parse(plaintext.toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("unsealed email delivery is not an object");
  }
  const msg = parsed as Record<string, unknown>;
  for (const field of ["to", "from", "subject", "text", "html"] as const) {
    if (typeof msg[field] !== "string") {
      throw new Error(`unsealed email delivery.${field} must be a string`);
    }
  }
  const inlineAttachments = parseInlineAttachments(msg.inlineAttachments);
  return {
    to: msg.to as string,
    from: msg.from as string,
    subject: msg.subject as string,
    text: msg.text as string,
    html: msg.html as string,
    ...(inlineAttachments ? { inlineAttachments } : {}),
  };
}

/**
 * Build the Redis dead-letter payload: open fields never contain a verification code;
 * the original message is sealed when a leading code was present.
 */
export function prepareEmailDeadLetterJob(job: EmailJob, sealKey: Buffer): EmailJob {
  const code = extractLeadingEmailVerificationCode(job.message.subject);
  if (!code) {
    // Already redacted (re-dead-letter after requeue) or non-code mail — keep as-is.
    return {
      ...job,
      message: {
        ...job.message,
        subject: sanitizeEmailSubjectForLogs(job.message.subject),
      },
    };
  }
  return {
    ...job,
    message: redactEmailMessageForDeadLetter(job.message),
    sealedDelivery: sealEmailDelivery(job.message, sealKey),
  };
}

/** Resolve the message that should actually be sent (unseal dead-letter requeues). */
export function resolveEmailJobDeliveryMessage(job: EmailJob, sealKey: Buffer): EmailMessage {
  if (!job.sealedDelivery) {
    return job.message;
  }
  return unsealEmailDelivery(job.sealedDelivery, sealKey);
}

function parseInlineAttachments(
  value: unknown,
): EmailMessage["inlineAttachments"] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("email job message.inlineAttachments must be an array");
  }
  if (value.length === 0) {
    return undefined;
  }
  const attachments: NonNullable<EmailMessage["inlineAttachments"]> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      throw new Error("email job inline attachment must be an object");
    }
    const row = item as Record<string, unknown>;
    for (const field of ["cid", "filename", "contentType", "contentBase64"] as const) {
      if (typeof row[field] !== "string" || (row[field] as string).length === 0) {
        throw new Error(`email job inline attachment.${field} must be a non-empty string`);
      }
    }
    attachments.push({
      cid: row.cid as string,
      filename: row.filename as string,
      contentType: row.contentType as string,
      contentBase64: row.contentBase64 as string,
    });
  }
  return attachments;
}

/** API-side sender: enqueue rendered messages instead of hitting SMTP in the request path. */
export class QueuedEmailSender implements EmailSender {
  private readonly redis: EmailQueueRedis;
  private readonly logger?: Pick<Logger, "info" | "warn" | "error">;

  constructor(redis: EmailQueueRedis, logger?: Pick<Logger, "info" | "warn" | "error">) {
    this.redis = redis;
    this.logger = logger;
  }

  async send(message: EmailMessage): Promise<void> {
    const job: EmailJob = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      attempts: 0,
      message,
    };
    await this.redis.lPush(EMAIL_QUEUE_KEY, serializeEmailJob(job));
    this.logger?.info("email enqueued", {
      jobId: job.id,
      to: message.to,
      subject: sanitizeEmailSubjectForLogs(message.subject),
    });
  }
}

export type EmailQueueConsumerHandles = {
  stop(): Promise<void>;
};

export type EmailQueueConsumerDeps = {
  redis: EmailQueueRedis;
  transport: EmailSender;
  logger: Pick<Logger, "info" | "warn" | "error">;
  /** AES-256 key from {@link resolveDeadLetterSealKey} (`EMAIL_DEAD_LETTER_SEAL_KEY` / session secret). */
  deadLetterSealKey: Buffer;
  options?: EmailQueueOptions;
  /** BRPOP timeout; also used as delayed-scan cadence when idle (default 2s). */
  pollTimeoutSeconds?: number;
};

/**
 * Worker loop: BRPOP ready jobs, send via transport, retry with backoff or dead-letter.
 */
export function startEmailQueueConsumer(deps: EmailQueueConsumerDeps): EmailQueueConsumerHandles {
  const maxAttempts = deps.options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const pollTimeoutSeconds = deps.pollTimeoutSeconds ?? 2;
  let stopped = false;
  let loopPromise: Promise<void> | null = null;

  const promoteDelayed = async (): Promise<void> => {
    const now = Date.now();
    const due = await deps.redis.zRangeByScore(EMAIL_DELAYED_KEY, 0, now, 50);
    if (due.length === 0) {
      return;
    }
    for (const member of due) {
      const removed = await deps.redis.zRem(EMAIL_DELAYED_KEY, member);
      if (removed > 0) {
        await deps.redis.lPush(EMAIL_QUEUE_KEY, member);
      }
    }
  };

  const handleFailure = async (job: EmailJob, error: unknown): Promise<void> => {
    const message = formatEmailFailureReason(error);
    const nextAttempts = job.attempts + 1;
    const updated: EmailJob = {
      ...job,
      attempts: nextAttempts,
      lastError: message,
    };
    const retryable = isRetryableEmailSendFailure(error);
    if (!retryable || nextAttempts >= maxAttempts) {
      const deadLetterJob = prepareEmailDeadLetterJob(updated, deps.deadLetterSealKey);
      await deps.redis.lPush(EMAIL_DEAD_KEY, serializeEmailJob(deadLetterJob));
      deps.logger.error("email job dead-lettered", {
        jobId: job.id,
        attempts: nextAttempts,
        to: job.message.to,
        error: message,
        ...(retryable ? {} : { retryable: false }),
      });
      return;
    }
    const delayMs = computeEmailRetryDelayMs(nextAttempts, deps.options);
    const score = Date.now() + delayMs;
    await deps.redis.zAdd(EMAIL_DELAYED_KEY, score, serializeEmailJob(updated));
    deps.logger.warn("email job scheduled for retry", {
      jobId: job.id,
      attempts: nextAttempts,
      delayMs,
      to: job.message.to,
      error: message,
    });
  };

  const processRaw = async (raw: string): Promise<void> => {
    let job: EmailJob;
    try {
      job = parseEmailJob(raw);
    } catch (error) {
      deps.logger.error("email job parse failed; dead-lettering", {
        error: error instanceof Error ? error.message : String(error),
      });
      await deps.redis.lPush(
        EMAIL_DEAD_KEY,
        serializeEmailJob({
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          attempts: DEFAULT_MAX_ATTEMPTS,
          message: { to: "", from: "", subject: "", text: raw.slice(0, 500), html: "" },
          lastError: "invalid job payload",
        }),
      );
      return;
    }

    try {
      const delivery = resolveEmailJobDeliveryMessage(job, deps.deadLetterSealKey);
      await deps.transport.send(delivery);
      // Ops often LPUSH the dead-letter JSON onto the live queue without LREM;
      // drop any exact copy still sitting in the DLQ after a successful send.
      const removed = await deps.redis.lRem(EMAIL_DEAD_KEY, 0, raw);
      deps.logger.info("email job sent", {
        jobId: job.id,
        attempts: job.attempts,
        to: delivery.to,
        subject: sanitizeEmailSubjectForLogs(delivery.subject),
        ...(removed > 0 ? { deadLetterRemoved: removed } : {}),
      });
    } catch (error) {
      await handleFailure(job, error);
    }
  };

  const loop = async (): Promise<void> => {
    deps.logger.info("email queue consumer started", {
      queue: EMAIL_QUEUE_KEY,
      delayed: EMAIL_DELAYED_KEY,
      dead: EMAIL_DEAD_KEY,
      maxAttempts,
    });
    while (!stopped) {
      try {
        await promoteDelayed();
        const raw = await deps.redis.brPop(EMAIL_QUEUE_KEY, pollTimeoutSeconds);
        if (raw) {
          await processRaw(raw);
        }
      } catch (error) {
        if (stopped) {
          break;
        }
        deps.logger.error("email queue consumer iteration failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        await delay(1_000);
      }
    }
    deps.logger.info("email queue consumer stopped");
  };

  loopPromise = loop();

  return {
    async stop() {
      stopped = true;
      await loopPromise;
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** In-memory Redis subset for unit tests. */
export class MemoryEmailQueueRedis implements EmailQueueRedis {
  private readonly lists = new Map<string, string[]>();
  private readonly zsets = new Map<string, Map<string, number>>();
  private readonly waiters: Array<{
    key: string;
    resolve: (value: string | null) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  async lPush(key: string, ...values: string[]): Promise<number> {
    const list = this.lists.get(key) ?? [];
    for (const value of values) {
      list.unshift(value);
    }
    this.lists.set(key, list);
    this.flushWaiters(key);
    return list.length;
  }

  async rPop(key: string): Promise<string | null> {
    const list = this.lists.get(key) ?? [];
    const value = list.pop() ?? null;
    this.lists.set(key, list);
    return value;
  }

  async lRem(key: string, count: number, element: string): Promise<number> {
    const list = this.lists.get(key) ?? [];
    let removed = 0;
    const next: string[] = [];
    if (count === 0) {
      for (const item of list) {
        if (item === element) {
          removed += 1;
        } else {
          next.push(item);
        }
      }
    } else if (count > 0) {
      for (const item of list) {
        if (item === element && removed < count) {
          removed += 1;
        } else {
          next.push(item);
        }
      }
    } else {
      const limit = -count;
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const item = list[i]!;
        if (item === element && removed < limit) {
          removed += 1;
          continue;
        }
        next.unshift(item);
      }
    }
    this.lists.set(key, next);
    return removed;
  }

  async brPop(key: string, timeoutSeconds: number): Promise<string | null> {
    const immediate = await this.rPop(key);
    if (immediate !== null) {
      return immediate;
    }
    if (timeoutSeconds <= 0) {
      return new Promise((resolve) => {
        this.waiters.push({
          key,
          resolve,
          timer: setTimeout(() => {}, 0),
        });
      });
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) {
          this.waiters.splice(idx, 1);
        }
        resolve(null);
      }, timeoutSeconds * 1000);
      this.waiters.push({ key, resolve, timer });
    });
  }

  async zAdd(key: string, score: number, member: string): Promise<number> {
    const set = this.zsets.get(key) ?? new Map<string, number>();
    const existed = set.has(member);
    set.set(member, score);
    this.zsets.set(key, set);
    return existed ? 0 : 1;
  }

  async zRangeByScore(key: string, min: number, max: number, limit: number): Promise<string[]> {
    const set = this.zsets.get(key) ?? new Map<string, number>();
    return [...set.entries()]
      .filter(([, score]) => score >= min && score <= max)
      .sort((a, b) => a[1] - b[1])
      .slice(0, limit)
      .map(([member]) => member);
  }

  async zRem(key: string, ...members: string[]): Promise<number> {
    const set = this.zsets.get(key) ?? new Map<string, number>();
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) {
        removed += 1;
      }
    }
    this.zsets.set(key, set);
    return removed;
  }

  /** Test helper: list contents (left = head / LPUSH side). */
  peekList(key: string): string[] {
    return [...(this.lists.get(key) ?? [])];
  }

  private flushWaiters(key: string): void {
    const idx = this.waiters.findIndex((w) => w.key === key);
    if (idx < 0) {
      return;
    }
    const [waiter] = this.waiters.splice(idx, 1);
    clearTimeout(waiter.timer);
    void this.rPop(key).then((value) => waiter.resolve(value));
  }
}
