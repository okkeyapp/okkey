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

const FINGERPRINT = "web_app-chrome-windows-11";

function ownedDevice() {
  return {
    id: DEVICE_ID,
    status: "trusted",
    devicePublicKey: Buffer.alloc(32, 3).toString("base64"),
    deviceShare: new Uint8Array(32).fill(4),
    deviceFingerprint: FINGERPRINT,
  };
}

test("request-key-rebind demotes to pending when another trusted device can approve", async () => {
  let rebound = false;
  const deviceService = new DeviceService({
    devices: {
      findOwnedDeviceAuth: async (_userId: string, deviceId: string) =>
        deviceId === DEVICE_ID ? ownedDevice() : null,
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
    verifyDeviceSignature: () => true,
  });

  const sessionService = {
    hashAccessToken: (token: string) => `hash:${token}`,
    resolveAccessToken: async () => ({
      userId: "u1",
      deviceId: null,
      scope: null,
      tokenHash: "hash:tok",
    }),
  } as unknown as SessionService;

  const app = createApiApp(createTestApiConfig(), loggerStub(), {
    deviceService,
    sessionService,
  });
  async function call(url: string, body: unknown, headers?: Record<string, string>) {
    const req = {
      method: "POST",
      url,
      headers: { authorization: "Bearer tok", ...headers },
      body,
    } as IncomingMessage;
    const res = new MockResponse();
    await app.handler()(req, res as unknown as ServerResponse);
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  }

  const missingProof = await call(`/devices/${DEVICE_ID}/request-key-rebind`, {
    device_public_key: Buffer.alloc(32, 1).toString("base64"),
    device_share: Buffer.alloc(32, 2).toString("base64"),
    device_fingerprint: FINGERPRINT,
  });
  assert.equal(missingProof.status, 400);
  assert.equal(missingProof.body.error, "DEVICE_BAD_REQUEST");
  assert.equal(rebound, false);

  const foreignDevice = await call(`/devices/1234567890123456790/request-key-rebind`, {
    challenge_id: "unused",
    signature: "good-sig",
    device_public_key: Buffer.alloc(32, 1).toString("base64"),
    device_share: Buffer.alloc(32, 2).toString("base64"),
    device_fingerprint: FINGERPRINT,
  });
  assert.equal(foreignDevice.status, 404);
  assert.equal(foreignDevice.body.error, "DEVICE_NOT_FOUND");
  assert.equal(rebound, false);

  const challenge = await call(`/devices/${DEVICE_ID}/bind-challenge`, {});
  assert.equal(challenge.status, 200);
  const foreign = await call(`/devices/${DEVICE_ID}/request-key-rebind`, {
    challenge_id: challenge.body.challenge_id,
    signature: "good-sig",
    device_public_key: Buffer.alloc(32, 1).toString("base64"),
    device_share: Buffer.alloc(32, 2).toString("base64"),
    device_fingerprint: "someone-else",
  });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.error, "DEVICE_REBIND_FINGERPRINT_MISMATCH");
  assert.equal(rebound, false);

  const proved = await call(`/devices/${DEVICE_ID}/request-key-rebind`, {
    challenge_id: challenge.body.challenge_id,
    signature: "good-sig",
    device_public_key: Buffer.alloc(32, 1).toString("base64"),
    device_share: Buffer.alloc(32, 2).toString("base64"),
    device_fingerprint: FINGERPRINT,
    device_name: "Browser",
  });
  assert.equal(proved.status, 200);
  assert.equal(proved.body.status, "pending_approval");
  assert.equal(rebound, true);
});

test("request-key-rebind returns DEVICE_REBIND_REQUIRES_RECOVERY for sole device", async () => {
  const deviceService = new DeviceService({
    devices: {
      findOwnedDeviceAuth: async () => ownedDevice(),
      requestKeyRebind: async () => ({ kind: "requires_recovery" }),
    } as never,
    config: { deviceApprovalTtlSeconds: 60, publicAppBaseUrl: "https://app.test" },
    verifyDeviceSignature: () => true,
  });
  const sessionService = {
    hashAccessToken: (token: string) => `hash:${token}`,
    resolveAccessToken: async () => ({
      userId: "u1",
      deviceId: null,
      scope: null,
      tokenHash: "hash:tok",
    }),
  } as unknown as SessionService;

  const app = createApiApp(createTestApiConfig(), loggerStub(), {
    deviceService,
    sessionService,
  });
  const issuedReq = {
    method: "POST",
    url: `/devices/${DEVICE_ID}/bind-challenge`,
    headers: { authorization: "Bearer tok" },
    body: {},
  } as IncomingMessage;
  const issuedRes = new MockResponse();
  await app.handler()(issuedReq, issuedRes as unknown as ServerResponse);
  const issued = JSON.parse(issuedRes.body) as { challenge_id: string };
  const req = {
    method: "POST",
    url: `/devices/${DEVICE_ID}/request-key-rebind`,
    headers: { authorization: "Bearer tok" },
    body: {
      challenge_id: issued.challenge_id,
      signature: "good-sig",
      device_public_key: Buffer.alloc(32, 1).toString("base64"),
      device_share: Buffer.alloc(32, 2).toString("base64"),
      device_fingerprint: FINGERPRINT,
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
      findOwnedDeviceAuth: async () => ownedDevice(),
      requestKeyRebind: async () => ({ kind: "requires_recovery" }),
    } as never,
    config: { deviceApprovalTtlSeconds: 60, publicAppBaseUrl: "https://app.test" },
    verifyDeviceSignature: () => true,
  });
  const issued = await service.issueDeviceBindChallenge({
    userId: "u1",
    deviceId: DEVICE_ID,
    tokenHash: "hash",
  });
  await assert.rejects(
    () =>
      service.requestDeviceKeyRebind("u1", "127.0.0.1", {
        deviceId: DEVICE_ID,
        deviceFingerprint: FINGERPRINT,
        tokenHash: "hash",
        challengeId: issued.challengeId,
        signatureB64: "good-sig",
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
