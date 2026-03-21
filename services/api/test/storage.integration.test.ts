import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import {
  EventsRepository,
  UsersRepository,
  VaultsRepository,
  WorkspacesRepository,
} from "../src/storage/repositories.ts";
import { PostgresDatabase } from "../src/storage/postgres.ts";
import { VersionConflictError } from "../src/storage/errors.ts";

function createLoggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(__dirname, "../migrations/0001_init.sql");

async function ensureCoreSchema(db: PostgresDatabase): Promise<void> {
  const check = await db.query<{ regclass: string | null }>(
    "SELECT to_regclass('public.users') AS regclass",
  );
  if (check[0]?.regclass) {
    return;
  }

  const migrationSql = readFileSync(migrationPath, "utf8");
  await db.query(migrationSql);
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
    encryptedPrivateKey: new Uint8Array([1, 2, 3]),
    serverKeyShare: new Uint8Array([4, 5, 6]),
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
