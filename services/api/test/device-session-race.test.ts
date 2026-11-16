import test from "node:test";
import assert from "node:assert/strict";
import { DevicesRepository, SessionsRepository } from "../src/storage/repositories.ts";
import type { QueryExecutor } from "../src/storage/postgres.ts";

type RaceState = {
  status: "pending" | "blocked";
  bound: boolean;
};

function deviceRow() {
  return {
    id: "d1",
    user_id: "u1",
    device_fingerprint: "a".repeat(64),
    device_name: "Browser",
    device_public_key: "pk",
    device_share: Buffer.alloc(32, 1),
    platform: "desktop",
    os_name: "linux",
    os_version: "6",
    app_version: "1",
    client_type: "web",
    user_agent: "ua",
    ip_first: "127.0.0.1",
    ip_last: "127.0.0.1",
    status: "blocked",
    created_at: "2026-01-01T00:00:00.000Z",
    last_seen_at: null,
    approved_by: null,
    approved_at: null,
    rejected_at: null,
    rejection_reason: null,
    revoked_at: null,
    blocked_until: null,
  };
}

function createRaceDb(state: RaceState): QueryExecutor & {
  transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
} {
  const db = {
    async query<T>(sql: string): Promise<T[]> {
      await new Promise((resolve) => setTimeout(resolve, 2));
      if (sql.includes("pg_advisory_xact_lock")) {
        return [] as T[];
      }
      if (sql.includes("SELECT status")) {
        return [{ status: state.status }] as T[];
      }
      if (sql.includes("FOR UPDATE") && sql.includes("status = 'pending'")) {
        return (state.status === "pending" ? [{ id: "d1" }] : []) as T[];
      }
      if (sql.includes("UPDATE sessions")) {
        if (state.status === "pending") {
          state.bound = true;
          return [{ id: "s1" }] as T[];
        }
        return [] as T[];
      }
      if (sql.includes("status = 'blocked'")) {
        state.status = "blocked";
        return [deviceRow()] as T[];
      }
      if (sql.includes("DELETE FROM sessions")) {
        state.bound = false;
        return [] as T[];
      }
      return [] as T[];
    },
    async transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };
  return db;
}

test("block keeps a session bound while the device was pending and refuses a later bind", async () => {
  const state: RaceState = { status: "pending", bound: false };
  const db = createRaceDb(state);
  const sessions = new SessionsRepository(db);
  const boundWhilePending = await sessions.bindDevice({
    tokenHash: "hash-pending",
    userId: "u1",
    deviceId: "d1",
  });
  assert.equal(boundWhilePending, true);
  assert.equal(state.bound, true);

  const blocked = await new DevicesRepository(db).blockPending({
    userId: "u1",
    deviceId: "d1",
    approverDeviceId: "approver",
    now: "2026-01-01T00:00:00.000Z",
    blockedUntil: null,
    reason: "blocked:forever",
  });
  assert.equal(blocked?.status, "blocked");
  assert.equal(state.status, "blocked");
  assert.equal(state.bound, true);

  const boundAfterBlock = await sessions.bindDevice({
    tokenHash: "hash-after",
    userId: "u1",
    deviceId: "d1",
  });
  assert.equal(boundAfterBlock, false);
});
