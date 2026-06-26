import test from "node:test";
import assert from "node:assert/strict";
import { testEntityId } from "./test-entity-id.ts";
import { loadConfig } from "../src/config.ts";
import type { EmailMessage } from "../src/email/service.ts";
import { EmailTemplateService } from "../src/email/service.ts";
import { DeviceService } from "../src/device/service.ts";
import { AuthService } from "../src/auth/service.ts";
import { SessionService } from "../src/session/service.ts";
import { TwoFactorService } from "../src/two-factor/service.ts";
import { VaultService } from "../src/vault/service.ts";
import { SyncService } from "../src/sync/service.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
  flushOutboundEmailTasks,
  registerUser,
} from "./two-factor-test-helpers.ts";

function mkBlob(payload: string, cryptoVersion = 2) {
  return {
    crypto_version: cryptoVersion,
    algorithm: "opaque",
    payload: Buffer.from(payload).toString("base64"),
    meta: {},
  };
}

test("integration: register → email login (Bearer) → vault + sync → second device + approval email", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);
  const suffix = testEntityId();
  const email = `core-flow-${suffix}@okkey.local`;

  const sent: EmailMessage[] = [];
  const emailTemplates = new EmailTemplateService(
    {
      send: async (message: EmailMessage) => {
        sent.push(message);
      },
    },
    {
      from: config.emailFrom,
      defaultLocale: config.defaultEmailLocale,
      publicAppBaseUrl: config.publicAppBaseUrl,
    },
  );

  const authService = new AuthService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates,
    config,
    generateCode: () => "123456",
  });

  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
  });

  const twoFactorService = new TwoFactorService({
    redis: storage.redis,
    twoFactorRepo: storage.repositories.twoFactor,
    users: storage.repositories.users,
    authService,
    sessionService,
    config,
    emailTemplates,
  });

  const vaultService = new VaultService({
    vaults: storage.repositories.vaults,
    workspaces: storage.repositories.workspaces,
  });

  const syncService = new SyncService({
    vaults: storage.repositories.vaults,
    events: storage.repositories.events,
  });

  const deviceService = new DeviceService({
    devices: storage.repositories.devices,
    config,
    users: storage.repositories.users,
    emailTemplates,
    log: createLoggerStub(),
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);

  const loginStart = await authService.startEmailLogin({
    email,
    requestIp: "127.0.0.1",
  });
  assert.ok(sent.length >= 1);
  assert.ok(sent[0].subject.length > 0);

  const confirmed = await authService.confirmEmailCode({
    challengeId: loginStart.challengeId,
    code: "123456",
    requestIp: "127.0.0.1",
  });
  assert.equal(confirmed.userExists, true);
  assert.equal(confirmed.nextStep, "device_check");

  const session = await twoFactorService.bootstrapSessionAfterEmail({
    authStateId: confirmed.authStateId,
  });
  assert.equal(session.userId, userId);
  assert.ok(session.accessToken.length > 8);

  const wsRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = wsRows[0]?.id;
  assert.ok(workspaceId);

  const vaults = await vaultService.listWorkspaceVaults(workspaceId, userId);
  assert.ok(vaults.length >= 1);
  const vaultId = vaults[0].id;

  const vaultOne = await vaultService.getVault(vaultId, userId);
  assert.equal(vaultOne.id, vaultId);

  const created = await syncService.appendEvent(vaultId, userId, {
    eventType: "ITEM_CREATE",
    encryptedBlob: mkBlob("opaque-event-payload", 2),
    baseVersion: 0,
    idempotencyKey: testEntityId(),
  });
  assert.equal(created.eventType, "ITEM_CREATE");
  assert.equal(created.version, 1);

  const listed = await syncService.listEvents(vaultId, userId, 0);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].version, 1);

  const trustedRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM devices WHERE user_id = $1 AND status = 'trusted' ORDER BY created_at ASC",
    [userId],
  );
  const trustedDeviceId = trustedRows[0]?.id;
  assert.ok(trustedDeviceId);

  const emailCountBeforeSecondDevice = sent.length;
  const secondShare = new Uint8Array(32).fill(7);
  const reg2 = await deviceService.registerDevice(userId, "127.0.0.1", {
    deviceFingerprint: "b".repeat(64),
    devicePublicKey: Buffer.from("second-pk").toString("base64"),
    deviceShare: Buffer.from(secondShare).toString("base64"),
    deviceName: "Second",
    platform: "desktop",
    osName: "macOS",
    osVersion: "14",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "test",
  });
  assert.equal(reg2.status, "pending_approval");

  await flushOutboundEmailTasks();
  assert.ok(
    sent.length > emailCountBeforeSecondDevice,
    "device approval email should be queued/sent for pending device",
  );
});
