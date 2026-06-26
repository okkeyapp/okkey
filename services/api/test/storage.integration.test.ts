import test from "node:test";
import assert from "node:assert/strict";
import { testEntityId } from "./test-entity-id.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initEntityIdGenerator } from "../src/entity-id.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import { applyMigrations } from "./two-factor-test-helpers.ts";
import { loadConfig } from "../src/config.ts";
import {
  DevicesRepository,
  EventsRepository,
  UsersRepository,
  VaultsRepository,
  WorkspacesRepository,
} from "../src/storage/repositories.ts";
import { PostgresDatabase } from "../src/storage/postgres.ts";
import { CryptoDowngradeInvariantError, VersionConflictError } from "../src/storage/errors.ts";

function createLoggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(__dirname, "../migrations/0001_init.sql");

async function ensureCoreSchema(db: PostgresDatabase): Promise<void> {
  initEntityIdGenerator(1);
  const usersTable = await db.query<{ regclass: string | null }>(
    "SELECT to_regclass('public.users') AS regclass",
  );
  if (usersTable[0]?.regclass) {
    const idColumn = await db.query<{ data_type: string }>(
      `
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'id'
      `,
    );
    if (idColumn[0]?.data_type !== "bigint") {
      await db.query("DROP SCHEMA public CASCADE");
      await db.query("CREATE SCHEMA public");
    }
  }
  const check = await db.query<{ regclass: string | null }>(
    "SELECT to_regclass('public.users') AS regclass",
  );
  if (!check[0]?.regclass) {
    await db.query(readFileSync(migrationPath, "utf8"));
  }
}


test("integration: createStorageLayer ping succeeds with postgres and redis", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  t.after(async () => {
    await storage.close();
  });

  await storage.ping();
});

test("integration: EventsRepository.append persists event and detects version conflict", async (t) => {
  const config = loadConfig();
  const db = await PostgresDatabase.connect(config.databaseUrl);
  let userId: string | null = null;
  let workspaceId: string | null = null;
  t.after(async () => {
    if (workspaceId) {
      await db.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    }
    if (userId) {
      await db.query("DELETE FROM users WHERE id = $1", [userId]);
    }
    await db.close();
  });

  await ensureCoreSchema(db);

  const users = new UsersRepository(db);
  const workspaces = new WorkspacesRepository(db);
  const vaults = new VaultsRepository(db);
  const events = new EventsRepository(db);

  const suffix = testEntityId();
  const user = await users.create({
    email: `integration-${suffix}@okkey.local`,
    publicKey: `pk-${suffix}`,
    publicPqKey: `pq-${suffix}`,
    encryptedPrivateKey: new Uint8Array([1, 2, 3]),
    serverKeyShare: new Uint8Array([4, 5, 6]),
    passwordKdfSalt: new Uint8Array(16).fill(1),
    passwordKdfParamsVersion: 1,
  });

  const workspace = await workspaces.create({
    name: `integration-${suffix}`,
    ownerId: user.id,
  });

  const vault = await vaults.create({
    workspaceId: workspace.id,
    name: "Integration Vault",
    isPersonal: false,
    ownerId: user.id,
  });

  assert.equal(vault.cryptoVersion, 2);

  userId = user.id;
  workspaceId = workspace.id;

  const firstEvent = await events.append({
    vaultId: vault.id,
    actorId: user.id,
    eventType: "ITEM_CREATE",
    encryptedPayload: new Uint8Array([10, 11]),
    baseVersion: 0,
  });

  assert.equal(firstEvent.version, 1);

  const vaultAfterEvent = await vaults.findById(vault.id);
  assert.equal(vaultAfterEvent?.cryptoVersion, 2);

  await assert.rejects(
    () =>
      events.append({
        vaultId: vault.id,
        actorId: user.id,
        eventType: "ITEM_UPDATE",
        encryptedPayload: new Uint8Array([12, 13]),
        baseVersion: 1,
        payloadSchemaVersion: 1,
      }),
    (error: unknown) =>
      error instanceof CryptoDowngradeInvariantError &&
      error.establishedMaxVersion === 2 &&
      error.requestedVersion === 1,
  );

  await assert.rejects(
    () =>
      events.append({
        vaultId: vault.id,
        actorId: user.id,
        eventType: "ITEM_UPDATE",
        encryptedPayload: new Uint8Array([12, 13]),
        baseVersion: 0,
      }),
    (error: unknown) =>
      error instanceof VersionConflictError &&
      error.expectedVersion === 0 &&
      error.actualVersion === 1,
  );

  const replay = await events.listAfterVersion(vault.id, 0);
  assert.equal(replay.length, 1);
  assert.equal(replay[0].eventType, "ITEM_CREATE");
  assert.equal(replay[0].version, 1);
});

