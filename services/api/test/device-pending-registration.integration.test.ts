import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { testEntityId } from "./test-entity-id.ts";
import { createApiApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { DeviceService } from "../src/device/service.ts";
import { SessionService } from "../src/session/service.ts";
import { MAX_PENDING_DEVICES_PER_ACCOUNT } from "../src/storage/repositories.ts";
import { createIntegrationStorage } from "./integration-env.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
  registerUser,
} from "./two-factor-test-helpers.ts";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";

  setHeader(): void {}

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

const TRUSTED_FINGERPRINT = "f".repeat(64);

function publicKey(label: string): string {
  return Buffer.from(label).toString("base64");
}

function otherFingerprint(n: number): string {
  return n.toString(16).padStart(64, "a");
}

function registerBody(input: {
  fingerprint: string;
  publicKey: string;
  recoveryPending?: boolean;
}) {
  return {
    device_public_key: input.publicKey,
    device_share: Buffer.alloc(32, 7).toString("base64"),
    device_fingerprint: input.fingerprint,
    device_name: "Browser",
    platform: "web",
    os_name: "Linux",
    os_version: "6",
    app_version: "web",
    client_type: "web_app",
    ...(input.recoveryPending ? { metadata: { recovery_pending: true } } : {}),
  };
}

type Handler = ReturnType<ReturnType<typeof createApiApp>["handler"]>;

async function dispatch(
  handler: Handler,
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<{ statusCode: number; json: Record<string, unknown> }> {
  const res = new MockResponse();
  await handler(
    {
      method,
      url,
      headers: {
        authorization: `Bearer ${token}`,
        "x-forwarded-for": "203.0.113.10",
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

test("integration: recovery_pending replaces the pending row for the same fingerprint", async (t) => {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);
  const email = `pending-replace-${testEntityId()}@okkey.local`;
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
  const trustedRows = await storage.postgres.query<{
    id: string;
    device_public_key: string;
  }>(
    `
      SELECT id, device_public_key
      FROM devices
      WHERE user_id = $1 AND status = 'trusted' AND device_fingerprint = $2
    `,
    [userId, TRUSTED_FINGERPRINT],
  );
  const trusted = trustedRows[0];
  assert.ok(trusted);

  const caller = await sessionService.createSession(userId);
  const other = await sessionService.createSession(userId);
  const first = await dispatch(
    handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: TRUSTED_FINGERPRINT,
      publicKey: publicKey("recovery-key-1"),
      recoveryPending: true,
    }),
  );
  assert.equal(first.statusCode, 200);
  assert.equal(first.json.status, "pending_approval");
  const firstPendingId = String(first.json.device_id);
  assert.notEqual(firstPendingId, trusted.id);

  const boundOther = await storage.repositories.sessions.bindDevice({
    tokenHash: sessionService.hashAccessToken(other.accessToken),
    userId,
    deviceId: firstPendingId,
  });
  assert.equal(boundOther, true);

  const second = await dispatch(
    handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: TRUSTED_FINGERPRINT,
      publicKey: publicKey("recovery-key-2"),
      recoveryPending: true,
    }),
  );
  assert.equal(second.statusCode, 200);
  assert.equal(second.json.status, "pending_approval");
  const secondPendingId = String(second.json.device_id);
  assert.notEqual(secondPendingId, firstPendingId);

  const third = await dispatch(
    handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: TRUSTED_FINGERPRINT,
      publicKey: publicKey("recovery-key-3"),
      recoveryPending: true,
    }),
  );
  assert.equal(third.statusCode, 200);
  const thirdPendingId = String(third.json.device_id);
  assert.notEqual(thirdPendingId, secondPendingId);

  const sameKey = await dispatch(
    handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: TRUSTED_FINGERPRINT,
      publicKey: publicKey("recovery-key-3"),
      recoveryPending: true,
    }),
  );
  assert.equal(sameKey.statusCode, 200);
  assert.equal(String(sameKey.json.device_id), thirdPendingId);

  const pending = await storage.postgres.query<{
    id: string;
    device_public_key: string;
    device_fingerprint: string;
  }>(
    `
      SELECT id, device_public_key, device_fingerprint
      FROM devices
      WHERE user_id = $1 AND status = 'pending'
    `,
    [userId],
  );
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.id, thirdPendingId);
  assert.equal(pending[0]?.device_fingerprint, TRUSTED_FINGERPRINT);
  assert.equal(pending[0]?.device_public_key, publicKey("recovery-key-3"));

  const trustedAfter = await storage.postgres.query<{ device_public_key: string }>(
    "SELECT device_public_key FROM devices WHERE id = $1",
    [trusted.id],
  );
  assert.equal(trustedAfter[0]?.device_public_key, trusted.device_public_key);

  const sessions = await storage.postgres.query<{ token_hash: string; device_id: string | null }>(
    "SELECT token_hash, device_id::text AS device_id FROM sessions WHERE user_id = $1",
    [userId],
  );
  const callerHash = sessionService.hashAccessToken(caller.accessToken);
  const otherHash = sessionService.hashAccessToken(other.accessToken);
  assert.equal(
    sessions.some((row) => row.token_hash === otherHash),
    false,
  );
  const callerRow = sessions.find((row) => row.token_hash === callerHash);
  assert.ok(callerRow);
  assert.equal(callerRow.device_id, thirdPendingId);

  const trustedSession = await sessionService.createSession(userId, { deviceId: trusted.id });
  const listed = await dispatch(handler, "GET", "/devices", trustedSession.accessToken);
  assert.equal(listed.statusCode, 200);
  const pendingList = listed.json.pending as Array<{ device_id: string; device_fingerprint: string }>;
  assert.equal(pendingList.length, 1);
  assert.equal(pendingList[0]?.device_id, thirdPendingId);
  assert.equal(pendingList[0]?.device_fingerprint, TRUSTED_FINGERPRINT);
});

