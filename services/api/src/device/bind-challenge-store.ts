export interface DeviceBindChallengeStore {
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Return the value and delete it. A second call returns null (replay). */
  take(key: string): Promise<string | null>;
}

export class MemoryDeviceBindChallengeStore implements DeviceBindChallengeStore {
  private readonly rows = new Map<string, { value: string; expiresAtMs: number }>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  async put(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.rows.set(key, {
      value,
      expiresAtMs: this.now() + ttlSeconds * 1000,
    });
  }

  async take(key: string): Promise<string | null> {
    const row = this.rows.get(key);
    if (!row) {
      return null;
    }
    this.rows.delete(key);
    if (row.expiresAtMs <= this.now()) {
      return null;
    }
    return row.value;
  }
}

/** Shared Redis/DB-backed store so bind challenges survive process restarts and multi-instance API. */
export class RedisDeviceBindChallengeStore implements DeviceBindChallengeStore {
  private readonly redis: {
    setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
    getDel(key: string): Promise<string | null>;
  };

  constructor(redis: {
    setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
    getDel(key: string): Promise<string | null>;
  }) {
    this.redis = redis;
  }

  async put(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.setWithTtl(key, value, ttlSeconds);
  }

  async take(key: string): Promise<string | null> {
    return this.redis.getDel(key);
  }
}
