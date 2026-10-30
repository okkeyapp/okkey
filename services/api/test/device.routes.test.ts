import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import { DeviceServiceError, type DeviceService } from "../src/device/service.ts";
import type { SessionService } from "../src/session/service.ts";

const DEVICE_A = "1234567890123456789";
const DEVICE_B = "1234567890123456790";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";
  private readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

function loggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

const config: ApiConfig = createTestApiConfig();

function createDeviceServiceStub(overrides?: Partial<DeviceService>): DeviceService {
  return {
    registerDevice: async () => ({
      deviceId: "d1",
      status: "pending_approval",
    }),
    listDevices: async () => ({
      devices: [],
      pending: [],
      blocked: [],
    }),
    renameDevice: async () => ({
      deviceId: "d1",
      deviceName: "Renamed",
    }),
    revokeDevice: async () => ({
      deviceId: "d1",
      status: "revoked",
    }),
    approveDevice: async () => ({
      deviceId: "d1",
      status: "trusted",
    }),
    rejectDevice: async () => ({
      deviceId: "d1",
      status: "revoked",
    }),
    blockDevice: async () => ({
      deviceId: "d1",
      status: "blocked",
      blockedUntil: null,
    }),
    unblockDevice: async () => ({
      deviceId: "d1",
      status: "revoked",
    }),
    ...(overrides ?? {}),
  } as unknown as DeviceService;
}

function createSessionServiceStub(
  overrides?: Partial<SessionService>,
): SessionService {
  return {
    hashAccessToken: (token: string) => `hash:${token}`,
    mintAccessToken: () => "token",
    createSession: async () => ({
      accessToken: "token",
      expiresAt: new Date().toISOString(),
      scope: null,
    }),
    resolveAccessToken: async () => null,
    bindAccessTokenDevice: async () => {},
    revokeSessionsForDevice: async () => {},
    revokeAccessToken: async () => false,
    ...(overrides ?? {}),
  } as SessionService;
}

async function dispatch(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  deviceService?: DeviceService;
  sessionService?: SessionService;
}) {
  const app = createApiApp(config, loggerStub(), {
    deviceService: input.deviceService ?? createDeviceServiceStub(),
    ...(input.sessionService ? { sessionService: input.sessionService } : {}),
  });
  const req = {
    method: input.method,
    url: input.url,
    headers: input.headers ?? {},
    body: input.body,
  } as IncomingMessage;
  const res = new MockResponse();

  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

function registerBody() {
  return {
    device_public_key: Buffer.from("pk").toString("base64"),
    device_share: Buffer.alloc(32, 5).toString("base64"),
    device_fingerprint: "a".repeat(64),
    device_name: "MacBook Pro",
    platform: "desktop",
    os_name: "macOS",
    os_version: "14.5",
    app_version: "1.0.0",
    client_type: "desktop",
  };
}

test("POST /devices/register requires x-user-id", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/devices/register",
    body: registerBody(),
  });

  assert.equal(res.statusCode, 401);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "AUTH_REQUIRED");
});

test("POST /devices/register validates required fields", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/devices/register",
    headers: { "x-user-id": "u1" },
    body: { device_name: "Device" },
  });

  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "DEVICE_BAD_REQUEST");
});

test("POST /devices/register returns trusted", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/devices/register",
    headers: { "x-user-id": "u1", "x-forwarded-for": "10.0.0.1" },
    body: registerBody(),
    deviceService: createDeviceServiceStub({
      registerDevice: async () => ({ deviceId: "d1", status: "trusted" }),
    }),
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { status: string; device_id: string };
  assert.equal(payload.status, "trusted");
  assert.equal(payload.device_id, "d1");
});

test("POST /devices/register returns pending_approval", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/devices/register",
    headers: { "x-user-id": "u1", "x-forwarded-for": "10.0.0.1" },
    body: registerBody(),
    deviceService: createDeviceServiceStub({
      registerDevice: async () => ({ deviceId: "d2", status: "pending_approval" }),
    }),
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { status: string; device_id: string };
  assert.equal(payload.status, "pending_approval");
  assert.equal(payload.device_id, "d2");
});

