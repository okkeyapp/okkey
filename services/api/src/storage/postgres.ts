import { StorageConnectionError, StorageQueryError } from "./errors.ts";

type PgPoolLike = {
  connect(): Promise<PgClientLike>;
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
};

type PgClientLike = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
};

export interface QueryExecutor {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export class PostgresDatabase implements QueryExecutor {
  private readonly pool: PgPoolLike;

  constructor(pool: PgPoolLike) {
    this.pool = pool;
  }

  static async connect(databaseUrl: string): Promise<PostgresDatabase> {
    let PoolCtor: new (opts: { connectionString: string }) => PgPoolLike;

    try {
      const pgModule = (await import("pg")) as {
        Pool: new (opts: { connectionString: string }) => PgPoolLike;
      };
      PoolCtor = pgModule.Pool;
    } catch {
      throw new StorageConnectionError(
        "Postgres driver is not installed. Install dependency `pg`.",
      );
    }

    const pool = new PoolCtor({ connectionString: databaseUrl });
    const db = new PostgresDatabase(pool);
    await db.ping();
    return db;
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      const result = await this.pool.query<T>(sql, params);
      return result.rows;
    } catch (error) {
      throw new StorageQueryError("postgres query failed", error);
    }
  }

  async transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const tx: QueryExecutor = {
        query: async <R>(sql: string, params: unknown[] = []) => {
          const result = await client.query<R>(sql, params);
          return result.rows;
        },
      };
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<void> {
    await this.query("SELECT 1");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
