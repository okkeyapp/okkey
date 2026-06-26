import test from "node:test";
import assert from "node:assert/strict";
import {
  DevicesRepository,
  EventsRepository,
  ItemsRepository,
  UsersRepository,
  VaultsRepository,
  WorkspacesRepository,
} from "../src/storage/repositories.ts";
import { VersionConflictError } from "../src/storage/errors.ts";

class FakeDb {
  readonly queries: Array<{ sql: string; params: unknown[] }> = [];
  readonly queue: unknown[][] = [];

  enqueueResult(rows: unknown[]): void {
    this.queue.push(rows);
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    this.queries.push({ sql, params });
    const next = this.queue.shift();
    return (next ?? []) as T[];
  }

  async transaction<T>(fn: (tx: FakeDb) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

function makeDeviceRow(
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: "d1",
    user_id: "u1",
    device_fingerprint: "a".repeat(64),
    device_name: "MacBook Pro",
    device_public_key: Buffer.from("pk").toString("base64"),
    device_share: Buffer.from([1, 2, 3]),
    platform: "desktop",
    os_name: "macOS",
    os_version: "14.5",
    app_version: "1.0.0",
    client_type: "desktop",
    user_agent: "ua",
    ip_first: "10.0.0.1",
    ip_last: "10.0.0.1",
    status: "pending",
    created_at: "2026-01-01T00:00:00.000Z",
    last_seen_at: null,
    approved_by: null,
    approved_at: null,
    rejected_at: null,
    rejection_reason: null,
    revoked_at: null,
    ...(overrides ?? {}),
  };
}

test("UsersRepository.create maps inserted row", async () => {
  const db = new FakeDb();
  db.enqueueResult([
    {
      id: "u1",
      email: "dev@okkey.local",
      public_key: "pk",
      public_pq_key: "pq",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ]);

  const repo = new UsersRepository(db);
  const user = await repo.create({
    email: "dev@okkey.local",
    publicKey: "pk",
    publicPqKey: "pq",
    encryptedPrivateKey: new Uint8Array([1, 2, 3]),
    serverKeyShare: new Uint8Array([4, 5]),
    passwordKdfSalt: new Uint8Array(16).fill(9),
    passwordKdfParamsVersion: 1,
  });

  assert.equal(user.id, "u1");
  assert.equal(user.publicKey, "pk");
  assert.equal(db.queries.length, 1);
  assert.match(db.queries[0].sql, /INSERT INTO users/);
});

test("WorkspacesRepository.listByOwner returns mapped workspaces", async () => {
  const db = new FakeDb();
  db.enqueueResult([
    {
      id: "w1",
      name: "Acme",
      owner_id: "u1",
      plan_tier: "FREE",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ]);

  const repo = new WorkspacesRepository(db);
  const items = await repo.listByOwner("u1");

  assert.equal(items.length, 1);
  assert.equal(items[0].ownerId, "u1");
  assert.match(db.queries[0].sql, /FROM workspaces/);
});

test("VaultsRepository.findById returns null for absent row", async () => {
  const db = new FakeDb();
  db.enqueueResult([]);

  const repo = new VaultsRepository(db);
  const result = await repo.findById("missing");

  assert.equal(result, null);
});

test("ItemsRepository.listByVault maps encrypted data", async () => {
  const db = new FakeDb();
  db.enqueueResult([
    {
      id: "i1",
      vault_id: "v1",
      encrypted_data: Buffer.from([7, 8, 9]),
      version: 3,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ]);

  const repo = new ItemsRepository(db);
  const rows = await repo.listByVault("v1");

  assert.equal(rows[0].vaultId, "v1");
  assert.deepEqual(Array.from(rows[0].encryptedData), [7, 8, 9]);
});

test("DevicesRepository.registerOrUpdate returns mapped device row", async () => {
  const db = new FakeDb();
  db.enqueueResult([makeDeviceRow()]);

  const repo = new DevicesRepository(db);
  const result = await repo.registerOrUpdate({
    userId: "u1",
    deviceFingerprint: "a".repeat(64),
    deviceName: "MacBook Pro",
    devicePublicKey: Buffer.from("pk").toString("base64"),
    deviceShare: new Uint8Array([1, 2, 3]),
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.5",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "ua",
    requestIp: "10.0.0.1",
    now: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(result.id, "d1");
  assert.equal(result.status, "pending");
  assert.equal(result.ipFirst, "10.0.0.1");
  assert.equal(result.approvedBy, null);
  assert.equal(db.queries.length, 1);
  assert.match(db.queries[0].sql, /INSERT INTO devices/);
});

test("DevicesRepository.isTrustedDevice checks trusted status", async () => {
  const db = new FakeDb();
  db.enqueueResult([{ is_trusted: true }]);

  const repo = new DevicesRepository(db);
  const trusted = await repo.isTrustedDevice("u1", "d1");

  assert.equal(trusted, true);
  assert.match(db.queries[0].sql, /status = 'trusted'/);
});

test("DevicesRepository.resolveApproval approves pending device", async () => {
  const db = new FakeDb();
  db.enqueueResult([makeDeviceRow({ status: "pending" })]); // SELECT FOR UPDATE
  db.enqueueResult([
    makeDeviceRow({
      status: "trusted",
      approved_by: "u1",
      approved_at: "2026-01-01T00:02:00.000Z",
      last_seen_at: "2026-01-01T00:02:00.000Z",
    }),
  ]); // UPDATE approve

  const repo = new DevicesRepository(db);
  const result = await repo.resolveApproval({
    deviceId: "d1",
    userId: "u1",
    action: "approve",
    now: "2026-01-01T00:02:00.000Z",
    expiresAt: "2025-12-31T23:59:00.000Z",
    approvedBy: "u1",
  });

  assert.equal(result.kind, "approved");
  assert.equal(result.device?.status, "trusted");
  assert.equal(result.device?.approvedBy, "u1");
  assert.equal(result.device?.approvedAt, "2026-01-01T00:02:00.000Z");
});

test("EventsRepository.append increments version in transaction", async () => {
  const db = new FakeDb();
  db.enqueueResult([{ id: "v1", crypto_version: 2 }]); // lock vault
  db.enqueueResult([{ current_version: 4 }]); // get current version
  db.enqueueResult([{ m: null }]); // MAX(payload_schema_version); null => no floor
  db.enqueueResult([
    {
      id: "e1",
      vault_id: "v1",
      actor_id: "u1",
      event_type: "ITEM_UPDATE",
      encrypted_payload: Buffer.from([10]),
      payload_schema_version: 2,
      idempotency_key: null,
      client_created_at: null,
      version: 5,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ]);
  db.enqueueResult([]); // UPDATE vaults crypto_version

  const repo = new EventsRepository(db);
  const event = await repo.append({
    vaultId: "v1",
    actorId: "u1",
    eventType: "ITEM_UPDATE",
    encryptedPayload: new Uint8Array([10]),
    baseVersion: 4,
  });

  assert.equal(event.version, 5);
  assert.equal(db.queries.length, 5);
  assert.match(db.queries[0].sql, /FOR UPDATE/);
  assert.match(db.queries[2].sql, /MAX\(payload_schema_version\)/);
  assert.match(db.queries[4].sql, /UPDATE vaults/);
});

test("EventsRepository.append throws VersionConflictError", async () => {
  const db = new FakeDb();
  db.enqueueResult([{ id: "v1", crypto_version: 2 }]); // lock vault
  db.enqueueResult([{ current_version: 7 }]); // current version

  const repo = new EventsRepository(db);

  await assert.rejects(
    () =>
      repo.append({
        vaultId: "v1",
        actorId: "u1",
        eventType: "ITEM_UPDATE",
        encryptedPayload: new Uint8Array([10]),
        baseVersion: 2,
      }),
    (error: unknown) =>
      error instanceof VersionConflictError &&
      error.expectedVersion === 2 &&
      error.actualVersion === 7,
  );
});

test("EventsRepository.append returns existing row when idempotency_key matches", async () => {
  const idem = "1156820912149301";
  const existing = {
    id: "e-dedup",
    vault_id: "v1",
    actor_id: "u1",
    event_type: "ITEM_CREATE",
    encrypted_payload: Buffer.from([1, 2, 3]),
    payload_schema_version: 1,
    idempotency_key: idem,
    client_created_at: null,
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
  };

  const db = new FakeDb();
  db.enqueueResult([{ id: "v1", crypto_version: 1 }]); // lock vault
  db.enqueueResult([existing]); // idempotency hit

  const repo = new EventsRepository(db);
  const event = await repo.append({
    vaultId: "v1",
    actorId: "u1",
    eventType: "ITEM_CREATE",
    encryptedPayload: new Uint8Array([99]),
    baseVersion: 99,
    idempotencyKey: idem,
    payloadSchemaVersion: 1,
  });

  assert.equal(event.id, "e-dedup");
  assert.equal(event.version, 1);
  assert.equal(db.queries.length, 2);
  assert.match(db.queries[1].sql, /idempotency_key/);
});