test("integration: pending device cap returns DEVICE_PENDING_LIMIT", async (t) => {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);
  const email = `pending-limit-${testEntityId()}@okkey.local`;
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
  const caller = await sessionService.createSession(userId);

  const first = await dispatch(
    handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: TRUSTED_FINGERPRINT,
      publicKey: publicKey("recovery-key-1"),
      recoveryPending: true,
    }),
  );
  assert.equal(first.statusCode, 200);
  const firstPendingId = String(first.json.device_id);

  for (let n = 1; n < MAX_PENDING_DEVICES_PER_ACCOUNT; n += 1) {
    const created = await dispatch(
      handler,
      "POST",
      "/devices/register",
      caller.accessToken,
      registerBody({
        fingerprint: otherFingerprint(n),
        publicKey: publicKey(`pending-key-${n}`),
      }),
    );
    assert.equal(created.statusCode, 200, `pending slot ${n}`);
    assert.equal(created.json.status, "pending_approval");
  }

  const overflow = await dispatch(
    handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: otherFingerprint(MAX_PENDING_DEVICES_PER_ACCOUNT + 1),
      publicKey: publicKey("pending-overflow"),
    }),
  );
  assert.equal(overflow.statusCode, 409);
  assert.equal(overflow.json.error, "DEVICE_PENDING_LIMIT");
  assert.equal(overflow.json.message, "pending device limit reached");
  assert.deepEqual(overflow.json.details, { limit: MAX_PENDING_DEVICES_PER_ACCOUNT });
  assert.equal(typeof overflow.json.requestId, "string");
  assert.ok(String(overflow.json.requestId).length > 0);

  const recoveryOverflow = await dispatch(
    handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: "c".repeat(64),
      publicKey: publicKey("recovery-overflow"),
      recoveryPending: true,
    }),
  );
  assert.equal(recoveryOverflow.statusCode, 409);
  assert.equal(recoveryOverflow.json.error, "DEVICE_PENDING_LIMIT");
  assert.equal(recoveryOverflow.json.message, "pending device limit reached");

  const replaced = await dispatch(
    handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: TRUSTED_FINGERPRINT,
      publicKey: publicKey("recovery-key-2"),
      recoveryPending: true,
    }),
  );
  assert.equal(replaced.statusCode, 200);
  assert.equal(replaced.json.status, "pending_approval");
  assert.notEqual(String(replaced.json.device_id), firstPendingId);

  const pending = await storage.postgres.query<{
    id: string;
    device_fingerprint: string;
    device_public_key: string;
  }>(
    `
      SELECT id, device_fingerprint, device_public_key
      FROM devices
      WHERE user_id = $1 AND status = 'pending'
    `,
    [userId],
  );
  assert.equal(pending.length, MAX_PENDING_DEVICES_PER_ACCOUNT);
  const forFingerprint = pending.filter((row) => row.device_fingerprint === TRUSTED_FINGERPRINT);
  assert.equal(forFingerprint.length, 1);
  assert.equal(forFingerprint[0]?.id, String(replaced.json.device_id));
  assert.equal(forFingerprint[0]?.device_public_key, publicKey("recovery-key-2"));
});
