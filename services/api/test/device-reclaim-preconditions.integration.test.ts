import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { testEntityId } from "./test-entity-id.ts";
import { createApiApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { DeviceService } from "../src/device/service.ts";
import { SessionService } from "../src/session/service.ts";
import { createIntegrationStorage } from "./integration-env.ts";
import { hybridDeviceShareBytes } from "./hybrid-share-fixture.ts";
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

/** Structured fingerprint for a browser that is not the stored trusted device. */
const NEW_BROWSER_FINGERPRINT = "web_app-chrome-linux-6";

type TrustedRow = {
  id: string;
  device_fingerprint: string;
  device_public_key: string;
  device_share_b64: string;
  client_type: string;
  status: string;
};

type Handler = ReturnType<ReturnType<typeof createApiApp>["handler"]>;

function requestShare(fill: number): Buffer {
  return Buffer.from(hybridDeviceShareBytes(fill));
}

function registerBody(input: {
  fingerprint: string;
  publicKey: string;
  share: Buffer;
  reclaimSoleTrusted?: boolean;
  previousDeviceId?: string;
  previousDeviceFingerprint?: string;
  clientType?: string;
}) {
  const metadata: Record<string, unknown> = {};
  if (input.reclaimSoleTrusted === true) {
    metadata.reclaim_sole_trusted = true;
  }
  if (input.previousDeviceId !== undefined) {
    metadata.previous_device_id = input.previousDeviceId;
  }
  if (input.previousDeviceFingerprint !== undefined) {
    metadata.previous_device_fingerprint = input.previousDeviceFingerprint;
  }
  return {
    device_public_key: input.publicKey,
    device_share: input.share.toString("base64"),
    device_fingerprint: input.fingerprint,
    device_name: "Other browser",
    platform: "web",
    os_name: "Linux",
    os_version: "6",
    app_version: "web",
    client_type: input.clientType ?? "web_app",
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

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
        "x-forwarded-for": "203.0.113.50",
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0",
      },
      socket: { remoteAddress: "203.0.113.50" },
      body,
    } as IncomingMessage,
    res as unknown as ServerResponse,
  );
  return {
    statusCode: res.statusCode,
    json: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {},
  };
}

async function listTrusted(
  storage: NonNullable<Awaited<ReturnType<typeof createIntegrationStorage>>>,
  userId: string,
): Promise<TrustedRow[]> {
  const rows = await storage.postgres.query<{
    id: string;
    device_fingerprint: string;
    device_public_key: string;
    device_share: Buffer;
    client_type: string;
    status: string;
  }>(
    `
      SELECT id, device_fingerprint, device_public_key, device_share, client_type, status
      FROM devices
      WHERE user_id = $1::bigint AND status = 'trusted'
      ORDER BY id
    `,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    device_fingerprint: row.device_fingerprint,
    device_public_key: row.device_public_key,
    device_share_b64: Buffer.from(row.device_share).toString("base64"),
    client_type: row.client_type,
    status: row.status,
  }));
}

/**
 * A new full session (no device binding) registers with reclaim_sole_trusted
 * and a fingerprint that does not match the stored trusted device.
 * The server must reject the request and leave the trusted row unchanged.
 */
test("integration: reclaim_sole_trusted from an unbound new device is rejected", async (t) => {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);
  const email = `reclaim-unbound-${testEntityId()}@okkey.local`;
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
  const before = await listTrusted(storage, userId);
  assert.equal(before.length, 1);
  const trusted = before[0];
  assert.ok(trusted);
  assert.notEqual(trusted.device_fingerprint, NEW_BROWSER_FINGERPRINT);

  const caller = await sessionService.createSession(userId);
  const bound = await storage.postgres.query<{ device_id: string | null }>(
    `SELECT device_id FROM sessions WHERE token_hash = $1`,
    [sessionService.hashAccessToken(caller.accessToken)],
  );
  assert.equal(bound[0]?.device_id ?? null, null);

  const replacementShare = requestShare(9);
  const response = await dispatch(handler, "POST", "/devices/register", caller.accessToken, registerBody({
    fingerprint: NEW_BROWSER_FINGERPRINT,
    publicKey: Buffer.from("unbound-browser-key").toString("base64"),
    share: replacementShare,
    reclaimSoleTrusted: true,
  }));

  assert.equal(response.statusCode, 403);
  assert.equal(response.json.error, "DEVICE_RECLAIM_PRECONDITION_FAILED");

  const after = await listTrusted(storage, userId);
  assert.equal(after.length, 1);
  assert.deepEqual(after[0], trusted);

  const allRows = await storage.postgres.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM devices WHERE user_id = $1::bigint`,
    [userId],
  );
  assert.equal(allRows[0]?.n, "1");
});

const STORED_LEGACY_FINGERPRINT = "f".repeat(64);
const STRUCTURED_STORED_FINGERPRINT = "web_app-firefox-macos-14";

type Storage = NonNullable<Awaited<ReturnType<typeof createIntegrationStorage>>>;

async function countDevices(storage: Storage, userId: string): Promise<number> {
  const rows = await storage.postgres.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM devices WHERE user_id = $1::bigint`,
    [userId],
  );
  return Number(rows[0]?.n ?? 0);
}

