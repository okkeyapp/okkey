/** Max rejected unlock posts per user before 429. Matches client PIN / master-password budget. */
export const VAULT_UNLOCK_MAX_REJECTED_ATTEMPTS = 5;
export const VAULT_UNLOCK_REJECT_WINDOW_MS = 5 * 60 * 1000;

export type VaultUnlockAttemptState = {
  failures: number[];
  lockedUntil: number | null;
};

export type VaultUnlockAttemptStore = {
  read(userId: string): Promise<VaultUnlockAttemptState>;
  write(userId: string, state: VaultUnlockAttemptState): Promise<void>;
  clear(userId: string): Promise<void>;
};

export type VaultUnlockAttemptRedis = {
  get(key: string): Promise<string | null>;
  setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<number>;
};

function redisKey(userId: string): string {
  return `vault_unlock:attempts:v1:${userId}`;
}

function emptyState(): VaultUnlockAttemptState {
  return { failures: [], lockedUntil: null };
}

function parseState(raw: string | null): VaultUnlockAttemptState {
  if (!raw) {
    return emptyState();
  }
  try {
    const o = JSON.parse(raw) as Partial<VaultUnlockAttemptState>;
    return {
      failures: Array.isArray(o.failures)
        ? o.failures.filter((n): n is number => typeof n === "number")
        : [],
      lockedUntil: typeof o.lockedUntil === "number" ? o.lockedUntil : null,
    };
  } catch {
    return emptyState();
  }
}

function ttlSecondsFor(state: VaultUnlockAttemptState, now: number): number {
  if (state.lockedUntil && state.lockedUntil > now) {
    return Math.max(1, Math.ceil((state.lockedUntil - now) / 1000));
  }
  return Math.ceil(VAULT_UNLOCK_REJECT_WINDOW_MS / 1000);
}

/** Process-local store (tests / Redis unavailable). */
export function createMemoryVaultUnlockAttemptStore(): VaultUnlockAttemptStore & {
  resetForTests(): void;
} {
  const byUser = new Map<string, VaultUnlockAttemptState>();
  return {
    async read(userId: string): Promise<VaultUnlockAttemptState> {
      return byUser.get(userId) ?? emptyState();
    },
    async write(userId: string, state: VaultUnlockAttemptState): Promise<void> {
      byUser.set(userId, state);
    },
    async clear(userId: string): Promise<void> {
      byUser.delete(userId);
    },
    resetForTests(): void {
      byUser.clear();
    },
  };
}

/** Redis-backed store so attempt counters survive API process restarts. */
export function createRedisVaultUnlockAttemptStore(
  redis: VaultUnlockAttemptRedis,
): VaultUnlockAttemptStore {
  return {
    async read(userId: string): Promise<VaultUnlockAttemptState> {
      return parseState(await redis.get(redisKey(userId)));
    },
    async write(userId: string, state: VaultUnlockAttemptState): Promise<void> {
      const now = Date.now();
      await redis.setWithTtl(redisKey(userId), JSON.stringify(state), ttlSecondsFor(state, now));
    },
    async clear(userId: string): Promise<void> {
      await redis.del(redisKey(userId));
    },
  };
}

export function createVaultUnlockAttemptStore(
  redis: VaultUnlockAttemptRedis | undefined,
): VaultUnlockAttemptStore {
  if (
    redis &&
    typeof redis.get === "function" &&
    typeof redis.setWithTtl === "function" &&
    typeof redis.del === "function"
  ) {
    return createRedisVaultUnlockAttemptStore(redis);
  }
  return createMemoryVaultUnlockAttemptStore();
}

export async function unlockLockRemainingMs(
  store: VaultUnlockAttemptStore,
  userId: string,
  now: number,
): Promise<number> {
  const state = await store.read(userId);
  if (!state.lockedUntil) {
    return 0;
  }
  return Math.max(0, state.lockedUntil - now);
}

export async function recordUnlockRejection(
  store: VaultUnlockAttemptStore,
  userId: string,
  now: number,
): Promise<{ limited: boolean; remainingMs: number }> {
  const state = await store.read(userId);
  if (state.lockedUntil && state.lockedUntil > now) {
    return { limited: true, remainingMs: state.lockedUntil - now };
  }
  const recent = state.failures.filter((ts) => now - ts < VAULT_UNLOCK_REJECT_WINDOW_MS);
  recent.push(now);
  if (recent.length >= VAULT_UNLOCK_MAX_REJECTED_ATTEMPTS) {
    const lockedUntil = now + VAULT_UNLOCK_REJECT_WINDOW_MS;
    await store.write(userId, { failures: [], lockedUntil });
    return { limited: true, remainingMs: VAULT_UNLOCK_REJECT_WINDOW_MS };
  }
  await store.write(userId, { failures: recent, lockedUntil: null });
  return { limited: false, remainingMs: 0 };
}

export async function clearUnlockFailures(
  store: VaultUnlockAttemptStore,
  userId: string,
): Promise<void> {
  await store.clear(userId);
}
