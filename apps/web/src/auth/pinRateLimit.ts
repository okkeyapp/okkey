/**
 * PIN attempt rate limiting (local device only).
 */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

type PinAttemptState = {
  failures: number[];
  lockedUntil: number | null;
};

const memory = new Map<string, PinAttemptState>();

function stateKey(userId: string): string {
  return `okkey.vault.pinAttempts.v1.u.${userId}`;
}

function readState(userId: string): PinAttemptState {
  const mem = memory.get(userId);
  if (mem) {
    return mem;
  }
  if (typeof localStorage === "undefined") {
    return { failures: [], lockedUntil: null };
  }
  try {
    const raw = localStorage.getItem(stateKey(userId));
    if (!raw) {
      return { failures: [], lockedUntil: null };
    }
    const o = JSON.parse(raw) as PinAttemptState;
    return {
      failures: Array.isArray(o.failures) ? o.failures.filter((n) => typeof n === "number") : [],
      lockedUntil: typeof o.lockedUntil === "number" ? o.lockedUntil : null,
    };
  } catch {
    return { failures: [], lockedUntil: null };
  }
}

function writeState(userId: string, state: PinAttemptState): void {
  memory.set(userId, state);
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(stateKey(userId), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function getPinLockRemainingMs(userId: string): number {
  const state = readState(userId);
  if (!state.lockedUntil) {
    return 0;
  }
  return Math.max(0, state.lockedUntil - Date.now());
}

export function isPinLocked(userId: string): boolean {
  return getPinLockRemainingMs(userId) > 0;
}

export function recordPinFailure(userId: string): { locked: boolean; remainingMs: number } {
  const now = Date.now();
  const state = readState(userId);
  if (state.lockedUntil && state.lockedUntil > now) {
    return { locked: true, remainingMs: state.lockedUntil - now };
  }
  const recent = state.failures.filter((ts) => now - ts < WINDOW_MS);
  recent.push(now);
  if (recent.length >= MAX_ATTEMPTS) {
    const next = { failures: [], lockedUntil: now + LOCKOUT_MS };
    writeState(userId, next);
    return { locked: true, remainingMs: LOCKOUT_MS };
  }
  writeState(userId, { failures: recent, lockedUntil: null });
  return { locked: false, remainingMs: 0 };
}

export function clearPinFailures(userId: string): void {
  writeState(userId, { failures: [], lockedUntil: null });
}

export const PIN_RATE_LIMIT = {
  WINDOW_MS,
  MAX_ATTEMPTS,
  LOCKOUT_MS,
} as const;