async function setTrustedRow(
  storage: Storage,
  deviceId: string,
  patch: { fingerprint?: string; clientType?: string },
): Promise<void> {
  await storage.postgres.query(
    `
      UPDATE devices
      SET
        device_fingerprint = COALESCE($2, device_fingerprint),
        client_type = COALESCE($3, client_type)
      WHERE id = $1::bigint
    `,
    [deviceId, patch.fingerprint ?? null, patch.clientType ?? null],
  );
}

function assertReclaimRejected(response: { statusCode: number; json: Record<string, unknown> }): void {
  assert.equal(response.statusCode, 403);
  assert.equal(response.json.error, "DEVICE_RECLAIM_PRECONDITION_FAILED");
}

async function withRegisteredUser(
  t: TestContext,
  label: string,
): Promise<{
  storage: Storage;
  handler: Handler;
  sessionService: SessionService;
  userId: string;
} | null> {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return null;
  }
  await applyMigrations(storage);
  const email = `reclaim-${label}-${testEntityId()}@okkey.local`;
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
  return { storage, handler, sessionService, userId };
}

test("integration: reclaim is rejected when the stored fingerprint is not legacy", async (t) => {
  const ctx = await withRegisteredUser(t, "non-legacy");
  if (!ctx) return;
  const before = await listTrusted(ctx.storage, ctx.userId);
  const trusted = before[0];
  assert.ok(trusted);
  await setTrustedRow(ctx.storage, trusted.id, {
    fingerprint: STRUCTURED_STORED_FINGERPRINT,
    clientType: "web",
  });
  const stored = (await listTrusted(ctx.storage, ctx.userId))[0];
  assert.ok(stored);
  const caller = await ctx.sessionService.createSession(ctx.userId, { deviceId: stored.id });
  const response = await dispatch(
    ctx.handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: NEW_BROWSER_FINGERPRINT,
      publicKey: Buffer.from("non-legacy-key").toString("base64"),
      share: requestShare(4),
      reclaimSoleTrusted: true,
      previousDeviceId: stored.id,
      previousDeviceFingerprint: stored.device_fingerprint,
      clientType: "web_app",
    }),
  );
  assertReclaimRejected(response);
  assert.deepEqual(await listTrusted(ctx.storage, ctx.userId), [stored]);
  assert.equal(await countDevices(ctx.storage, ctx.userId), 1);
});

test("integration: reclaim is rejected when the previous device link is missing", async (t) => {
  const ctx = await withRegisteredUser(t, "missing-link");
  if (!ctx) return;
  const trusted = (await listTrusted(ctx.storage, ctx.userId))[0];
  assert.ok(trusted);
  await setTrustedRow(ctx.storage, trusted.id, { clientType: "web" });
  const stored = (await listTrusted(ctx.storage, ctx.userId))[0];
  assert.ok(stored);
  assert.equal(stored.device_fingerprint, STORED_LEGACY_FINGERPRINT);
  const caller = await ctx.sessionService.createSession(ctx.userId, { deviceId: stored.id });
  const response = await dispatch(
    ctx.handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: NEW_BROWSER_FINGERPRINT,
      publicKey: Buffer.from("missing-link-key").toString("base64"),
      share: requestShare(5),
      reclaimSoleTrusted: true,
    }),
  );
  assertReclaimRejected(response);
  assert.deepEqual(await listTrusted(ctx.storage, ctx.userId), [stored]);
});

