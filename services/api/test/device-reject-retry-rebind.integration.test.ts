/**
 * TSK-158: after reject unbinds the session, "Request approval again" must
 * rebind on pending register (created=false) so GET /devices shows trusted
 * approvers and passkey approval options are allowed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { DeviceService } from "../src/device/service.ts";
import { SessionService } from "../src/session/service.ts";
import { hybridDeviceShareB64 } from "./hybrid-share-fixture.ts";
import { createIntegrationStorage } from "./integration-env.ts";
import { testEntityId } from "./test-entity-id.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
  registerUser,
} from "./two-factor-test-helpers.ts";

class MockResponse {
  statusCode = 200;
  body = "";
  writableEnded = false;
  setHeader(): void {}
  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

const TRUSTED_FINGERPRINT = "f".repeat(64);
const PENDING_FINGERPRINT = "a".repeat(64);

type Handler = ReturnType<ReturnType<typeof createApiApp>["handler"]>;

async function dispatch(
  handler: Handler,
  method: string,
  url: string,
  token: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; json: Record<string, unknown> }> {
  const res = new MockResponse();
  await handler(
    {
      method,
      url,
      headers: {
        authorization: `Bearer ${token}`,
        "x-forwarded-for": "203.0.113.10",
        "x-device-fingerprint": PENDING_FINGERPRINT,
        ...(headers ?? {}),
      },
      socket: { remoteAddress: "203.0.113.10" },
      body,
    } as IncomingMessage,
    res as unknown as ServerResponse,
  );
  return {
    statusCode: res.statusCode,
    json: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {},
  };
}

test("integration: reject → reopen → register rebinds unbound session for approver list", async (t) => {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);
  const email = `reject-retry-rebind-${testEntityId()}@okkey.local`;
  const deviceService = new DeviceService({
    devices: storage.repositories.devices,
    config,
    users: storage.repositories.users,
    log: createLoggerStub(),
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
  });
  const handler = createApiApp(config, createLoggerStub(), {
    deviceService,
    sessionService,
  }).handler();

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const trustedRows = await storage.postgres.query<{ id: string }>(
    `
      SELECT id
      FROM devices
      WHERE user_id = $1::bigint AND status = 'trusted' AND device_fingerprint = $2
    `,
    [userId, TRUSTED_FINGERPRINT],
  );
  const trustedId = trustedRows[0]?.id;
  assert.ok(trustedId);

  const pendingPublicKey = Buffer.from("pending-reject-retry-device").toString("base64");
  const pending = await deviceService.registerDevice(userId, "127.0.0.1", {
    deviceFingerprint: PENDING_FINGERPRINT,
    devicePublicKey: pendingPublicKey,
    deviceShare: hybridDeviceShareB64(3),
    deviceName: "Pending browser",
    platform: "web",
    osName: "Linux",
    osVersion: "6",
    appVersion: "web",
    clientType: "web_app",
    userAgent: "test-pending",
  });
  assert.equal(pending.status, "pending_approval");

  const session = await sessionService.createSession(userId, {
    deviceId: pending.deviceId,
  });

  const rejected = await deviceService.rejectDevice(
    userId,
    trustedId,
    pending.deviceId,
    "dismissed by user",
  );
  assert.equal(rejected.status, "revoked");

  const unbound = await storage.postgres.query<{ device_id: string | null }>(
    `SELECT device_id FROM sessions WHERE token_hash = $1`,
    [sessionService.hashAccessToken(session.accessToken)],
  );
  assert.equal(unbound[0]?.device_id ?? null, null);

  // reopenRejected equivalent: restore pending status for the same row.
  await storage.postgres.query(
    `
      UPDATE devices
      SET status = 'pending', rejected_at = NULL, rejection_reason = NULL, revoked_at = NULL
      WHERE id = $1::bigint AND user_id = $2::bigint
    `,
    [pending.deviceId, userId],
  );

  const before = await dispatch(handler, "GET", "/devices", session.accessToken);
  assert.equal(before.statusCode, 200);
  const beforeDevices = before.json.devices as unknown[];
  assert.equal(beforeDevices.length, 0);

  const register = await dispatch(handler, "POST", "/devices/register", session.accessToken, {
    device_fingerprint: PENDING_FINGERPRINT,
    device_public_key: pendingPublicKey,
    device_share: hybridDeviceShareB64(4),
    device_name: "Pending browser",
    platform: "web",
    os_name: "Linux",
    os_version: "6",
    app_version: "web",
    client_type: "web_app",
    user_agent: "test-pending",
  });
  assert.equal(register.statusCode, 200);
  assert.equal(register.json.status, "pending_approval");
  assert.equal(String(register.json.device_id), String(pending.deviceId));

  const rebound = await storage.postgres.query<{ device_id: string | null }>(
    `SELECT device_id FROM sessions WHERE token_hash = $1`,
    [sessionService.hashAccessToken(session.accessToken)],
  );
  assert.equal(String(rebound[0]?.device_id ?? ""), String(pending.deviceId));

  const after = await dispatch(handler, "GET", "/devices", session.accessToken);
  assert.equal(after.statusCode, 200);
  const afterDevices = after.json.devices as Array<{ device_id: string }>;
  assert.ok(afterDevices.length >= 1);
  assert.ok(afterDevices.some((row) => String(row.device_id) === String(trustedId)));
});
