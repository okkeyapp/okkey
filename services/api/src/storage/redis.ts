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
    await client.connect();
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
}