test("integration: reclaim is rejected when the previous device link does not match", async (t) => {
  const ctx = await withRegisteredUser(t, "mismatch-link");
  if (!ctx) return;
  const trusted = (await listTrusted(ctx.storage, ctx.userId))[0];
  assert.ok(trusted);
  await setTrustedRow(ctx.storage, trusted.id, { clientType: "web" });
  const stored = (await listTrusted(ctx.storage, ctx.userId))[0];
  assert.ok(stored);
  const pendingShare = Buffer.alloc(32, 6);
  const pendingId = testEntityId();
  await ctx.storage.postgres.query(
    `
      INSERT INTO devices (
        id, user_id, device_fingerprint, device_name, device_public_key, device_share,
        platform, os_name, os_version, app_version, client_type, user_agent,
        ip_first, ip_last, status
      ) VALUES (
        $1::bigint, $2::bigint, $3, 'Pending', 'cGVuZGluZw==', $4,
        'web', 'Linux', '6', 'web', 'web_app', 'test',
        '127.0.0.1', '127.0.0.1', 'pending'
      )
    `,
    [pendingId, ctx.userId, NEW_BROWSER_FINGERPRINT, pendingShare],
  );
  const caller = await ctx.sessionService.createSession(ctx.userId, { deviceId: stored.id });
  const mismatchedFingerprint = await dispatch(
    ctx.handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: NEW_BROWSER_FINGERPRINT,
      publicKey: Buffer.from("mismatch-fp-key").toString("base64"),
      share: requestShare(8),
      reclaimSoleTrusted: true,
      previousDeviceId: stored.id,
      previousDeviceFingerprint: "a".repeat(64),
    }),
  );
  assertReclaimRejected(mismatchedFingerprint);
  const mismatchedId = await dispatch(
    ctx.handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: NEW_BROWSER_FINGERPRINT,
      publicKey: Buffer.from("mismatch-id-key").toString("base64"),
      share: requestShare(8),
      reclaimSoleTrusted: true,
      previousDeviceId: testEntityId(),
      previousDeviceFingerprint: stored.device_fingerprint,
    }),
  );
  assertReclaimRejected(mismatchedId);
  assert.deepEqual(await listTrusted(ctx.storage, ctx.userId), [stored]);
  const pending = await ctx.storage.postgres.query<{ id: string; device_share: Buffer }>(
    `SELECT id, device_share FROM devices WHERE id = $1::bigint`,
    [pendingId],
  );
  assert.equal(pending[0]?.id, pendingId);
  assert.equal(Buffer.from(pending[0]?.device_share ?? []).toString("base64"), pendingShare.toString("base64"));
  assert.equal(await countDevices(ctx.storage, ctx.userId), 2);
});

test("integration: reclaim is rejected when the session is not bound to the trusted device", async (t) => {
  const ctx = await withRegisteredUser(t, "unbound-link");
  if (!ctx) return;
  const trusted = (await listTrusted(ctx.storage, ctx.userId))[0];
  assert.ok(trusted);
  await setTrustedRow(ctx.storage, trusted.id, { clientType: "web" });
  const stored = (await listTrusted(ctx.storage, ctx.userId))[0];
  assert.ok(stored);
  const caller = await ctx.sessionService.createSession(ctx.userId);
  const response = await dispatch(
    ctx.handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: NEW_BROWSER_FINGERPRINT,
      publicKey: Buffer.from("unbound-link-key").toString("base64"),
      share: requestShare(3),
      reclaimSoleTrusted: true,
      previousDeviceId: stored.id,
      previousDeviceFingerprint: stored.device_fingerprint,
    }),
  );
  assertReclaimRejected(response);
  assert.deepEqual(await listTrusted(ctx.storage, ctx.userId), [stored]);
});

