import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.ts";
import { createStorageLayer } from "../src/storage/index.ts";
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
  const check = await db.query<{ regclass: string | null }>(
    "SELECT to_regclass('public.users') AS regclass",
  );
  if (!check[0]?.regclass) {
    const migrationSql = readFileSync(migrationPath, "utf8");
    await db.query(migrationSql);
  }

  await ensureDevicesSchema(db);
  await ensureUserKdfColumns(db);
  await ensureUserLocaleColumn(db);
  await ensureEventsSyncEnvelope(db);
  await ensureUserPublicPqKeyColumn(db);
  await ensureVaultCryptoVersionColumn(db);
  await ensureUserProfileNameColumns(db);
  await ensureVaultIdleLockColumn(db);
  await ensureUserBillingRegionColumn(db);
}

async function ensureUserBillingRegionColumn(db: PostgresDatabase): Promise<void> {
  const columns = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
    `,
  );
  const names = new Set(columns.map((column) => column.column_name));
  if (!names.has("billing_region")) {
    const migration0011 = path.resolve(__dirname, "../migrations/0011_user_billing_region.sql");
    await db.query(readFileSync(migration0011, "utf8"));
  }
}

async function ensureVaultIdleLockColumn(db: PostgresDatabase): Promise<void> {
  const columns = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
    `,
  );
  const names = new Set(columns.map((column) => column.column_name));
  if (!names.has("vault_idle_lock_seconds")) {
    const migration0010 = path.resolve(__dirname, "../migrations/0010_user_vault_idle_lock.sql");
    await db.query(readFileSync(migration0010, "utf8"));
  }
}

async function ensureUserProfileNameColumns(db: PostgresDatabase): Promise<void> {
  const columns = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
    `,
  );
  const names = new Set(columns.map((column) => column.column_name));
  if (!names.has("first_name")) {
    const migration0009 = path.resolve(__dirname, "../migrations/0009_user_profile_names.sql");
    await db.query(readFileSync(migration0009, "utf8"));
  }
}

async function ensureUserPublicPqKeyColumn(db: PostgresDatabase): Promise<void> {
  const columns = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
    `,
  );
  const names = new Set(columns.map((column) => column.column_name));
  if (!names.has("public_pq_key")) {
    const migration0007 = path.resolve(__dirname, "../migrations/0007_user_public_pq_key.sql");
    await db.query(readFileSync(migration0007, "utf8"));
  }
}

async function ensureVaultCryptoVersionColumn(db: PostgresDatabase): Promise<void> {
  const columns = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vaults'
    `,
  );
  const names = new Set(columns.map((column) => column.column_name));
  if (!names.has("crypto_version")) {
    const migration0008 = path.resolve(__dirname, "../migrations/0008_vault_crypto_version.sql");
    await db.query(readFileSync(migration0008, "utf8"));
  }
}

async function ensureEventsSyncEnvelope(db: PostgresDatabase): Promise<void> {
  const columns = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'events'
    `,
  );
  const names = new Set(columns.map((column) => column.column_name));
  if (!names.has("payload_schema_version")) {
    const migration0005 = path.resolve(__dirname, "../migrations/0005_events_sync_envelope.sql");
    await db.query(readFileSync(migration0005, "utf8"));
  }
}

async function ensureUserKdfColumns(db: PostgresDatabase): Promise<void> {
  const columns = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
    `,
  );
  const names = new Set(columns.map((column) => column.column_name));
  if (!names.has("password_kdf_salt")) {
    const migration0002 = path.resolve(__dirname, "../migrations/0002_user_password_kdf.sql");
    await db.query(readFileSync(migration0002, "utf8"));
  }
}

async function ensureUserLocaleColumn(db: PostgresDatabase): Promise<void> {
  const columns = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
    `,
  );
  const names = new Set(columns.map((column) => column.column_name));
  if (!names.has("locale")) {
    const migration0004 = path.resolve(__dirname, "../migrations/0004_user_locale.sql");
    await db.query(readFileSync(migration0004, "utf8"));
  }
}

async function ensureDevicesSchema(db: PostgresDatabase): Promise<void> {
  const columns = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'devices'
    `,
  );
  const names = new Set(columns.map((column) => column.column_name));
  if (!names.has("device_fingerprint")) {
    await db.query("ALTER TABLE devices ADD COLUMN device_fingerprint text");
    await db.query("UPDATE devices SET device_fingerprint = md5(id::text)");
    await db.query("ALTER TABLE devices ALTER COLUMN device_fingerprint SET NOT NULL");
  }
  if (!names.has("platform")) {
    await db.query(
      "ALTER TABLE devices ADD COLUMN platform text NOT NULL DEFAULT 'unknown'",
    );
  }
  if (!names.has("os_name")) {
    await db.query(
      "ALTER TABLE devices ADD COLUMN os_name text NOT NULL DEFAULT 'unknown'",
    );
  }
  if (!names.has("os_version")) {
    await db.query(
      "ALTER TABLE devices ADD COLUMN os_version text NOT NULL DEFAULT 'unknown'",
    );
  }
  if (!names.has("app_version")) {
    await db.query(
      "ALTER TABLE devices ADD COLUMN app_version text NOT NULL DEFAULT 'unknown'",
    );
  }
  if (!names.has("client_type")) {
    await db.query(
      "ALTER TABLE devices ADD COLUMN client_type text NOT NULL DEFAULT 'unknown'",
    );
  }
  if (!names.has("user_agent")) {
    await db.query(
      "ALTER TABLE devices ADD COLUMN user_agent text NOT NULL DEFAULT 'unknown'",
    );
  }
  if (!names.has("ip_first")) {
    await db.query(
      "ALTER TABLE devices ADD COLUMN ip_first text NOT NULL DEFAULT 'unknown'",
    );
  }
  if (!names.has("ip_last")) {
    await db.query(
      "ALTER TABLE devices ADD COLUMN ip_last text NOT NULL DEFAULT 'unknown'",
    );
  }
  if (!names.has("status")) {
    await db.query(
      "ALTER TABLE devices ADD COLUMN status text NOT NULL DEFAULT 'pending'",
    );
  }
  if (!names.has("revoked_at")) {
    await db.query("ALTER TABLE devices ADD COLUMN revoked_at timestamptz");
  }
  if (!names.has("approved_by")) {
    await db.query("ALTER TABLE devices ADD COLUMN approved_by uuid");
  }
  if (!names.has("approved_at")) {
    await db.query("ALTER TABLE devices ADD COLUMN approved_at timestamptz");
  }
  if (!names.has("rejected_at")) {
    await db.query("ALTER TABLE devices ADD COLUMN rejected_at timestamptz");
  }
  if (!names.has("rejection_reason")) {
    await db.query("ALTER TABLE devices ADD COLUMN rejection_reason text");
  }

  await db.query(
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'devices_user_id_device_fingerprint_device_public_key_key'
        ) THEN
          ALTER TABLE devices
          ADD CONSTRAINT devices_user_id_device_fingerprint_device_public_key_key
          UNIQUE (user_id, device_fingerprint, device_public_key);
        END IF;
      END
      $$;
    `,
  );

  await db.query(
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'devices'
            AND indexname = 'idx_devices_user_id_status'
        ) THEN
          CREATE INDEX idx_devices_user_id_status ON devices(user_id, status);
        END IF;
      END
      $$;
    `,
  );
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

  const suffix = randomUUID();
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

  const suffix = randomUUID();
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

  const suffix = randomUUID();
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
