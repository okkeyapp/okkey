import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { testEntityId } from "./test-entity-id.ts";
import { createApiApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { DeviceService } from "../src/device/service.ts";
import { SessionService } from "../src/session/service.ts";
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

function fingerprint(seed: string): string {
  return seed.padEnd(64, "b").slice(0, 64);
}

function registerBody(input: {
  fingerprint: string;
  publicKey: string;
  shareByte: number;
  oneTime?: boolean;
}) {
  return {
    device_public_key: Buffer.from(input.publicKey).toString("base64"),
    device_share: Buffer.alloc(32, input.shareByte).toString("base64"),
    device_fingerprint: input.fingerprint,
    device_name: "Browser",
    platform: "web",
    os_name: "Linux",
    os_version: "6",
    app_version: "web",
    client_type: "web_app",
    ...(input.oneTime
      ? {
          one_time_x25519_public_key: Buffer.alloc(32, 3).toString("base64"),
          one_time_mlkem_public_key: Buffer.alloc(1184, 4).toString("base64"),
        }
      : {}),
  };
}

function hybridEnvelope(): string {
  const bytes = Buffer.alloc(1148 + 16, 9);
  bytes[0] = 1;
  bytes[1] = 1;
  bytes[2] = 1;
  bytes[3] = 0;
  return bytes.toString("base64");
}

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

async function bindApprover(
  storage: NonNullable<Awaited<ReturnType<typeof createIntegrationStorage>>>,
  sessionService: SessionService,
  userId: string,
  accessToken: string,
  deviceId: string,
): Promise<void> {
  const bound = await storage.repositories.sessions.bindDevice({
    tokenHash: sessionService.hashAccessToken(accessToken),
    userId,
    deviceId,
  });
  assert.equal(bound, true);
}

async function deviceRow(
  storage: NonNullable<Awaited<ReturnType<typeof createIntegrationStorage>>>,
  deviceId: string,
) {
  const rows = await storage.postgres.query<{
    status: string;
    device_share: Buffer;
    share_delivery_envelope: Buffer | null;
    one_time_x25519_public: Buffer | null;
    one_time_mlkem_public: Buffer | null;
  }>(
    `
      SELECT status, device_share, share_delivery_envelope,
             one_time_x25519_public, one_time_mlkem_public
      FROM devices
      WHERE id = $1::bigint
    `,
    [deviceId],
  );
  return rows[0];
}

test("integration: new-to-new approval delivers share B once and deletes the envelope", async (t) => {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);
  const email = `share-delivery-${testEntityId()}@okkey.local`;
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
  const trustedRows = await storage.postgres.query<{ id: string; device_share: Buffer }>(
    `
      SELECT id, device_share
      FROM devices
      WHERE user_id = $1::bigint AND status = 'trusted'
    `,
    [userId],
  );
  const trusted = trustedRows[0];
  assert.ok(trusted);
  const approver = await sessionService.createSession(userId);
  await bindApprover(storage, sessionService, userId, approver.accessToken, trusted.id);
  const pendingSession = await sessionService.createSession(userId);

  const registered = await dispatch(
    handler,
    "POST",
    "/devices/register",
    pendingSession.accessToken,
    registerBody({
      fingerprint: fingerprint("a"),
      publicKey: "pending-new",
      shareByte: 7,
      oneTime: true,
    }),
  );
  assert.equal(registered.statusCode, 200);
  assert.equal(registered.json.status, "pending_approval");
  const pendingId = String(registered.json.device_id);

  const listed = await dispatch(
    handler,
    "GET",
    "/devices",
    approver.accessToken,
    undefined,
    { "x-device-id": trusted.id },
  );
  assert.equal(listed.statusCode, 200);
  const pending = (listed.json.pending as Array<Record<string, string>>).find(
    (row) => row.device_id === pendingId,
  );
  assert.ok(pending);
  assert.equal(typeof pending.one_time_x25519_public_key, "string");
  assert.equal(typeof pending.one_time_mlkem_public_key, "string");

  const tampered = await dispatch(
    handler,
    "POST",
    `/devices/${pendingId}/approve`,
    approver.accessToken,
    { share_delivery_envelope: Buffer.from("short").toString("base64") },
    { "x-device-id": trusted.id },
  );
  assert.equal(tampered.statusCode, 400);
  assert.equal(tampered.json.error, "DEVICE_SHARE_DELIVERY_INVALID");

  const approved = await dispatch(
    handler,
    "POST",
    `/devices/${pendingId}/approve`,
    approver.accessToken,
    { share_delivery_envelope: hybridEnvelope() },
    { "x-device-id": trusted.id },
  );
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.json.status, "pending_approval");

  const beforeClaim = await deviceRow(storage, pendingId);
  assert.equal(beforeClaim?.status, "pending");
  assert.ok(beforeClaim?.share_delivery_envelope);
  assert.deepEqual(Uint8Array.from(beforeClaim.device_share), new Uint8Array(32).fill(7));
  assert.notDeepEqual(Uint8Array.from(beforeClaim.device_share), Uint8Array.from(trusted.device_share));

  const fetched = await dispatch(
    handler,
    "GET",
    `/devices/${pendingId}/share-delivery`,
    pendingSession.accessToken,
  );
  assert.equal(fetched.statusCode, 200);
  assert.equal(typeof fetched.json.share_delivery_envelope, "string");

  const delivered = Buffer.alloc(32, 9).toString("base64");
  const confirmed = await dispatch(
    handler,
    "POST",
    `/devices/${pendingId}/share-delivery/confirm`,
    pendingSession.accessToken,
    { device_share: delivered },
  );
  assert.equal(confirmed.statusCode, 200);
  assert.equal(confirmed.json.status, "trusted");

  const afterClaim = await deviceRow(storage, pendingId);
  assert.equal(afterClaim?.status, "trusted");
  assert.equal(afterClaim?.share_delivery_envelope, null);
  assert.equal(afterClaim?.one_time_x25519_public, null);
  assert.equal(afterClaim?.one_time_mlkem_public, null);
  assert.deepEqual(Uint8Array.from(afterClaim!.device_share), new Uint8Array(32).fill(9));

  const gone = await dispatch(
    handler,
    "GET",
    `/devices/${pendingId}/share-delivery`,
    pendingSession.accessToken,
  );
  assert.equal(gone.statusCode, 404);

  const reused = await dispatch(
    handler,
    "POST",
    `/devices/${pendingId}/share-delivery/confirm`,
    pendingSession.accessToken,
    { device_share: delivered },
  );
  assert.equal(reused.statusCode, 404);
});