test("integration: reclaim is rejected when the stored client type is incompatible", async (t) => {
  const ctx = await withRegisteredUser(t, "client-type");
  if (!ctx) return;
  const trusted = (await listTrusted(ctx.storage, ctx.userId))[0];
  assert.ok(trusted);
  assert.equal(trusted.client_type, "desktop");
  const caller = await ctx.sessionService.createSession(ctx.userId, { deviceId: trusted.id });
  const response = await dispatch(
    ctx.handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: NEW_BROWSER_FINGERPRINT,
      publicKey: Buffer.from("client-type-key").toString("base64"),
      share: requestShare(2),
      reclaimSoleTrusted: true,
      previousDeviceId: trusted.id,
      previousDeviceFingerprint: trusted.device_fingerprint,
      clientType: "web_app",
    }),
  );
  assertReclaimRejected(response);
  assert.deepEqual(await listTrusted(ctx.storage, ctx.userId), [trusted]);
});

test("integration: reclaim is rejected when more than one trusted device exists", async (t) => {
  const ctx = await withRegisteredUser(t, "two-trusted");
  if (!ctx) return;
  const trusted = (await listTrusted(ctx.storage, ctx.userId))[0];
  assert.ok(trusted);
  await setTrustedRow(ctx.storage, trusted.id, { clientType: "web" });
  const secondId = testEntityId();
  const secondShare = Buffer.alloc(32, 12);
  await ctx.storage.postgres.query(
    `
      INSERT INTO devices (
        id, user_id, device_fingerprint, device_name, device_public_key, device_share,
        platform, os_name, os_version, app_version, client_type, user_agent,
        ip_first, ip_last, status
      ) VALUES (
        $1::bigint, $2::bigint, $3, 'Second', 'c2Vjb25k', $4,
        'web', 'Linux', '6', 'web', 'web', 'test',
        '127.0.0.1', '127.0.0.1', 'trusted'
      )
    `,
    [secondId, ctx.userId, "e".repeat(64), secondShare],
  );
  const before = await listTrusted(ctx.storage, ctx.userId);
  assert.equal(before.length, 2);
  const caller = await ctx.sessionService.createSession(ctx.userId, { deviceId: trusted.id });
  const response = await dispatch(
    ctx.handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: NEW_BROWSER_FINGERPRINT,
      publicKey: Buffer.from("two-trusted-key").toString("base64"),
      share: requestShare(1),
      reclaimSoleTrusted: true,
      previousDeviceId: trusted.id,
      previousDeviceFingerprint: STORED_LEGACY_FINGERPRINT,
    }),
  );
  assertReclaimRejected(response);
  assert.deepEqual(await listTrusted(ctx.storage, ctx.userId), before);
  assert.equal(await countDevices(ctx.storage, ctx.userId), 2);
});

test("integration: legacy sole-device reclaim keeps the stored share", async (t) => {
  const ctx = await withRegisteredUser(t, "legacy-ok");
  if (!ctx) return;
  const trusted = (await listTrusted(ctx.storage, ctx.userId))[0];
  assert.ok(trusted);
  await setTrustedRow(ctx.storage, trusted.id, { clientType: "web" });
  const stored = (await listTrusted(ctx.storage, ctx.userId))[0];
  assert.ok(stored);
  const caller = await ctx.sessionService.createSession(ctx.userId, { deviceId: stored.id });
  const bound = await ctx.storage.postgres.query<{ device_id: string | null }>(
    `SELECT device_id FROM sessions WHERE token_hash = $1`,
    [ctx.sessionService.hashAccessToken(caller.accessToken)],
  );
  assert.equal(bound[0]?.device_id, stored.id);
  const nextKey = Buffer.from("legacy-upgrade-key").toString("base64");
  const response = await dispatch(
    ctx.handler,
    "POST",
    "/devices/register",
    caller.accessToken,
    registerBody({
      fingerprint: NEW_BROWSER_FINGERPRINT,
      publicKey: nextKey,
      share: requestShare(15),
      reclaimSoleTrusted: true,
      previousDeviceId: stored.id,
      previousDeviceFingerprint: stored.device_fingerprint.toUpperCase(),
      clientType: "web_app",
    }),
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.json.status, "trusted");
  assert.equal(response.json.device_id, stored.id);
  const after = await listTrusted(ctx.storage, ctx.userId);
  assert.equal(after.length, 1);
  assert.equal(after[0]?.id, stored.id);
  assert.equal(after[0]?.device_fingerprint, NEW_BROWSER_FINGERPRINT);
  assert.equal(after[0]?.device_public_key, nextKey);
  assert.equal(after[0]?.device_share_b64, stored.device_share_b64);
  assert.equal(await countDevices(ctx.storage, ctx.userId), 1);
});