test("POST /devices/register forwards body locale for approval email", async () => {
  let capturedLocale: string | undefined;
  const res = await dispatch({
    method: "POST",
    url: "/devices/register",
    headers: {
      "x-user-id": "u1",
      "x-forwarded-for": "10.0.0.1",
      "accept-language": "ru-RU",
    },
    body: { ...registerBody(), locale: "en" },
    deviceService: createDeviceServiceStub({
      registerDevice: async (_userId, _ip, input) => {
        capturedLocale = input.locale;
        return { deviceId: "d3", status: "pending_approval" };
      },
    }),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(capturedLocale, "en");
});

test("POST /devices/register maps service error codes", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/devices/register",
    headers: { "x-user-id": "u1", "x-forwarded-for": "10.0.0.1" },
    body: registerBody(),
    deviceService: createDeviceServiceStub({
      registerDevice: async () => {
        throw new DeviceServiceError(
          "DEVICE_INVALID_PUBLIC_KEY",
          400,
          "invalid device_public_key",
        );
      },
    }),
  });

  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "DEVICE_INVALID_PUBLIC_KEY");
});

test("POST /devices/register returns 409 when trusted fingerprint keys differ", async () => {
  let bound = false;
  const res = await dispatch({
    method: "POST",
    url: "/devices/register",
    headers: {
      authorization: "Bearer tok-conflict",
      "x-user-id": "u1",
      "x-forwarded-for": "10.0.0.1",
    },
    body: registerBody(),
    deviceService: createDeviceServiceStub({
      registerDevice: async () => {
        throw new DeviceServiceError(
          "DEVICE_FINGERPRINT_ALREADY_TRUSTED",
          409,
          "trusted device keys cannot be replaced",
        );
      },
    }),
    sessionService: createSessionServiceStub({
      resolveAccessToken: async () => ({
        userId: "u1",
        deviceId: null,
        scope: null,
        tokenHash: "hash:tok-conflict",
      }),
      bindAccessTokenDevice: async () => {
        bound = true;
        return true;
      },
    }),
  });

  assert.equal(res.statusCode, 409);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "DEVICE_FINGERPRINT_ALREADY_TRUSTED");
  assert.equal(bound, false);
});

test("POST /devices/:id/approve requires trusted approver headers", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/devices/d-pending/approve",
    headers: { "x-user-id": "u1" },
  });

  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "DEVICE_APPROVAL_ACCESS_DENIED");
});

test("POST /devices/:id/approve returns trusted status", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/devices/d-pending/approve",
    headers: { "x-user-id": "u1", "x-device-id": "d-trusted" },
    deviceService: createDeviceServiceStub({
      approveDevice: async () => ({ deviceId: "d-pending", status: "trusted" }),
    }),
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { status: string; device_id: string };
  assert.equal(payload.status, "trusted");
  assert.equal(payload.device_id, "d-pending");
});

test("POST /devices/:id/reject returns revoked status", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/devices/d-pending/reject",
    headers: { "x-user-id": "u1", "x-device-id": "d-trusted" },
    body: { reason: "unknown login" },
    deviceService: createDeviceServiceStub({
      rejectDevice: async () => ({ deviceId: "d-pending", status: "revoked" }),
    }),
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { status: string; device_id: string };
  assert.equal(payload.status, "revoked");
  assert.equal(payload.device_id, "d-pending");
});

test("device approval routes map DEVICE_APPROVAL_EXPIRED", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/devices/d-pending/approve",
    headers: { "x-user-id": "u1", "x-device-id": "d-trusted" },
    deviceService: createDeviceServiceStub({
      approveDevice: async () => {
        throw new DeviceServiceError(
          "DEVICE_APPROVAL_EXPIRED",
          410,
          "device approval challenge expired",
        );
      },
    }),
  });

  assert.equal(res.statusCode, 410);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "DEVICE_APPROVAL_EXPIRED");
});

