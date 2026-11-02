/**
 * Failed recovery-proof attempts. A lockout is per account and per session.
 * The stored state is a counter, not a credential.
 */

export const RECOVERY_PROOF_SESSION_MAX_FAILURES = 5;
export const RECOVERY_PROOF_ACCOUNT_MAX_FAILURES = 10;
export const RECOVERY_PROOF_LOCK_WINDOW_MS = 15 * 60 * 1000;

export type RecoveryProofAttemptState = {
  failures: number[];
  lockedUntil: number | null;
};

export type RecoveryProofAttemptStore = {
  read(key: string): Promise<RecoveryProofAttemptState>;
  write(key: string, state: RecoveryProofAttemptState): Promise<void>;
  clear(key: string): Promise<void>;
};

export type RecoveryProofAttemptRedis = {
  get(key: string): Promise<string | null>;
  setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<number>;
};

function emptyState(): RecoveryProofAttemptState {
  return { failures: [], lockedUntil: null };
}

function parseState(raw: string | null): RecoveryProofAttemptState {
  if (!raw) {
    return emptyState();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RecoveryProofAttemptState>;
    return {
      failures: Array.isArray(parsed.failures)
        ? parsed.failures.filter((value): value is number => typeof value === "number")
        : [],
      lockedUntil: typeof parsed.lockedUntil === "number" ? parsed.lockedUntil : null,
    };
  } catch {
    return emptyState();
  }
}

function redisKey(key: string): string {
  return `recovery_proof:attempts:v1:${key}`;
}

function ttlSeconds(state: RecoveryProofAttemptState, now: number): number {
  if (state.lockedUntil && state.lockedUntil > now) {
    return Math.max(1, Math.ceil((state.lockedUntil - now) / 1000));
  }
  return Math.ceil(RECOVERY_PROOF_LOCK_WINDOW_MS / 1000);
}

export function createMemoryRecoveryProofAttemptStore(): RecoveryProofAttemptStore & {
  resetForTests(): void;
} {
  const rows = new Map<string, RecoveryProofAttemptState>();
  return {
    async read(key: string): Promise<RecoveryProofAttemptState> {
      return rows.get(key) ?? emptyState();
    },
    async write(key: string, state: RecoveryProofAttemptState): Promise<void> {
      rows.set(key, state);
    },
    async clear(key: string): Promise<void> {
      rows.delete(key);
    },
    resetForTests(): void {
      rows.clear();
    },
  };
}

export function createRedisRecoveryProofAttemptStore(
  redis: RecoveryProofAttemptRedis,
): RecoveryProofAttemptStore {
  return {
    async read(key: string): Promise<RecoveryProofAttemptState> {
      return parseState(await redis.get(redisKey(key)));
    },
    async write(key: string, state: RecoveryProofAttemptState): Promise<void> {
      await redis.setWithTtl(redisKey(key), JSON.stringify(state), ttlSeconds(state, Date.now()));
    },
    async clear(key: string): Promise<void> {
      await redis.del(redisKey(key));
    },
  };
}

export function createRecoveryProofAttemptStore(
  redis: RecoveryProofAttemptRedis | undefined,
): RecoveryProofAttemptStore {
  if (
    redis &&
    typeof redis.get === "function" &&
    typeof redis.setWithTtl === "function" &&
    typeof redis.del === "function"
  ) {
    return createRedisRecoveryProofAttemptStore(redis);
  }
  return createMemoryRecoveryProofAttemptStore();
}

export function accountAttemptKey(userId: string): string {
  return `account:${userId}`;
}

export function sessionAttemptKey(tokenHash: string): string {
  return `session:${tokenHash}`;
}

export async function recoveryProofLockRemainingMs(
  store: RecoveryProofAttemptStore,
  key: string,
  now: number,
): Promise<number> {
  const state = await store.read(key);
  if (!state.lockedUntil || state.lockedUntil <= now) {
    return 0;
  }
  return state.lockedUntil - now;
}

export async function recordRecoveryProofFailure(
  store: RecoveryProofAttemptStore,
  key: string,
  maxFailures: number,
  now: number,
): Promise<{ limited: boolean; remainingMs: number }> {
  const state = await store.read(key);
  if (state.lockedUntil && state.lockedUntil > now) {
    return { limited: true, remainingMs: state.lockedUntil - now };
  }
  const recent = state.failures.filter((ts) => now - ts < RECOVERY_PROOF_LOCK_WINDOW_MS);
  recent.push(now);
  if (recent.length >= maxFailures) {
    const lockedUntil = now + RECOVERY_PROOF_LOCK_WINDOW_MS;
    await store.write(key, { failures: [], lockedUntil });
    return { limited: true, remainingMs: RECOVERY_PROOF_LOCK_WINDOW_MS };
  }
  await store.write(key, { failures: recent, lockedUntil: null });
  return { limited: false, remainingMs: 0 };
}

export async function clearRecoveryProofFailures(
  store: RecoveryProofAttemptStore,
  key: string,
): Promise<void> {
  await store.clear(key);
}
