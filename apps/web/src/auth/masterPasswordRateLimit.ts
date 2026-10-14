/**
 * Master-password unlock attempt limiting.
 * Local cache mirrors the server budget; lockout is authoritative on the API so
 * clearing site data does not reset the attempt window.
 */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

type MasterPasswordAttemptState = {
  failures: number[];
  lockedUntil: number | null;
};

const memory = new Map<string, MasterPasswordAttemptState>();

function stateKey(userId: string): string {
  return `okkey.vault.masterPasswordAttempts.v1.u.${userId}`;
}

function readState(userId: string): MasterPasswordAttemptState {
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
    const o = JSON.parse(raw) as MasterPasswordAttemptState;
    return {
      failures: Array.isArray(o.failures) ? o.failures.filter((n) => typeof n === "number") : [],
      lockedUntil: typeof o.lockedUntil === "number" ? o.lockedUntil : null,
    };
  } catch {
    return { failures: [], lockedUntil: null };
  }
}

function writeState(userId: string, state: MasterPasswordAttemptState): void {
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

export function getMasterPasswordLockRemainingMs(userId: string): number {
  const state = readState(userId);
  if (!state.lockedUntil) {
    return 0;
  }
  return Math.max(0, state.lockedUntil - Date.now());
}

export function isMasterPasswordLocked(userId: string): boolean {
  return getMasterPasswordLockRemainingMs(userId) > 0;
}

/**
 * Apply server lockout into the local cache.
 * When the server reports unlocked, clear local lockout but keep failure
 * timestamps so in-flight local counting is not wiped by a soft 200 ack.
 */
export function applyMasterPasswordServerStatus(
  userId: string,
  status: { locked: boolean; remaining_ms: number },
): { locked: boolean; remainingMs: number } {
  if (status.locked && status.remaining_ms > 0) {
    const lockedUntil = Date.now() + status.remaining_ms;
    writeState(userId, { failures: [], lockedUntil });
    return { locked: true, remainingMs: status.remaining_ms };
  }
  const state = readState(userId);
  writeState(userId, { failures: state.failures, lockedUntil: null });
  return { locked: false, remainingMs: 0 };
}

export function recordMasterPasswordFailure(userId: string): {
  locked: boolean;
  remainingMs: number;
} {
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

export function clearMasterPasswordFailures(userId: string): void {
  writeState(userId, { failures: [], lockedUntil: null });
}

export const MASTER_PASSWORD_RATE_LIMIT = {
  WINDOW_MS,
  MAX_ATTEMPTS,
  LOCKOUT_MS,
} as const;
