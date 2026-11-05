import test from "node:test";
import assert from "node:assert/strict";
import { testEntityId } from "./test-entity-id.ts";
import { loadConfig } from "../src/config.ts";
import { DeviceService } from "../src/device/service.ts";
import { createIntegrationStorage } from "./integration-env.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
  registerUser,
} from "./two-factor-test-helpers.ts";

test("integration: passkey approval writes the client share and leaves the trusted share", async (t) => {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);
  const email = `passkey-approval-${testEntityId()}@okkey.local`;
  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const registered = await registerUser(storage, config, email);
  const deviceService = new DeviceService({
    devices: storage.repositories.devices,
    config,
    users: storage.repositories.users,
    log: createLoggerStub(),
  });
  const pending = await deviceService.registerDevice(registered.userId, "127.0.0.1", {
    deviceFingerprint: "a".repeat(64),
    devicePublicKey: Buffer.from("pending-passkey-device").toString("base64"),
    deviceShare: Buffer.alloc(32, 2).toString("base64"),
    deviceName: "Pending browser",
    platform: "web",
    osName: "Linux",
    osVersion: "6",
    appVersion: "web",
    clientType: "web_app",
    userAgent: "test",
  });
  assert.equal(pending.status, "pending_approval");

  const clientShare = new Uint8Array(32).fill(9);
  const written = await storage.repositories.devices.approvePendingWithClientShare({
    userId: registered.userId,
    deviceId: pending.deviceId,
    deviceShare: clientShare,
    now: new Date().toISOString(),
    pendingCreatedBefore: new Date(Date.now() - 600_000).toISOString(),
  });
  assert.equal(written, "approved");

  const rows = await storage.postgres.query<{
    device_fingerprint: string;
    status: string;
    device_share: Buffer;
    approval_method: string | null;
  }>(
    `
      SELECT device_fingerprint, status, device_share, approval_method
      FROM devices
      WHERE user_id = $1::bigint
    `,
    [registered.userId],
  );
  const trusted = rows.find((row) => row.device_fingerprint === "f".repeat(64));
  const approved = rows.find((row) => row.device_fingerprint === "a".repeat(64));
  assert.ok(trusted);
  assert.ok(approved);
  assert.equal(trusted.status, "trusted");
  assert.deepEqual(Uint8Array.from(trusted.device_share), new Uint8Array(32).fill(11));
  assert.equal(approved.status, "trusted");
  assert.equal(approved.approval_method, "passkey");
  assert.deepEqual(Uint8Array.from(approved.device_share), clientShare);
});
