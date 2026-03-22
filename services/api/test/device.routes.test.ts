import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import { DeviceServiceError, type DeviceService } from "../src/device/service.ts";

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
    approveDevice: async () => ({
      deviceId: "d1",
      status: "trusted",
    }),
    rejectDevice: async () => ({
      deviceId: "d1",
      status: "revoked",
    }),
    ...(overrides ?? {}),
  } as unknown as DeviceService;
}

async function dispatch(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  deviceService?: DeviceService;
}) {
  const app = createApiApp(config, loggerStub(), {
    deviceService: input.deviceService ?? createDeviceServiceStub(),
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
    device_share: Buffer.from("share").toString("base64"),
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
