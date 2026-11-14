/**
 * Consent deadline that survives a Firefox MV3 event page going idle.
 *
 * Firefox suspends the background while onAuthRequired's blocking promise
 * is still pending, and a plain setTimeout is discarded with the realm.
 * The deadline lives in storage.session. The background closes the consent
 * window itself: an in-memory timer while this realm is awake, and a
 * browser.alarms entry (absolute `when`, not a repeating period) if the
 * realm is suspended. The consent window's own timer only wakes a discarded
 * event page; Firefox throttles timers in an unfocused window, so that
 * timer is not what settles the auth request.
 *
 * Firefox can run setTimeout or an alarm slightly before `Date.now()`
 * reaches the deadline. Both are one-shot, so an early fire re-arms the
 * in-memory timer for the remaining delay and creates the alarm again.
 * Chromium may delay alarms closer than about 30 seconds; 90 seconds is
 * past that floor, and the in-memory timer stays the fast path while the
 * page is awake.
 *
 * Those timers follow monotonic time. A system sleep or a frozen VM
 * advances `Date.now()` while they stay pending, so the stored deadline
 * is also checked on focus, visibility, and wake without waiting for the
 * original timer. The deadline value is wall-clock (`Date.now()` plus the
 * consent window) and is what gets written to storage.session.
 */
import { sanitizeHttpAuthLog } from "./httpAuthDecision.ts";
import type { HttpAuthConsentResult } from "./httpAuthMessages.ts";
import { HTTP_AUTH_CONSENT_TIMEOUT_MS } from "./httpAuthMessages.ts";

export const HTTP_AUTH_PENDING_SESSION_KEY = "okkey.extension.httpAuth.pending.v1";
export const HTTP_AUTH_TIMEOUT_ALARM_PREFIX = "okkey.httpAuth.timeout.";

export type HttpAuthPendingSession = {
  deadlineMs: number;
  windowId: number | null;
  origin: string;
};

export type HttpAuthTimeoutSource = "timer" | "alarm" | "wake" | "message" | "force";

export type HttpAuthTimeoutState = "expired" | "pending" | "missing";

export function httpAuthTimeoutAlarmName(challengeId: string): string {
  return `${HTTP_AUTH_TIMEOUT_ALARM_PREFIX}${challengeId}`;
}

export function challengeIdFromHttpAuthAlarm(alarmName: string): string | null {
  if (!alarmName.startsWith(HTTP_AUTH_TIMEOUT_ALARM_PREFIX)) {
    return null;
  }
  const challengeId = alarmName.slice(HTTP_AUTH_TIMEOUT_ALARM_PREFIX.length);
  return challengeId.length > 0 ? challengeId : null;
}

/** Persist only the deadline, window, and origin. Credentials are dropped. */
export function httpAuthPendingSession(input: {
  deadlineMs: number;
  windowId: number | null;
  origin: string;
  password?: string;
  username?: string;
  authorization?: string;
}): HttpAuthPendingSession {
  return {
    deadlineMs: input.deadlineMs,
    windowId: input.windowId,
    origin: input.origin,
  };
}

export function parseHttpAuthPendingBag(raw: unknown): Record<string, HttpAuthPendingSession> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const records: Record<string, HttpAuthPendingSession> = {};
  for (const [challengeId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || challengeId.length === 0) {
      continue;
    }
    const row = value as Record<string, unknown>;
    if (typeof row.deadlineMs !== "number" || !Number.isFinite(row.deadlineMs)) {
      continue;
    }
    if (typeof row.origin !== "string") {
      continue;
    }
    records[challengeId] = httpAuthPendingSession({
      deadlineMs: row.deadlineMs,
      windowId: typeof row.windowId === "number" ? row.windowId : null,
      origin: row.origin,
    });
  }
  return records;
}

export function isHttpAuthConsentExpired(deadlineMs: number, nowMs: number): boolean {
  return nowMs >= deadlineMs;
}