test("GET /devices requires auth and returns list payload", async () => {
  const unauthorized = await dispatch({
    method: "GET",
    url: "/devices",
  });
  assert.equal(unauthorized.statusCode, 401);

  let seenFingerprint: string | null | undefined;
  const res = await dispatch({
    method: "GET",
    url: "/devices",
    headers: {
      "x-user-id": "u1",
      "x-device-fingerprint": "a".repeat(64),
    },
    deviceService: createDeviceServiceStub({
      listDevices: async (_userId, fingerprint) => {
        seenFingerprint = fingerprint;
        return {
          devices: [
            {
              deviceId: "d-trusted",
              deviceName: "Mac",
              deviceFingerprint: "a".repeat(64),
              status: "trusted",
              platform: "desktop",
              osName: "macOS",
              osVersion: "14",
              appVersion: "1.0.0",
              clientType: "web",
              ipAddress: "10.0.0.1",
              country: "Singapore",
              city: "Singapore",
              createdAt: "2026-01-01T00:00:00.000Z",
              lastSeenAt: "2026-01-01T00:00:00.000Z",
              approvedAt: "2026-01-01T00:00:00.000Z",
              isCurrent: true,
              approvalExpiresAt: null,
              blockedUntil: null,
            },
          ],
          pending: [
            {
              deviceId: "d-pending",
              deviceName: "Windows 11",
              deviceFingerprint: "b".repeat(64),
              status: "pending_approval",
              platform: "desktop",
              osName: "Windows",
              osVersion: "11",
              appVersion: "1.0.0",
              clientType: "desktop",
              ipAddress: "82.123.321.44",
              country: null,
              city: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              lastSeenAt: null,
              approvedAt: null,
              isCurrent: false,
              approvalExpiresAt: "2026-01-01T00:01:00.000Z",
              blockedUntil: null,
            },
          ],
          blocked: [],
        };
      },
    }),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(seenFingerprint, "a".repeat(64));
  const payload = JSON.parse(res.body) as {
    devices: Array<{ device_id: string; is_current: boolean; country: string | null }>;
    pending: Array<{ device_id: string; status: string; approval_expires_at: string }>;
  };
  assert.equal(payload.devices[0]?.device_id, "d-trusted");
  assert.equal(payload.devices[0]?.is_current, true);
  assert.equal(payload.devices[0]?.country, "Singapore");
  assert.equal(payload.pending[0]?.status, "pending_approval");
  assert.equal(payload.pending[0]?.approval_expires_at, "2026-01-01T00:01:00.000Z");
});

test("GET /devices accepts device_fingerprint query when header is absent", async () => {
  let seenFingerprint: string | null | undefined;
  const res = await dispatch({
    method: "GET",
    url: `/devices?device_fingerprint=${"a".repeat(64)}`,
    headers: {
      "x-user-id": "u1",
    },
    deviceService: createDeviceServiceStub({
      listDevices: async (_userId, fingerprint) => {
        seenFingerprint = fingerprint;
        return { devices: [], pending: [], blocked: [] };
      },
    }),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(seenFingerprint, "a".repeat(64));
});

test("PATCH /devices/:id renames device", async () => {
  const res = await dispatch({
    method: "PATCH",
    url: "/devices/d1",
    headers: { "x-user-id": "u1" },
    body: { device_name: "Office laptop" },
    deviceService: createDeviceServiceStub({
      renameDevice: async () => ({ deviceId: "d1", deviceName: "Office laptop" }),
    }),
  });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { device_id: string; device_name: string };
  assert.equal(payload.device_name, "Office laptop");
});

test("POST /devices/:id/revoke revokes owned device", async () => {
  const res = await dispatch({
    method: "POST",
    url: `/devices/${DEVICE_A}/revoke`,
    headers: { "x-user-id": "u1" },
    body: { reason: "not now" },
    deviceService: createDeviceServiceStub({
      revokeDevice: async () => ({ deviceId: DEVICE_A, status: "revoked" }),
    }),
  });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { device_id: string; status: string };
  assert.equal(payload.status, "revoked");
});

test("POST /devices/:id/revoke rejects invalid device id with 400", async () => {
  let revoked = false;
  const res = await dispatch({
    method: "POST",
    url: "/devices/abc/revoke",
    headers: { "x-user-id": "u1" },
    body: {},
    deviceService: createDeviceServiceStub({
      revokeDevice: async () => {
        revoked = true;
        return { deviceId: "abc", status: "revoked" };
      },
    }),
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "DEVICE_BAD_REQUEST");
  assert.equal(revoked, false);
});

test("POST /devices/:id/revoke rejects oversized device id with 400", async () => {
  const huge = "9".repeat(20);
  const res = await dispatch({
    method: "POST",
    url: `/devices/${huge}/revoke`,
    headers: { "x-user-id": "u1" },
    body: {},
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "DEVICE_BAD_REQUEST");
});

test("POST /devices/:id/revoke rejects revoking the caller device via header", async () => {
  let revoked = false;
  const res = await dispatch({
    method: "POST",
    url: `/devices/${DEVICE_A}/revoke`,
    headers: { "x-user-id": "u1", "x-device-id": DEVICE_A },
    body: {},
    deviceService: createDeviceServiceStub({
      revokeDevice: async () => {
        revoked = true;
        return { deviceId: DEVICE_A, status: "revoked" };
      },
    }),
  });
  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "DEVICE_REVOKE_CURRENT_FORBIDDEN");
  assert.equal(revoked, false);
});

test("POST /devices/:id/revoke rejects revoking the session-bound device without header", async () => {
  let revoked = false;
  const res = await dispatch({
    method: "POST",
    url: `/devices/${DEVICE_A}/revoke`,
    headers: { authorization: "Bearer tok-1" },
    body: {},
    deviceService: createDeviceServiceStub({
      revokeDevice: async () => {
        revoked = true;
        return { deviceId: DEVICE_A, status: "revoked" };
      },
    }),
    sessionService: createSessionServiceStub({
      resolveAccessToken: async () => ({
        userId: "u1",
        deviceId: DEVICE_A,
        scope: null,
        tokenHash: "hash:tok-1",
      }),
    }),
  });
  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "DEVICE_REVOKE_CURRENT_FORBIDDEN");
  assert.equal(revoked, false);
});

test("POST /devices/:id/revoke with sign_out ends the server session", async () => {
  const revokedDevices: string[] = [];
  const revokedSessionDevices: string[] = [];
  const revokedTokens: string[] = [];
  const res = await dispatch({
    method: "POST",
    url: `/devices/${DEVICE_A}/revoke`,
    headers: { authorization: "Bearer tok-signout" },
    body: { sign_out: true, reason: "signed out from extension" },
    deviceService: createDeviceServiceStub({
      revokeDevice: async (_userId, deviceId) => {
        revokedDevices.push(deviceId);
        return { deviceId, status: "revoked" };
      },
    }),
    sessionService: createSessionServiceStub({
      resolveAccessToken: async () => ({
        userId: "u1",
        deviceId: DEVICE_A,
        scope: null,
        tokenHash: "hash:tok-signout",
      }),
      revokeSessionsForDevice: async (_userId, deviceId) => {
        revokedSessionDevices.push(deviceId);
      },
      revokeAccessToken: async (token) => {
        revokedTokens.push(token);
        return true;
      },
    }),
  });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { device_id: string; status: string };
  assert.equal(payload.device_id, DEVICE_A);
  assert.equal(payload.status, "revoked");
  assert.deepEqual(revokedDevices, [DEVICE_A]);
  assert.deepEqual(revokedSessionDevices, [DEVICE_A]);
  assert.deepEqual(revokedTokens, ["tok-signout"]);
});

test("POST /devices/:id/revoke of another device ends that device sessions", async () => {
  const revokedSessionDevices: string[] = [];
  const res = await dispatch({
    method: "POST",
    url: `/devices/${DEVICE_B}/revoke`,
    headers: { authorization: "Bearer tok-1" },
    body: { reason: "not now" },
    deviceService: createDeviceServiceStub({
      revokeDevice: async () => ({ deviceId: DEVICE_B, status: "revoked" }),
    }),
    sessionService: createSessionServiceStub({
      resolveAccessToken: async () => ({
        userId: "u1",
        deviceId: DEVICE_A,
        scope: null,
        tokenHash: "hash:tok-1",
      }),
      revokeSessionsForDevice: async (_userId, deviceId) => {
        revokedSessionDevices.push(deviceId);
      },
    }),
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(revokedSessionDevices, [DEVICE_B]);
});

test("POST /devices/:id/revoke with sign_out on another device keeps the caller session", async () => {
  const revokedSessionDevices: string[] = [];
  const revokedTokens: string[] = [];
  const res = await dispatch({
    method: "POST",
    url: `/devices/${DEVICE_B}/revoke`,
    headers: { authorization: "Bearer tok-approver" },
    body: { sign_out: true, reason: "not now" },
    deviceService: createDeviceServiceStub({
      revokeDevice: async () => ({ deviceId: DEVICE_B, status: "revoked" }),
    }),
    sessionService: createSessionServiceStub({
      resolveAccessToken: async () => ({
        userId: "u1",
        deviceId: DEVICE_A,
        scope: null,
        tokenHash: "hash:tok-approver",
      }),
      revokeSessionsForDevice: async (_userId, deviceId) => {
        revokedSessionDevices.push(deviceId);
      },
      revokeAccessToken: async (token) => {
        revokedTokens.push(token);
        return true;
      },
    }),
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(revokedSessionDevices, [DEVICE_B]);
  assert.deepEqual(revokedTokens, []);
});

test("POST /devices/:id/revoke still revokes a different device when caller header is set", async () => {
  const res = await dispatch({
    method: "POST",
    url: `/devices/${DEVICE_B}/revoke`,
    headers: { "x-user-id": "u1", "x-device-id": DEVICE_A },
    body: { reason: "not now" },
    deviceService: createDeviceServiceStub({
      revokeDevice: async () => ({ deviceId: DEVICE_B, status: "revoked" }),
    }),
  });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { device_id: string; status: string };
  assert.equal(payload.device_id, DEVICE_B);
  assert.equal(payload.status, "revoked");
});

test("POST /devices/register does not bind a blocked device", async () => {
  let bound = false;
  const res = await dispatch({
    method: "POST",
    url: "/devices/register",
    headers: { authorization: "Bearer tok-blocked", "x-user-id": "u1" },
    body: registerBody(),
    deviceService: createDeviceServiceStub({
      registerDevice: async () => ({
        deviceId: DEVICE_A,
        status: "blocked",
        blockedUntil: null,
      }),
    }),
    sessionService: createSessionServiceStub({
      resolveAccessToken: async () => ({
        userId: "u1",
        deviceId: null,
        scope: null,
        tokenHash: "hash",
      }),
      bindAccessTokenDevice: async () => {
        bound = true;
        return true;
      },
    }),
  });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { status: string };
  assert.equal(payload.status, "blocked");
  assert.equal(bound, false);
});

test("POST /devices/register binds the access-token session to the device", async () => {
  const bound: Array<{ token: string; userId: string; deviceId: string }> = [];
  const res = await dispatch({
    method: "POST",
    url: "/devices/register",
    headers: {
      "x-user-id": "u1",
      authorization: "Bearer tok-register",
      "x-forwarded-for": "10.0.0.1",
    },
    body: registerBody(),
    deviceService: createDeviceServiceStub({
      registerDevice: async () => ({ deviceId: DEVICE_A, status: "trusted" }),
    }),
    sessionService: createSessionServiceStub({
      resolveAccessToken: async () => ({
        userId: "u1",
        deviceId: null,
        scope: null,
        tokenHash: "hash:tok-register",
      }),
      bindAccessTokenDevice: async (token, userId, deviceId) => {
        bound.push({ token, userId, deviceId });
      },
    }),
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(bound, [{ token: "tok-register", userId: "u1", deviceId: DEVICE_A }]);
});

test("POST /devices/:id/revoke treats a leading-zero id as the current device", async () => {
  let revoked = false;
  const res = await dispatch({
    method: "POST",
    url: `/devices/0${DEVICE_A}/revoke`,
    headers: { authorization: "Bearer tok-1" },
    body: {},
    deviceService: createDeviceServiceStub({
      revokeDevice: async () => {
        revoked = true;
        return { deviceId: DEVICE_A, status: "revoked" };
      },
    }),
    sessionService: createSessionServiceStub({
      resolveAccessToken: async () => ({
        userId: "u1",
        deviceId: DEVICE_A,
        scope: null,
        tokenHash: "hash:tok-1",
      }),
    }),
  });
  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "DEVICE_REVOKE_CURRENT_FORBIDDEN");
  assert.equal(revoked, false);
});

test("POST /devices/:id/revoke rejects an unbound full session", async () => {
  let revoked = false;
  const res = await dispatch({
    method: "POST",
    url: `/devices/${DEVICE_A}/revoke`,
    headers: { authorization: "Bearer tok-unbound" },
    body: {},
    deviceService: createDeviceServiceStub({
      revokeDevice: async () => {
        revoked = true;
        return { deviceId: DEVICE_A, status: "revoked" };
      },
    }),
    sessionService: createSessionServiceStub({
      resolveAccessToken: async () => ({
        userId: "u1",
        deviceId: null,
        scope: null,
        tokenHash: "hash:tok-unbound",
      }),
    }),
  });
  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "DEVICE_REVOKE_CURRENT_FORBIDDEN");
  assert.equal(revoked, false);
});

test("POST /devices/:id/reject ends sessions bound to the pending device", async () => {
  const ended: string[] = [];
  const res = await dispatch({
    method: "POST",
    url: `/devices/${DEVICE_B}/reject`,
    headers: { "x-user-id": "u1", "x-device-id": DEVICE_A },
    body: { reason: "no" },
    deviceService: createDeviceServiceStub({
      rejectDevice: async () => ({ deviceId: DEVICE_B, status: "revoked" }),
    }),
    sessionService: createSessionServiceStub({
      revokeSessionsForDevice: async (_userId, deviceId) => {
        ended.push(deviceId);
      },
    }),
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(ended, [DEVICE_B]);
});

test("POST /devices/:id/block ends sessions bound to the pending device", async () => {
  const ended: string[] = [];
  const res = await dispatch({
    method: "POST",
    url: `/devices/${DEVICE_B}/block`,
    headers: { "x-user-id": "u1", "x-device-id": DEVICE_A },
    body: { duration: "forever" },
    deviceService: createDeviceServiceStub({
      blockDevice: async () => ({
        deviceId: DEVICE_B,
        status: "blocked",
        blockedUntil: null,
      }),
    }),
    sessionService: createSessionServiceStub({
      revokeSessionsForDevice: async (_userId, deviceId) => {
        ended.push(deviceId);
      },
    }),
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(ended, [DEVICE_B]);
});
