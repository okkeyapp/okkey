import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../src/config.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import { SyncService, SyncServiceError } from "../src/sync/service.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
  registerUser,
} from "./two-factor-test-helpers.ts";

function mkBlob(payload = "x", cryptoVersion = 2) {
  return {
    crypto_version: cryptoVersion,
    algorithm: "opaque",
    payload: Buffer.from(payload).toString("base64"),
    meta: {},
  };
}

test("integration: sync append/list ACCESS_DENIED for user without vault access", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `sync-access-a-${suffix}@okkey.local`;
  const emailB = `sync-access-b-${suffix}@okkey.local`;

  const syncService = new SyncService({
    vaults: storage.repositories.vaults,
    events: storage.repositories.events,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, emailB);
      await cleanupUserData(storage, emailA);
    } finally {
      await storage.close();
    }
  });

  const { userId: userA } = await registerUser(storage, config, emailA);

  const vaultRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM vaults WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = $1) LIMIT 1",
    [userA],
  );
  const vaultId = vaultRows[0]?.id;
  assert.ok(vaultId);

  const userB = await storage.repositories.users.create({
    email: emailB,
    publicKey: `pk-b-${suffix}`,
    encryptedPrivateKey: new Uint8Array([1]),
    serverKeyShare: new Uint8Array([2]),
    passwordKdfSalt: new Uint8Array(16).fill(3),
    passwordKdfParamsVersion: 1,
  });

  const body = {
    eventType: "ITEM_CREATE" as const,
    encryptedBlob: mkBlob("x", 1),
    baseVersion: 0,
    idempotencyKey: randomUUID(),
  };

  await assert.rejects(
    () => syncService.appendEvent(vaultId, userB.id, body),
    (e: unknown) => e instanceof SyncServiceError && e.code === "ACCESS_DENIED",
  );

  await assert.rejects(
    () => syncService.listEvents(vaultId, userB.id, 0),
    (e: unknown) => e instanceof SyncServiceError && e.code === "ACCESS_DENIED",
  );
});

test("integration: sync append/list VAULT_NOT_FOUND for unknown vault id", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const email = `sync-access-vnf-${suffix}@okkey.local`;

  const syncService = new SyncService({
    vaults: storage.repositories.vaults,
    events: storage.repositories.events,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const missingVaultId = randomUUID();

  await assert.rejects(
    () =>
      syncService.appendEvent(missingVaultId, userId, {
        eventType: "ITEM_CREATE",
        encryptedBlob: mkBlob("x", 1),
        baseVersion: 0,
        idempotencyKey: randomUUID(),
      }),
    (e: unknown) => e instanceof SyncServiceError && e.code === "VAULT_NOT_FOUND",
  );

  await assert.rejects(
    () => syncService.listEvents(missingVaultId, userId, 0),
    (e: unknown) => e instanceof SyncServiceError && e.code === "VAULT_NOT_FOUND",
  );
});
