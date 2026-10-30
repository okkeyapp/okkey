import test from "node:test";
import assert from "node:assert/strict";
import {
  DevicesRepository,
  EventsRepository,
  SessionsRepository,
  TrustedDeviceKeyConflictError,
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

test("UsersRepository.hasAnyUsers maps EXISTS result", async () => {
  const empty = new FakeDb();
  empty.enqueueResult([{ exists: false }]);
  assert.equal(await new UsersRepository(empty).hasAnyUsers(), false);
  assert.match(empty.queries[0].sql, /EXISTS\(SELECT 1 FROM users/);

  const populated = new FakeDb();
  populated.enqueueResult([{ exists: true }]);
  assert.equal(await new UsersRepository(populated).hasAnyUsers(), true);
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
  // User lock, fingerprint lock, fingerprint miss, then INSERT returns the row.
  db.enqueueResult([]);
  db.enqueueResult([]);
  db.enqueueResult([]);
  db.enqueueResult([makeDeviceRow({ status: "trusted" })]);

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
  assert.equal(result.status, "trusted");
  assert.equal(result.sendApprovalEmail, false);
  assert.equal(result.ipFirst, "10.0.0.1");
  assert.equal(result.approvedBy, null);
  assert.equal(db.queries.length, 4);
  assert.deepEqual(db.queries[0].params, ["okkey-user-devices:u1"]);
  assert.match(db.queries[1].sql, /pg_advisory_xact_lock/);
  assert.match(db.queries[2].sql, /FROM devices/);
  assert.match(db.queries[2].sql, /device_fingerprint/);
  assert.match(db.queries[3].sql, /INSERT INTO devices/);
});

test("DevicesRepository.registerOrUpdate emails only a newly pending device", async () => {
  const existing = new FakeDb();
  existing.enqueueResult([]);
  existing.enqueueResult([]);
  existing.enqueueResult([makeDeviceRow({ status: "pending" })]);
  existing.enqueueResult([{ n: "1" }]);
  existing.enqueueResult([makeDeviceRow({ status: "pending" })]);
  const repo = new DevicesRepository(existing);
  const again = await repo.registerOrUpdate({
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
  assert.equal(again.sendApprovalEmail, false);

  const created = new FakeDb();
  created.enqueueResult([]);
  created.enqueueResult([]);
  created.enqueueResult([]);
  created.enqueueResult([makeDeviceRow({ status: "pending" })]);
  const createdRepo = new DevicesRepository(created);
  const first = await createdRepo.registerOrUpdate({
    userId: "u1",
    deviceFingerprint: "b".repeat(64),
    deviceName: "New",
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
  assert.equal(first.sendApprovalEmail, true);
});

test("DevicesRepository.isTrustedDevice checks trusted status", async () => {
  const db = new FakeDb();
  db.enqueueResult([{ is_trusted: true }]);

  const repo = new DevicesRepository(db);
  const trusted = await repo.isTrustedDevice("u1", "d1");

  assert.equal(trusted, true);
  assert.match(db.queries[0].sql, /status = 'trusted'/);
});

test("DevicesRepository.listByUser returns mapped rows", async () => {
  const db = new FakeDb();
  db.enqueueResult([
    makeDeviceRow({ id: "d-pending", status: "pending" }),
    makeDeviceRow({ id: "d-trusted", status: "trusted" }),
  ]);

  const repo = new DevicesRepository(db);
  const rows = await repo.listByUser("u1");

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.id, "d-pending");
  assert.match(db.queries[0].sql, /status = ANY/);
});

test("DevicesRepository.renameDevice and revokeOwned update owned rows", async () => {
  const renameDb = new FakeDb();
  renameDb.enqueueResult([makeDeviceRow({ device_name: "Office laptop", status: "trusted" })]);
  const renameRepo = new DevicesRepository(renameDb);
  const renamed = await renameRepo.renameDevice({
    userId: "u1",
    deviceId: "d1",
    deviceName: "Office laptop",
  });
  assert.equal(renamed?.deviceName, "Office laptop");
  assert.match(renameDb.queries[0].sql, /SET device_name/);

  const revokeDb = new FakeDb();
  revokeDb.enqueueResult([]);
  revokeDb.enqueueResult([{ id: "d1" }]);
  revokeDb.enqueueResult([makeDeviceRow({ status: "revoked", revoked_at: "2026-01-01T00:03:00.000Z" })]);
  revokeDb.enqueueResult([]);
  const revokeRepo = new DevicesRepository(revokeDb);
  const revoked = await revokeRepo.revokeOwned({
    userId: "u1",
    deviceId: "d1",
    now: "2026-01-01T00:03:00.000Z",
    reason: "not now",
  });
  assert.equal(revoked?.status, "revoked");
  const revokeSql = revokeDb.queries.find((query) => /status = 'revoked'/.test(query.sql));
  const deleteSql = revokeDb.queries.find((query) => /DELETE FROM sessions/.test(query.sql));
  assert.ok(revokeSql);
  assert.ok(deleteSql);
  assert.deepEqual(deleteSql?.params, [["d1"]]);
});

test("DevicesRepository.resolveApproval approves pending device", async () => {
  const db = new FakeDb();
  db.enqueueResult([]); // user device lock
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
    approverDeviceId: "trusted1",
  });

  assert.equal(result.kind, "approved");
  assert.equal(result.device?.status, "trusted");
  assert.equal(result.device?.approvedBy, "u1");
  assert.equal(result.device?.approvedAt, "2026-01-01T00:02:00.000Z");
  assert.match(db.queries[2].sql, /device_share = approver\.device_share/);
  assert.equal(db.queries[2].params[3], "trusted1");
});

test("DevicesRepository.resolveApproval reject ends device sessions", async () => {
  const db = new FakeDb();
  db.enqueueResult([]);
  db.enqueueResult([makeDeviceRow({ status: "pending" })]);
  db.enqueueResult([makeDeviceRow({ status: "revoked" })]);
  db.enqueueResult([]);
  const repo = new DevicesRepository(db);
  const result = await repo.resolveApproval({
    deviceId: "d1",
    userId: "u1",
    action: "reject",
    now: "2026-01-01T00:02:00.000Z",
    expiresAt: "2025-12-31T23:59:00.000Z",
    approvedBy: "u1",
    approverDeviceId: "trusted1",
    rejectReason: "no",
  });
  assert.equal(result.kind, "rejected");
  assert.match(db.queries.at(-1)?.sql ?? "", /DELETE FROM sessions/);
  assert.deepEqual(db.queries.at(-1)?.params, [["d1"]]);
});

test("DevicesRepository.blockPending ends device sessions", async () => {
  const db = new FakeDb();
  db.enqueueResult([]);
  db.enqueueResult([{ id: "d1" }]);
  db.enqueueResult([makeDeviceRow({ status: "blocked", blocked_until: null })]);
  db.enqueueResult([]);
  const repo = new DevicesRepository(db);
  const blocked = await repo.blockPending({
    userId: "u1",
    deviceId: "d1",
    approverDeviceId: "trusted1",
    now: "2026-01-01T00:02:00.000Z",
    blockedUntil: null,
    reason: "blocked:forever",
  });
  assert.equal(blocked?.status, "blocked");
  assert.ok(db.queries.some((query) => /DELETE FROM sessions/.test(query.sql)));
});

test("DevicesRepository.claimTrustedAfterRecovery ends sessions of revoked devices", async () => {
  const db = new FakeDb();
  db.enqueueResult([]);
  db.enqueueResult([{ id: "old-device" }]);
  db.enqueueResult([]);
  db.enqueueResult([]);
  db.enqueueResult([{ id: "keep" }]);
  db.enqueueResult([makeDeviceRow({ id: "keep", status: "trusted" })]);
  const repo = new DevicesRepository(db);
  const claimed = await repo.claimTrustedAfterRecovery({
    userId: "u1",
    deviceFingerprint: "c".repeat(64),
    deviceName: "Recovered",
    devicePublicKey: Buffer.from("pk").toString("base64"),
    deviceShare: new Uint8Array(32),
    platform: "desktop",
    osName: "macOS",
    osVersion: "14",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "ua",
    requestIp: "127.0.0.1",
    now: "2026-01-02T00:00:00.000Z",
  });
  assert.equal(claimed.id, "keep");
  const sessionDelete = db.queries.find((query) => /DELETE FROM sessions/.test(query.sql));
  assert.ok(sessionDelete);
  assert.deepEqual(sessionDelete?.params, [["old-device"]]);
});

test("DevicesRepository.registerOrUpdate does not replace trusted device keys", async () => {
  const storedKey = Buffer.from("original-pk").toString("base64");
  const db = new FakeDb();
  db.enqueueResult([]);
  db.enqueueResult([]);
  db.enqueueResult([
    makeDeviceRow({ status: "trusted", device_public_key: storedKey }),
  ]);
  const repo = new DevicesRepository(db);
  await assert.rejects(
    () =>
      repo.registerOrUpdate({
        userId: "u1",
        deviceFingerprint: "a".repeat(64),
        deviceName: "Taken",
        devicePublicKey: Buffer.from("attacker-pk").toString("base64"),
        deviceShare: new Uint8Array(32).fill(9),
        platform: "desktop",
        osName: "macOS",
        osVersion: "14.5",
        appVersion: "1.0.0",
        clientType: "desktop",
        userAgent: "ua",
        requestIp: "10.0.0.1",
        now: "2026-01-01T00:00:00.000Z",
      }),
    (error: unknown) => error instanceof TrustedDeviceKeyConflictError,
  );
  assert.equal(
    db.queries.some((query) => /device_public_key = /.test(query.sql)),
    false,
  );
});

test("SessionsRepository.bindDevice refuses a blocked device", async () => {
  const db = new FakeDb();
  db.enqueueResult([]);
  db.enqueueResult([{ status: "blocked" }]);
  const repo = new SessionsRepository(db);
  const bound = await repo.bindDevice({
    tokenHash: "hash",
    userId: "u1",
    deviceId: "d2",
  });
  assert.equal(bound, false);
  assert.equal(
    db.queries.some((query) => /UPDATE sessions/.test(query.sql)),
    false,
  );
});

test("SessionsRepository.bindDevice does not move a session already bound to another device", async () => {
  const db = new FakeDb();
  db.enqueueResult([]);
  db.enqueueResult([{ status: "trusted" }]);
  db.enqueueResult([{ id: "s1" }]);
  const repo = new SessionsRepository(db);
  const bound = await repo.bindDevice({
    tokenHash: "hash",
    userId: "u1",
    deviceId: "d2",
  });
  assert.equal(bound, true);
  const update = db.queries.find((query) => /UPDATE sessions/.test(query.sql));
  assert.match(update?.sql ?? "", /device_id IS NULL OR device_id = \$3/);
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
