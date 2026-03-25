import type { OutboxEntry, OutboxStore } from "./outbox.js";

export interface SqliteDriver {
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface SqliteOutboxStoreOptions {
  tableName?: string;
}

const DEFAULT_TABLE_NAME = "sync_outbox_entries_v1";

function cloneEntry(entry: OutboxEntry): OutboxEntry {
  return {
    ...entry,
    request: { ...entry.request },
  };
}

export class SqliteOutboxStore implements OutboxStore {
  private initialized = false;
  private readonly tableName: string;

  constructor(
    private readonly driver: SqliteDriver,
    options: SqliteOutboxStoreOptions = {},
  ) {
    this.tableName = options.tableName ?? DEFAULT_TABLE_NAME;
  }

  private async ensureSchema(): Promise<void> {
    if (this.initialized) return;
    await this.driver.execute(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        vault_id TEXT NOT NULL,
        request_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        next_attempt_at_ms INTEGER NOT NULL,
        last_error_code TEXT NULL,
        last_error_message TEXT NULL
      )
    `);
    this.initialized = true;
  }

  async load(): Promise<OutboxEntry[]> {
    await this.ensureSchema();
    const rows = await this.driver.query<{
      id: string;
      vault_id: string;
      request_json: string;
      status: OutboxEntry["status"];
      attempt_count: number;
      created_at_ms: number;
      updated_at_ms: number;
      next_attempt_at_ms: number;
      last_error_code: string | null;
      last_error_message: string | null;
    }>(
      `SELECT id, vault_id, request_json, status, attempt_count, created_at_ms, updated_at_ms, next_attempt_at_ms, last_error_code, last_error_message
       FROM ${this.tableName}
       ORDER BY created_at_ms ASC, id ASC`,
    );

    return rows.map((row) =>
      cloneEntry({
        id: row.id,
        vaultId: row.vault_id,
        request: JSON.parse(row.request_json) as OutboxEntry["request"],
        status: row.status,
        attemptCount: row.attempt_count,
        createdAtMs: row.created_at_ms,
        updatedAtMs: row.updated_at_ms,
        nextAttemptAtMs: row.next_attempt_at_ms,
        ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
        ...(row.last_error_message ? { lastErrorMessage: row.last_error_message } : {}),
      }),
    );
  }

  async save(entries: OutboxEntry[]): Promise<void> {
    await this.ensureSchema();
    await this.driver.execute(`DELETE FROM ${this.tableName}`);

    for (const entry of entries) {
      await this.driver.execute(
        `INSERT INTO ${this.tableName}
          (id, vault_id, request_json, status, attempt_count, created_at_ms, updated_at_ms, next_attempt_at_ms, last_error_code, last_error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.vaultId,
          JSON.stringify(entry.request),
          entry.status,
          entry.attemptCount,
          entry.createdAtMs,
          entry.updatedAtMs,
          entry.nextAttemptAtMs,
          entry.lastErrorCode ?? null,
          entry.lastErrorMessage ?? null,
        ],
      );
    }
  }
}