test("integration: older client on either side still completes approval", async (t) => {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);
  const email = `share-delivery-mixed-${testEntityId()}@okkey.local`;
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
  const trustedRows = await storage.postgres.query<{ id: string; device_share: Buffer }>(
    `SELECT id, device_share FROM devices WHERE user_id = $1::bigint AND status = 'trusted'`,
    [userId],
  );
  const trusted = trustedRows[0];
  assert.ok(trusted);
  const approver = await sessionService.createSession(userId);
  await bindApprover(storage, sessionService, userId, approver.accessToken, trusted.id);

  const oldPendingSession = await sessionService.createSession(userId);
  const oldPending = await dispatch(
    handler,
    "POST",
    "/devices/register",
    oldPendingSession.accessToken,
    registerBody({
      fingerprint: fingerprint("c"),
      publicKey: "pending-old",
      shareByte: 5,
    }),
  );
  assert.equal(oldPending.statusCode, 200);
  const oldPendingId = String(oldPending.json.device_id);
  const oldApproved = await dispatch(
    handler,
    "POST",
    `/devices/${oldPendingId}/approve`,
    approver.accessToken,
    {},
    { "x-device-id": trusted.id },
  );
  assert.equal(oldApproved.statusCode, 200);
  assert.equal(oldApproved.json.status, "trusted");
  const oldRow = await deviceRow(storage, oldPendingId);
  assert.deepEqual(Uint8Array.from(oldRow!.device_share), Uint8Array.from(trusted.device_share));

  const newPendingSession = await sessionService.createSession(userId);
  const newPending = await dispatch(
    handler,
    "POST",
    "/devices/register",
    newPendingSession.accessToken,
    registerBody({
      fingerprint: fingerprint("d"),
      publicKey: "pending-with-key",
      shareByte: 6,
      oneTime: true,
    }),
  );
  assert.equal(newPending.statusCode, 200);
  const newPendingId = String(newPending.json.device_id);
  const legacyApproved = await dispatch(
    handler,
    "POST",
    `/devices/${newPendingId}/approve`,
    approver.accessToken,
    {},
    { "x-device-id": trusted.id },
  );
  assert.equal(legacyApproved.statusCode, 200);
  assert.equal(legacyApproved.json.status, "trusted");
  const newRow = await deviceRow(storage, newPendingId);
  assert.deepEqual(Uint8Array.from(newRow!.device_share), Uint8Array.from(trusted.device_share));
  assert.equal(newRow?.share_delivery_envelope, null);
  assert.equal(newRow?.one_time_x25519_public, null);
  assert.equal(newRow?.one_time_mlkem_public, null);
});

