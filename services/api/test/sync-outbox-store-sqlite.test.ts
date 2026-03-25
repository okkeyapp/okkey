import test from "node:test";
import assert from "node:assert/strict";
import { SqliteOutboxStore, type SqliteDriver, type OutboxEntry } from "../../../packages/sync/dist/index.js";

class FakeSqliteDriver implements SqliteDriver {
  private rows = new Map<string, Record<string, unknown>>();

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const normalized = sql.replace(/\s+/g, " ").trim().toUpperCase();
    if (normalized.startsWith("CREATE TABLE IF NOT EXISTS")) return;
    if (normalized.startsWith("DELETE FROM")) {
      this.rows.clear();
      return;
    }
    if (normalized.startsWith("INSERT INTO")) {
      this.rows.set(String(params[0]), {
        id: params[0],
        vault_id: params[1],
        request_json: params[2],
        status: params[3],
        attempt_count: params[4],
        created_at_ms: params[5],
        updated_at_ms: params[6],
        next_attempt_at_ms: params[7],
        last_error_code: params[8],
        last_error_message: params[9],
      });
      return;
    }
    throw new Error(`Unexpected SQL execute: ${sql}`);
  }

  async query<T extends Record<string, unknown>>(_sql: string): Promise<T[]> {
    return [...this.rows.values()]
      .sort((a, b) => {
        const ca = Number(a.created_at_ms);
        const cb = Number(b.created_at_ms);
        if (ca !== cb) return ca - cb;
        return String(a.id).localeCompare(String(b.id));
      })
      .map((r) => ({ ...r })) as T[];
  }
}

test("SqliteOutboxStore persists and loads ordered entries", async () => {
  const driver = new FakeSqliteDriver();
  const store = new SqliteOutboxStore(driver);

  const entries: OutboxEntry[] = [
    {
      id: "b",
      vaultId: "v1",
      request: { eventType: "ITEM_UPDATE", encryptedPayload: "x", baseVersion: 2, payloadSchemaVersion: 2 },
      status: "failed",
      attemptCount: 1,
      createdAtMs: 2,
      updatedAtMs: 2,
      nextAttemptAtMs: 3,
      lastErrorCode: "NETWORK_DOWN",
      lastErrorMessage: "offline",
    },
    {
      id: "a",
      vaultId: "v1",
      request: { eventType: "ITEM_UPDATE", encryptedPayload: "y", baseVersion: 1, payloadSchemaVersion: 2 },
      status: "pending",
      attemptCount: 0,
      createdAtMs: 1,
      updatedAtMs: 1,
      nextAttemptAtMs: 1,
    },
  ];

  await store.save(entries);
  const loaded = await store.load();
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0]?.id, "a");
  assert.equal(loaded[1]?.id, "b");
  assert.equal(loaded[1]?.lastErrorCode, "NETWORK_DOWN");
});
