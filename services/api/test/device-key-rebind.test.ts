import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import { DeviceService, DeviceServiceError } from "../src/device/service.ts";
import type { SessionService } from "../src/session/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const DEVICE_ID = "1234567890123456789";

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

function loggerStub() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

test("request-key-rebind demotes to pending when another trusted device can approve", async () => {
  let rebound = false;
  const deviceService = new DeviceService({
    devices: {
      requestKeyRebind: async () => {
        rebound = true;
        return {
          kind: "pending",
          device: {
            id: DEVICE_ID,
            userId: "u1",
            deviceFingerprint: "fp",
            deviceName: "Browser",
            devicePublicKey: "cHVi",
            deviceShare: new Uint8Array(32),
            platform: "web",
            osName: "linux",
            osVersion: "1",
            appVersion: "web",
            clientType: "web",
            userAgent: "ua",
            ipFirst: "127.0.0.1",
            ipLast: "127.0.0.1",
            status: "pending",
            createdAt: "2026-01-01T00:00:00.000Z",
            lastSeenAt: "2026-01-01T00:00:00.000Z",
            approvedBy: null,
            approvedAt: null,
            rejectedAt: null,
            rejectionReason: null,
            revokedAt: null,
            blockedUntil: null,
          },
          sendApprovalEmail: false,
        };
      },
    } as never,
    config: { deviceApprovalTtlSeconds: 60, publicAppBaseUrl: "https://app.test" },
  });

  const sessionService = {
    resolveAccessToken: async () => ({
      userId: "u1",
      deviceId: null,
      scope: null,
      tokenHash: "hash",
    }),
  } as unknown as SessionService;

  const app = createApiApp(createTestApiConfig(), loggerStub(), {
    deviceService,
    sessionService,
  });
  const req = {
    method: "POST",
    url: `/devices/${DEVICE_ID}/request-key-rebind`,
    headers: { authorization: "Bearer tok" },
    body: {
      device_public_key: Buffer.alloc(32, 1).toString("base64"),
      device_share: Buffer.alloc(32, 2).toString("base64"),
      device_name: "Browser",
    },
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).status, "pending_approval");
  assert.equal(rebound, true);
});

test("request-key-rebind returns DEVICE_REBIND_REQUIRES_RECOVERY for sole device", async () => {
  const deviceService = new DeviceService({
    devices: {
      requestKeyRebind: async () => ({ kind: "requires_recovery" }),
    } as never,
    config: { deviceApprovalTtlSeconds: 60, publicAppBaseUrl: "https://app.test" },
  });
  const sessionService = {
    resolveAccessToken: async () => ({
      userId: "u1",
      deviceId: null,
      scope: null,
      tokenHash: "hash",
    }),
  } as unknown as SessionService;

  const app = createApiApp(createTestApiConfig(), loggerStub(), {
    deviceService,
    sessionService,
  });
  const req = {
    method: "POST",
    url: `/devices/${DEVICE_ID}/request-key-rebind`,
    headers: { authorization: "Bearer tok" },
    body: {
      device_public_key: Buffer.alloc(32, 1).toString("base64"),
      device_share: Buffer.alloc(32, 2).toString("base64"),
    },
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  assert.equal(res.statusCode, 409);
  assert.equal(JSON.parse(res.body).error, "DEVICE_REBIND_REQUIRES_RECOVERY");
});

test("DeviceService maps requires_recovery to DeviceServiceError", async () => {
  const service = new DeviceService({
    devices: {
      requestKeyRebind: async () => ({ kind: "requires_recovery" }),
    } as never,
    config: { deviceApprovalTtlSeconds: 60, publicAppBaseUrl: "https://app.test" },
  });
  await assert.rejects(
    () =>
      service.requestDeviceKeyRebind("u1", "127.0.0.1", {
        deviceId: DEVICE_ID,
        deviceFingerprint: "fp",
        devicePublicKey: Buffer.alloc(32, 1).toString("base64"),
        deviceShare: Buffer.alloc(32, 2).toString("base64"),
        deviceName: "Browser",
        platform: "web",
        osName: "linux",
        osVersion: "1",
        appVersion: "web",
        clientType: "web",
        userAgent: "ua",
      }),
    (error: unknown) =>
      error instanceof DeviceServiceError &&
      error.code === "DEVICE_REBIND_REQUIRES_RECOVERY" &&
      error.statusCode === 409,
  );
});