test("integration: expired unclaimed share delivery envelope is deleted", async (t) => {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);
  const email = `share-delivery-expired-${testEntityId()}@okkey.local`;
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
    `SELECT id FROM devices WHERE user_id = $1::bigint AND status = 'trusted'`,
    [userId],
  );
  const trusted = trustedRows[0];
  assert.ok(trusted);
  const approver = await sessionService.createSession(userId);
  await bindApprover(storage, sessionService, userId, approver.accessToken, trusted.id);
  const pendingSession = await sessionService.createSession(userId);
  const registered = await dispatch(
    handler,
    "POST",
    "/devices/register",
    pendingSession.accessToken,
    registerBody({
      fingerprint: fingerprint("e"),
      publicKey: "pending-expire",
      shareByte: 8,
      oneTime: true,
    }),
  );
  assert.equal(registered.statusCode, 200);
  const pendingId = String(registered.json.device_id);
  const approved = await dispatch(
    handler,
    "POST",
    `/devices/${pendingId}/approve`,
    approver.accessToken,
    { share_delivery_envelope: hybridEnvelope() },
    { "x-device-id": trusted.id },
  );
  assert.equal(approved.statusCode, 200);

  await storage.postgres.query(
    `
      UPDATE devices
      SET share_delivery_expires_at = now() - interval '1 second'
      WHERE id = $1::bigint
    `,
    [pendingId],
  );

  const fetched = await dispatch(
    handler,
    "GET",
    `/devices/${pendingId}/share-delivery`,
    pendingSession.accessToken,
  );
  assert.equal(fetched.statusCode, 404);
  const row = await deviceRow(storage, pendingId);
  assert.equal(row?.share_delivery_envelope, null);
  assert.equal(row?.status, "pending");
});

test("integration: empty approve of an already-trusted device is 409", async (t) => {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);
  const email = `share-delivery-trusted-${testEntityId()}@okkey.local`;
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
    `SELECT id FROM devices WHERE user_id = $1::bigint AND status = 'trusted'`,
    [userId],
  );
  const trusted = trustedRows[0];
  assert.ok(trusted);
  const approver = await sessionService.createSession(userId);
  await bindApprover(storage, sessionService, userId, approver.accessToken, trusted.id);

  const again = await dispatch(
    handler,
    "POST",
    `/devices/${trusted.id}/approve`,
    approver.accessToken,
    {},
    { "x-device-id": trusted.id },
  );
  assert.equal(again.statusCode, 409);
  assert.equal(again.json.error, "DEVICE_APPROVAL_ALREADY_RESOLVED");
});

test("integration: replacing one-time keys drops an unclaimed envelope", async (t) => {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);
  const email = `share-delivery-rotate-${testEntityId()}@okkey.local`;
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
    `SELECT id FROM devices WHERE user_id = $1::bigint AND status = 'trusted'`,
    [userId],
  );
  const trusted = trustedRows[0];
  assert.ok(trusted);
  const approver = await sessionService.createSession(userId);
  await bindApprover(storage, sessionService, userId, approver.accessToken, trusted.id);
  const pendingSession = await sessionService.createSession(userId);
  const registered = await dispatch(
    handler,
    "POST",
    "/devices/register",
    pendingSession.accessToken,
    registerBody({
      fingerprint: fingerprint("f"),
      publicKey: "pending-rotate",
      shareByte: 4,
      oneTime: true,
    }),
  );
  assert.equal(registered.statusCode, 200);
  const pendingId = String(registered.json.device_id);
  const approved = await dispatch(
    handler,
    "POST",
    `/devices/${pendingId}/approve`,
    approver.accessToken,
    { share_delivery_envelope: hybridEnvelope() },
    { "x-device-id": trusted.id },
  );
  assert.equal(approved.statusCode, 200);

  const rotated = await dispatch(
    handler,
    "POST",
    "/devices/register",
    pendingSession.accessToken,
    {
      ...registerBody({
        fingerprint: fingerprint("f"),
        publicKey: "pending-rotate",
        shareByte: 4,
      }),
      one_time_x25519_public_key: Buffer.alloc(32, 8).toString("base64"),
      one_time_mlkem_public_key: Buffer.alloc(1184, 9).toString("base64"),
    },
  );
  assert.equal(rotated.statusCode, 200);
  assert.equal(rotated.json.status, "pending_approval");
  const row = await deviceRow(storage, pendingId);
  assert.equal(row?.status, "pending");
  assert.equal(row?.share_delivery_envelope, null);
  assert.deepEqual(Uint8Array.from(row!.one_time_x25519_public!), new Uint8Array(32).fill(8));
});
