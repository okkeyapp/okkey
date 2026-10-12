import { StorageConnectionError, StorageQueryError } from "./errors.ts";

type RedisClientLike = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: { EX?: number; NX?: boolean },
  ): Promise<unknown>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
  lPush(key: string, ...values: string[]): Promise<number>;
  rPop(key: string): Promise<string | null>;
  brPop(
    key: string,
    timeoutSeconds: number,
  ): Promise<{ key: string; element: string } | null>;
  zAdd(key: string, members: { score: number; value: string } | Array<{ score: number; value: string }>): Promise<number>;
  zRangeByScore(
    key: string,
    min: number | string,
    max: number | string,
    options?: { LIMIT?: { offset: number; count: number } },
  ): Promise<string[]>;
  zRem(key: string, ...members: string[]): Promise<number>;
};

export class RedisCache {
  private readonly client: RedisClientLike;

  constructor(client: RedisClientLike) {
    this.client = client;
  }

  static async connect(redisUrl: string): Promise<RedisCache> {
    let createClientFn: (options: { url: string }) => RedisClientLike;

    try {
      const redisModule = (await import("redis")) as {
        createClient: (options: { url: string }) => RedisClientLike;
      };
      createClientFn = redisModule.createClient;
    } catch {
      throw new StorageConnectionError(
        "Redis driver is not installed. Install dependency `redis`.",
      );
    }

    const client = createClientFn({ url: redisUrl });
    await connectWithRetry(client);
    return new RedisCache(client);
  }

  async ping(): Promise<void> {
    try {
      await this.client.ping();
    } catch (error) {
      throw new StorageQueryError("redis ping failed", error);
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      throw new StorageQueryError("redis get failed", error);
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await this.client.set(key, value);
    } catch (error) {
      throw new StorageQueryError("redis set failed", error);
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      throw new StorageQueryError("redis del failed", error);
    }
  }

  async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, value, { EX: ttlSeconds });
    } catch (error) {
      throw new StorageQueryError("redis set with ttl failed", error);
    }
  }

  async setIfNotExistsWithTtl(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    try {
      const result = await this.client.set(key, value, {
        EX: ttlSeconds,
        NX: true,
      });
      return result === "OK";
    } catch (error) {
      throw new StorageQueryError("redis set if not exists failed", error);
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      throw new StorageQueryError("redis incr failed", error);
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      throw new StorageQueryError("redis expire failed", error);
    }
  }

  async close(): Promise<void> {
    await this.client.disconnect();
  }

  async lPush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.client.lPush(key, ...values);
    } catch (error) {
      throw new StorageQueryError("redis lPush failed", error);
    }
  }

  async rPop(key: string): Promise<string | null> {
    try {
      return await this.client.rPop(key);
    } catch (error) {
      throw new StorageQueryError("redis rPop failed", error);
    }
  }

  async brPop(key: string, timeoutSeconds: number): Promise<string | null> {
    try {
      const result = await this.client.brPop(key, timeoutSeconds);
      return result?.element ?? null;
    } catch (error) {
      throw new StorageQueryError("redis brPop failed", error);
    }
  }

  async zAdd(key: string, score: number, member: string): Promise<number> {
    try {
      return await this.client.zAdd(key, { score, value: member });
    } catch (error) {
      throw new StorageQueryError("redis zAdd failed", error);
    }
  }

  async zRangeByScore(
    key: string,
    min: number,
    max: number,
    limit: number,
  ): Promise<string[]> {
    try {
      return await this.client.zRangeByScore(key, min, max, {
        LIMIT: { offset: 0, count: limit },
      });
    } catch (error) {
      throw new StorageQueryError("redis zRangeByScore failed", error);
    }
  }

  async zRem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.zRem(key, ...members);
    } catch (error) {
      throw new StorageQueryError("redis zRem failed", error);
    }
  }
}

const CONNECT_RETRY_ATTEMPTS = 120;
const CONNECT_RETRY_DELAY_MS = 1000;

async function connectWithRetry(client: RedisClientLike): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CONNECT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await client.connect();
      await client.ping();
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableConnectError(error) || attempt === CONNECT_RETRY_ATTEMPTS) {
        throw error;
      }
      await delay(CONNECT_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

function isRetryableConnectError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return (
    text.includes("ECONNREFUSED") ||
    text.includes("ENOTFOUND") ||
    text.includes("ETIMEDOUT")
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
