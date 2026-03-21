import { StorageConnectionError, StorageQueryError } from "./errors.ts";

type RedisClientLike = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<number>;
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

  async close(): Promise<void> {
    await this.client.disconnect();
  }
}