test("integration: DevicesRepository deduplicates and updates trusted metadata", async (t) => {
  const config = loadConfig();
  const db = await PostgresDatabase.connect(config.databaseUrl);
  let userId: string | null = null;
  t.after(async () => {
    if (userId) {
      await db.query("DELETE FROM users WHERE id = $1", [userId]);
    }
    await db.close();
  });

  await ensureCoreSchema(db);

  const users = new UsersRepository(db);
  const devices = new DevicesRepository(db);

  const suffix = testEntityId();
  const user = await users.create({
    email: `device-${suffix}@okkey.local`,
    publicKey: `pk-${suffix}`,
    publicPqKey: `pq-${suffix}`,
    encryptedPrivateKey: new Uint8Array([1, 2]),
    serverKeyShare: new Uint8Array([3, 4]),
    passwordKdfSalt: new Uint8Array(16).fill(2),
    passwordKdfParamsVersion: 1,
  });
  userId = user.id;

  const fingerprint = "a".repeat(64);
  const devicePublicKey = Buffer.from("device-public-key").toString("base64");

  const first = await devices.registerOrUpdate({
    userId: user.id,
    deviceFingerprint: fingerprint,
    deviceName: "MacBook Pro",
    devicePublicKey,
    deviceShare: new Uint8Array([1, 2, 3]),
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.5",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "okkey-desktop/1.0.0",
    requestIp: "10.0.0.1",
    now: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(first.status, "pending");

  const second = await devices.registerOrUpdate({
    userId: user.id,
    deviceFingerprint: fingerprint,
    deviceName: "MacBook Pro",
    devicePublicKey,
    deviceShare: new Uint8Array([2, 3, 4]),
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.5",
    appVersion: "1.0.1",
    clientType: "desktop",
    userAgent: "okkey-desktop/1.0.1",
    requestIp: "10.0.0.2",
    now: "2026-01-01T00:01:00.000Z",
  });

  assert.equal(second.id, first.id);
  assert.equal(second.status, "pending");

  const countRows = await db.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM devices WHERE user_id = $1",
    [user.id],
  );
  assert.equal(Number(countRows[0].count), 1);

  await db.query(
    "UPDATE devices SET status = 'trusted', revoked_at = NULL WHERE id = $1",
    [first.id],
  );

  const trusted = await devices.registerOrUpdate({
    userId: user.id,
    deviceFingerprint: fingerprint,
    deviceName: "Work MacBook",
    devicePublicKey,
    deviceShare: new Uint8Array([3, 4, 5]),
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.5",
    appVersion: "1.1.0",
    clientType: "desktop",
    userAgent: "okkey-desktop/1.1.0",
    requestIp: "10.0.0.3",
    now: "2026-01-01T00:02:00.000Z",
  });

  assert.equal(trusted.status, "trusted");
  assert.equal(trusted.deviceName, "Work MacBook");
  assert.equal(trusted.appVersion, "1.1.0");
  assert.equal(trusted.ipLast, "10.0.0.3");
  assert.equal(trusted.lastSeenAt, "2026-01-01T00:02:00.000Z");
});

test("integration: DevicesRepository approval transitions are consistent", async (t) => {
  const config = loadConfig();
  const db = await PostgresDatabase.connect(config.databaseUrl);
  let userId: string | null = null;
  t.after(async () => {
    if (userId) {
      await db.query("DELETE FROM users WHERE id = $1", [userId]);
    }
    await db.close();
  });

  await ensureCoreSchema(db);

  const users = new UsersRepository(db);
  const devices = new DevicesRepository(db);

  const suffix = testEntityId();
  const user = await users.create({
    email: `approval-${suffix}@okkey.local`,
    publicKey: `pk-${suffix}`,
    publicPqKey: `pq-${suffix}`,
    encryptedPrivateKey: new Uint8Array([1, 2]),
    serverKeyShare: new Uint8Array([3, 4]),
    passwordKdfSalt: new Uint8Array(16).fill(3),
    passwordKdfParamsVersion: 1,
  });
  userId = user.id;

  const trustedApprover = await devices.registerOrUpdate({
    userId: user.id,
    deviceFingerprint: "b".repeat(64),
    deviceName: "Trusted device",
    devicePublicKey: Buffer.from("trusted-device").toString("base64"),
    deviceShare: new Uint8Array([7, 8, 9]),
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.5",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "okkey-desktop/1.0.0",
    requestIp: "10.0.1.1",
    now: "2026-01-01T00:00:00.000Z",
  });
  await db.query("UPDATE devices SET status = 'trusted' WHERE id = $1", [trustedApprover.id]);

  const pending = await devices.registerOrUpdate({
    userId: user.id,
    deviceFingerprint: "c".repeat(64),
    deviceName: "Pending device",
    devicePublicKey: Buffer.from("pending-device").toString("base64"),
    deviceShare: new Uint8Array([1, 2, 3]),
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.5",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "okkey-desktop/1.0.0",
    requestIp: "10.0.1.2",
    now: "2026-01-01T00:00:10.000Z",
  });

  const approved = await devices.resolveApproval({
    deviceId: pending.id,
    userId: user.id,
    action: "approve",
    now: "2026-01-01T00:00:20.000Z",
    expiresAt: "2026-01-01T00:00:00.000Z",
    approvedBy: user.id,
  });

  assert.equal(approved.kind, "approved");
  assert.equal(approved.device?.status, "trusted");
  assert.equal(approved.device?.approvedBy, user.id);
  assert.equal(approved.device?.approvedAt, "2026-01-01T00:00:20.000Z");

  const approveAgain = await devices.resolveApproval({
    deviceId: pending.id,
    userId: user.id,
    action: "approve",
    now: "2026-01-01T00:00:25.000Z",
    expiresAt: "2026-01-01T00:00:00.000Z",
    approvedBy: user.id,
  });
  assert.equal(approveAgain.kind, "already_trusted");

  const rejectConflict = await devices.resolveApproval({
    deviceId: pending.id,
    userId: user.id,
    action: "reject",
    now: "2026-01-01T00:00:26.000Z",
    expiresAt: "2026-01-01T00:00:00.000Z",
    approvedBy: user.id,
  });
  assert.equal(rejectConflict.kind, "already_trusted");

  const pendingExpired = await devices.registerOrUpdate({
    userId: user.id,
    deviceFingerprint: "d".repeat(64),
    deviceName: "Expired pending",
    devicePublicKey: Buffer.from("pending-expired").toString("base64"),
    deviceShare: new Uint8Array([1, 2, 3]),
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.5",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "okkey-desktop/1.0.0",
    requestIp: "10.0.1.3",
    now: "2026-01-01T00:01:00.000Z",
  });
  await db.query("UPDATE devices SET created_at = $2::timestamptz WHERE id = $1", [
    pendingExpired.id,
    "2026-01-01T00:01:00.000Z",
  ]);

  const expired = await devices.resolveApproval({
    deviceId: pendingExpired.id,
    userId: user.id,
    action: "approve",
    now: "2026-01-01T00:10:00.000Z",
    expiresAt: "2026-01-01T00:05:00.000Z",
    approvedBy: user.id,
  });
  assert.equal(expired.kind, "expired");
  assert.equal(expired.device?.status, "revoked");
  assert.equal(expired.device?.rejectedAt, "2026-01-01T00:10:00.000Z");
});