export type HttpAuthWallClockPorts = {
  now: () => number;
  setTimer: (callback: () => void, delayMs: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** Focus, visibility, and wake. The listener must be safe to call often. */
  subscribe: (listener: () => void) => () => void;
  onExpire: () => void;
};

/**
 * Arm a monotonic timer for the remaining wall-clock delay, and expire as
 * soon as a wake/focus/visibility signal observes `now >= deadline`.
 * An early timer fire schedules whatever wall-clock time is still left.
 */
export function armHttpAuthWallClock(deadlineMs: number, ports: HttpAuthWallClockPorts): () => void {
  let timer: unknown = null;
  let stopped = false;
  let lastSeenMs = ports.now();

  function clearArmedTimer(): void {
    if (timer == null) {
      return;
    }
    ports.clearTimer(timer);
    timer = null;
  }

  function armRemaining(): void {
    clearArmedTimer();
    const delayMs = Math.max(0, deadlineMs - ports.now());
    timer = ports.setTimer(() => {
      timer = null;
      check(true);
    }, delayMs);
  }

  function check(fromTimer: boolean): void {
    if (stopped) {
      return;
    }
    const nowMs = ports.now();
    // A monotonic timer does not observe a wall-clock jump. More than a
    // second since the last check means the machine slept or stalled.
    const jumped = nowMs - lastSeenMs > 1000;
    lastSeenMs = nowMs;
    if (isHttpAuthConsentExpired(deadlineMs, nowMs)) {
      stopped = true;
      clearArmedTimer();
      ports.onExpire();
      return;
    }
    if (fromTimer || timer == null || jumped) {
      armRemaining();
    }
  }

  const unsubscribe = ports.subscribe(() => check(false));
  check(true);
  return () => {
    stopped = true;
    clearArmedTimer();
    unsubscribe();
  };
}

type MemoryRow = {
  settled: boolean;
  deadlineMs: number;
  windowId: number | null;
  origin: string;
  timer: unknown | null;
  resolve: ((result: HttpAuthConsentResult) => void) | null;
};

export type HttpAuthConsentPorts = {
  now: () => number;
  setTimer: (callback: () => void | Promise<void>, delayMs: number) => unknown;
  clearTimer: (handle: unknown) => void;
  scheduleAlarm: (challengeId: string, whenMs: number) => void;
  clearAlarm: (challengeId: string) => void;
  closeWindow: (windowId: number) => void;
  log: (line: string) => void;
  readPending: () => Promise<Record<string, HttpAuthPendingSession>>;
  writePending: (records: Record<string, HttpAuthPendingSession>) => Promise<void>;
};

export type HttpAuthConsentTracker = {
  open(input: {
    challengeId: string;
    origin: string;
    resolve: (result: HttpAuthConsentResult) => void;
  }): Promise<number>;
  attachWindow(challengeId: string, windowId: number): Promise<void>;
  finish(challengeId: string, result: HttpAuthConsentResult): Promise<boolean>;
  onAlarm(challengeId: string): Promise<HttpAuthTimeoutState>;
  onActivity(challengeId: string): Promise<HttpAuthTimeoutState>;
  forceTimeout(challengeId: string): Promise<HttpAuthTimeoutState>;
  restoreLostTimers(): Promise<void>;
  getDeadline(challengeId: string): number | null;
};

export function createHttpAuthConsentTracker(ports: HttpAuthConsentPorts): HttpAuthConsentTracker {
  const memory = new Map<string, MemoryRow>();
  let mirror: Record<string, HttpAuthPendingSession> | null = null;
  let chain: Promise<void> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task, task);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function ensureMirror(): Promise<Record<string, HttpAuthPendingSession>> {
    if (mirror) {
      return mirror;
    }
    try {
      mirror = parseHttpAuthPendingBag(await ports.readPending());
    } catch {
      mirror = {};
    }
    return mirror;
  }

  async function flush(): Promise<void> {
    const bag = await ensureMirror();
    const copy: Record<string, HttpAuthPendingSession> = {};
    for (const [challengeId, record] of Object.entries(bag)) {
      copy[challengeId] = httpAuthPendingSession(record);
    }
    try {
      await ports.writePending(copy);
    } catch {
      // The in-memory timer, the alarm, and the consent window still fire.
    }
  }

  function clearRowTimer(row: MemoryRow): void {
    if (row.timer != null) {
      ports.clearTimer(row.timer);
      row.timer = null;
    }
  }

  function armTimer(challengeId: string, delayMs: number): unknown {
    return ports.setTimer(() => expire(challengeId, "timer"), Math.max(0, delayMs));
  }

  function schedule(challengeId: string, whenMs: number): void {
    try {
      ports.scheduleAlarm(challengeId, whenMs);
    } catch {
      // The in-memory timer still settles the request while this realm is awake.
    }
  }

  /**
   * Put a live timer and a fresh alarm back on a deadline that has not been
   * reached. An early one-shot callback must not be the last timer.
   */
  function keepAlive(challengeId: string, deadlineMs: number): void {
    const nowMs = ports.now();
    const delayMs = Math.max(0, deadlineMs - nowMs);
    const row = memory.get(challengeId);
    if (row && !row.settled) {
      clearRowTimer(row);
      row.deadlineMs = deadlineMs;
      row.timer = armTimer(challengeId, delayMs);
    } else if (!row) {
      const stored = mirror?.[challengeId];
      memory.set(challengeId, {
        settled: false,
        deadlineMs,
        windowId: stored?.windowId ?? null,
        origin: stored?.origin ?? "",
        timer: armTimer(challengeId, delayMs),
        resolve: null,
      });
    }
    schedule(challengeId, deadlineMs);
  }

  function takeRow(challengeId: string): MemoryRow | null {
    const row = memory.get(challengeId);
    if (!row || row.settled) {
      return null;
    }
    row.settled = true;
    memory.delete(challengeId);
    clearRowTimer(row);
    try {
      ports.clearAlarm(challengeId);
    } catch {
      // The stored deadline is removed below, so a later wake will not repeat it.
    }
    return row;
  }

  function remember(challengeId: string, row: MemoryRow): void {
    if (!mirror || row.settled || !memory.has(challengeId)) {
      return;
    }
    mirror[challengeId] = httpAuthPendingSession(row);
  }

  function logTimeout(origin: string): void {
    const line = origin ? `http-auth timeout origin=${origin}` : "http-auth timeout";
    const safe = sanitizeHttpAuthLog(line, []);
    if (safe) {
      ports.log(safe);
    }
  }

  async function expire(challengeId: string, source: HttpAuthTimeoutSource): Promise<HttpAuthTimeoutState> {
    return enqueue(() => expireUnlocked(challengeId, source));
  }

  async function expireUnlocked(
    challengeId: string,
    source: HttpAuthTimeoutSource,
  ): Promise<HttpAuthTimeoutState> {
    const bag = await ensureMirror();
    const row = memory.get(challengeId);
    const stored = bag[challengeId];
    const deadlineMs = row?.deadlineMs ?? stored?.deadlineMs;
    if (deadlineMs == null) {
      return "missing";
    }
    if (source !== "force" && !isHttpAuthConsentExpired(deadlineMs, ports.now())) {
      keepAlive(challengeId, deadlineMs);
      return "pending";
    }
    const taken = takeRow(challengeId);
    const windowId = taken?.windowId ?? stored?.windowId ?? null;
    const origin = taken?.origin ?? stored?.origin ?? "";
    const resolve = taken?.resolve ?? null;
    delete bag[challengeId];
    await flush();
    if (windowId != null) {
      try {
        ports.closeWindow(windowId);
      } catch {
        // The window may already be gone.
      }
    }
    if (resolve) {
      resolve({ outcome: "timeout" });
    } else {
      logTimeout(origin);
    }
    return "expired";
  }

  function rearm(challengeId: string, record: HttpAuthPendingSession, nowMs: number): void {
    const row = memory.get(challengeId);
    if (row && !row.settled) {
      clearRowTimer(row);
      row.deadlineMs = record.deadlineMs;
      row.windowId = record.windowId;
      row.origin = record.origin;
      row.timer = armTimer(challengeId, record.deadlineMs - nowMs);
    } else if (!row) {
      memory.set(challengeId, {
        settled: false,
        deadlineMs: record.deadlineMs,
        windowId: record.windowId,
        origin: record.origin,
        timer: armTimer(challengeId, record.deadlineMs - nowMs),
        resolve: null,
      });
    }
    schedule(challengeId, record.deadlineMs);
  }

  return {
    async open(input) {
      const deadlineMs = ports.now() + HTTP_AUTH_CONSENT_TIMEOUT_MS;
      const row: MemoryRow = {
        settled: false,
        deadlineMs,
        windowId: null,
        origin: input.origin,
        timer: armTimer(input.challengeId, HTTP_AUTH_CONSENT_TIMEOUT_MS),
        resolve: input.resolve,
      };
      memory.set(input.challengeId, row);
      schedule(input.challengeId, deadlineMs);
      await enqueue(async () => {
        const bag = await ensureMirror();
        const current = memory.get(input.challengeId);
        if (!current || current.settled) {
          return;
        }
        bag[input.challengeId] = httpAuthPendingSession(current);
        await flush();
      });
      return deadlineMs;
    },

    async attachWindow(challengeId, windowId) {
      const row = memory.get(challengeId);
      if (!row || row.settled) {
        try {
          ports.closeWindow(windowId);
        } catch {
          // The window may already be gone.
        }
        return;
      }
      row.windowId = windowId;
      await enqueue(async () => {
        const current = memory.get(challengeId);
        if (!current || current.settled) {
          return;
        }
        const bag = await ensureMirror();
        remember(challengeId, current);
        bag[challengeId] = httpAuthPendingSession(current);
        await flush();
      });
    },

    async finish(challengeId, result) {
      return enqueue(async () => {
        const taken = takeRow(challengeId);
        if (!taken) {
          return false;
        }
        const bag = await ensureMirror();
        delete bag[challengeId];
        await flush();
        if (taken.windowId != null) {
          try {
            ports.closeWindow(taken.windowId);
          } catch {
            // The window may already be gone.
          }
        }
        taken.resolve?.(result);
        return true;
      });
    },

    onAlarm(challengeId) {
      return expire(challengeId, "alarm");
    },

    onActivity(challengeId) {
      return expire(challengeId, "message");
    },

    forceTimeout(challengeId) {
      return expire(challengeId, "force");
    },

    async restoreLostTimers() {
      await enqueue(async () => {
        const bag = await ensureMirror();
        const nowMs = ports.now();
        const ids = new Set<string>([...Object.keys(bag), ...memory.keys()]);
        for (const challengeId of ids) {
          const row = memory.get(challengeId);
          const stored = bag[challengeId];
          const deadlineMs = row?.deadlineMs ?? stored?.deadlineMs;
          if (deadlineMs == null) {
            continue;
          }
          if (isHttpAuthConsentExpired(deadlineMs, nowMs)) {
            await expireUnlocked(challengeId, "wake");
            continue;
          }
          rearm(
            challengeId,
            stored ?? httpAuthPendingSession({
              deadlineMs,
              windowId: row?.windowId ?? null,
              origin: row?.origin ?? "",
            }),
            nowMs,
          );
        }
      });
    },

    getDeadline(challengeId) {
      return memory.get(challengeId)?.deadlineMs ?? null;
    },
  };
}
