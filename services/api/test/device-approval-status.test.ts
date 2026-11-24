import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import {
  DeviceApprovalStatusService,
  hashApprovalStatusToken,
  type ApprovalStatusDevice,
  type DeviceApprovalStatusStore,
} from "../src/device/approval-status.ts";
import {
  createMemoryRateCounter,
  enforceApprovalStatusRateLimit,
  type ApprovalStatusRateLimit,
} from "../src/device/approval-status-rate-limit.ts";
import type { DeviceService } from "../src/device/service.ts";
import type { SessionService } from "../src/session/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const DEVICE_ID = "1234567890123456789";
const OTHER_DEVICE = "1234567890123456790";
const USER_ID = "42";
const CREATED_AT = "2026-04-01T00:00:00.000Z";

class MemoryStore implements DeviceApprovalStatusStore {
  readonly hashes: string[] = [];
  private readonly tokens = new Map<
    string,
    { userId: string; deviceId: string; requestCreatedAt: string; expiresAt: string }
  >();
  devices = new Map<string, ApprovalStatusDevice>();

  async replaceToken(input: {
    tokenHash: string;
    userId: string;
    deviceId: string;
    requestCreatedAt: string;
    expiresAt: string;
  }): Promise<void> {
    for (const [hash, row] of this.tokens) {
      if (row.userId === input.userId && row.deviceId === input.deviceId) {
        this.tokens.delete(hash);
      }
    }
    this.hashes.push(input.tokenHash);
    this.tokens.set(input.tokenHash, {
      userId: input.userId,
      deviceId: input.deviceId,
      requestCreatedAt: input.requestCreatedAt,
      expiresAt: input.expiresAt,
    });
  }

  async findToken(tokenHash: string, nowIso: string) {
    const row = this.tokens.get(tokenHash);
    if (!row || Date.parse(row.expiresAt) <= Date.parse(nowIso)) {
      return null;
    }
    return row;
  }

  async findDevice(userId: string, deviceId: string) {
    const device = this.devices.get(deviceId);
    if (!device || device.userId !== userId) {
      return null;
    }
    return device;
  }

  async reopenRejected(userId: string, deviceId: string, nowIso: string) {
    const device = this.devices.get(deviceId);
    if (!device || device.userId !== userId || device.status !== "revoked") {
      return null;
    }
    const next: ApprovalStatusDevice = {
      ...device,
      status: "pending",
      createdAt: nowIso,
      blockedUntil: null,
    };
    this.devices.set(deviceId, next);
    return next;
  }
}

function device(status: ApprovalStatusDevice["status"], createdAt = CREATED_AT): ApprovalStatusDevice {
  return {
    id: DEVICE_ID,
    userId: USER_ID,
    status,
    createdAt,
    blockedUntil: status === "blocked" ? "2026-04-02T00:00:00.000Z" : null,
    deviceName: "Browser",
    deviceFingerprint: "ab".repeat(32),
    platform: "desktop",
    osName: "linux",
    osVersion: "6",
    appVersion: "web",
    clientType: "web",
    userAgent: "ua",
  };
}

function service(store: MemoryStore, now: () => Date) {
  return new DeviceApprovalStatusService({
    store,
    requestTtlSeconds: 600,
    now,
  });
}

test("approval status token is stored as a hash and cannot outlive 30 minutes", async () => {
  const store = new MemoryStore();
  store.devices.set(DEVICE_ID, device("pending"));
  let now = Date.parse("2026-04-01T00:00:00.000Z");
  const approval = new DeviceApprovalStatusService({
    store,
    requestTtlSeconds: 7200,
    now: () => new Date(now),
  });
  const issued = await approval.issue({
    userId: USER_ID,
    deviceId: DEVICE_ID,
    requestCreatedAt: CREATED_AT,
  });
  assert.equal(store.hashes.includes(issued.token), false);
  assert.equal(store.hashes[0], hashApprovalStatusToken(issued.token));
  assert.equal(Date.parse(issued.expiresAt) - now, 30 * 60 * 1000);

  const pending = await approval.read(issued.token, DEVICE_ID);
  assert.equal(pending.status, "pending");

  store.devices.set(DEVICE_ID, device("revoked"));
  assert.equal((await approval.read(issued.token, DEVICE_ID)).status, "rejected");

  store.devices.set(DEVICE_ID, device("blocked"));
  const blocked = await approval.read(issued.token, DEVICE_ID);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockedUntil, "2026-04-02T00:00:00.000Z");
  await assert.rejects(() => approval.retry(issued.token, DEVICE_ID, "127.0.0.1"), {
    code: "DEVICE_BLOCKED",
  });

  store.devices.set(DEVICE_ID, device("revoked"));
  const rotated = await approval.retry(issued.token, DEVICE_ID, "127.0.0.1");
  assert.notEqual(rotated.token, issued.token);
  assert.equal(store.hashes.includes(rotated.token), false);
  await assert.rejects(() => approval.read(issued.token, DEVICE_ID), { statusCode: 401 });
  assert.equal((await approval.read(rotated.token, DEVICE_ID)).status, "pending");

  now = Date.parse(rotated.expiresAt) + 1000;
  await assert.rejects(() => approval.read(rotated.token, DEVICE_ID), { statusCode: 401 });
});

test("approval status polling is rate limited per device", async () => {
  const counter = createMemoryRateCounter();
  const limit: ApprovalStatusRateLimit = {
    ...counter,
    windowSeconds: 60,
    pollMaxPerIp: 10,
    pollMaxPerDevice: 1,
    retryMaxPerIp: 10,
    retryMaxPerDevice: 1,
    trustedProxyHops: 0,
  };
  const req = { headers: {}, socket: { remoteAddress: "203.0.113.5" } } as IncomingMessage;
  assert.equal((await enforceApprovalStatusRateLimit(req, limit, DEVICE_ID, "poll")).status, "ok");
  assert.equal(
    (await enforceApprovalStatusRateLimit(req, limit, DEVICE_ID, "poll")).status,
    "limited",
  );
});

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";
  headers = new Map<string, string>();

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

test("approval status token is rejected by every other route and is not logged", async () => {
  const store = new MemoryStore();
  store.devices.set(DEVICE_ID, device("pending"));
  const logs: string[] = [];
  const logger = {
    info(message: string, extra?: Record<string, unknown>) {
      logs.push(JSON.stringify({ message, extra }));
    },
    warn(message: string, extra?: Record<string, unknown>) {
      logs.push(JSON.stringify({ message, extra }));
    },
    error(message: string, extra?: Record<string, unknown>) {
      logs.push(JSON.stringify({ message, extra }));
    },
  };
  const approval = service(store, () => new Date("2026-04-01T00:00:00.000Z"));
  const issued = await approval.issue({
    userId: USER_ID,
    deviceId: DEVICE_ID,
    requestCreatedAt: CREATED_AT,
  });
  let rejected = false;
  const app = createApiApp(createTestApiConfig(), logger, {
    deviceApprovalStatus: approval,
    deviceService: {
      listDevices: async () => ({ devices: [], pending: [], blocked: [] }),
      rejectDevice: async () => {
        rejected = true;
        return { deviceId: DEVICE_ID, status: "revoked" };
      },
    } as unknown as DeviceService,
    sessionService: {
      resolveAccessToken: async (token: string) => {
        if (token !== "real-session") {
          return null;
        }
        return {
          userId: USER_ID,
          deviceId: OTHER_DEVICE,
          scope: null,
          tokenHash: "hash",
          expiresAt: null,
          recoveryProvedAt: null,
          recoveryChallenge: null,
          recoveryChallengeExpiresAt: null,
        };
      },
    } as unknown as SessionService,
    usersRepository: {
      loadAccountProfile: async () => {
        throw new Error("profile route accepted the approval status token");
      },
      updateAccountProfile: async () => {
        throw new Error("profile write accepted the approval status token");
      },
      recordVaultUnlock: async () => {
        throw new Error("vault unlock accepted the approval status token");
      },
      findById: async () => null,
    },
  });

  async function call(method: string, url: string, headers: Record<string, string>, body?: unknown) {
    const req = { method, url, headers, body } as IncomingMessage;
    const res = new MockResponse();
    await app.handler()(req, res as unknown as ServerResponse);
    return res;
  }

  const statusHeader = { "x-device-approval-token": issued.token };
  const asBearer = { authorization: `Bearer ${issued.token}` };

  const listed = await call("GET", "/devices", asBearer);
  assert.equal(listed.statusCode, 401);
  const profile = await call("GET", "/account/profile", asBearer);
  assert.equal(profile.statusCode, 401);
  const reject = await call("POST", `/devices/${DEVICE_ID}/reject`, asBearer, { reason: "no" });
  assert.equal(reject.statusCode, 401);
  assert.equal(rejected, false);
  const headerOnList = await call("GET", "/devices", statusHeader);
  assert.equal(headerOnList.statusCode, 401);

  const status = await call("GET", `/devices/${DEVICE_ID}/approval-status`, statusHeader);
  assert.equal(status.statusCode, 200);
  const payload = JSON.parse(status.body) as { status: string; approval_status_token?: string };
  assert.equal(payload.status, "pending");
  assert.equal(payload.approval_status_token, undefined);
  assert.equal(logs.some((line) => line.includes(issued.token)), false);
  assert.equal(status.body.includes(issued.token), false);
});

test("approval retry route rotates the token and a second immediate retry is limited", async () => {
  const store = new MemoryStore();
  store.devices.set(DEVICE_ID, device("revoked"));
  let now = Date.parse(CREATED_AT);
  const approval = service(store, () => new Date(now));
  const issued = await approval.issue({
    userId: USER_ID,
    deviceId: DEVICE_ID,
    requestCreatedAt: CREATED_AT,
  });
  const counter = createMemoryRateCounter();
  const app = createApiApp(createTestApiConfig(), {
    info() {},
    warn() {},
    error() {},
  }, {
    deviceApprovalStatus: approval,
    deviceApprovalStatusRateLimit: {
      ...counter,
      windowSeconds: 60,
      pollMaxPerIp: 10,
      pollMaxPerDevice: 10,
      retryMaxPerIp: 10,
      retryMaxPerDevice: 1,
      trustedProxyHops: 0,
    },
  });
  const req = {
    method: "POST",
    url: `/devices/${DEVICE_ID}/approval-retry`,
    headers: { "x-device-approval-token": issued.token },
    socket: { remoteAddress: "203.0.113.9" },
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as { approval_status_token: string; status: string };
  assert.equal(body.status, "pending_approval");
  assert.notEqual(body.approval_status_token, issued.token);

  const again = new MockResponse();
  const second = {
    method: "POST",
    url: `/devices/${DEVICE_ID}/approval-retry`,
    headers: { "x-device-approval-token": body.approval_status_token },
    socket: { remoteAddress: "203.0.113.9" },
  } as IncomingMessage;
  await app.handler()(second, again as unknown as ServerResponse);
  assert.equal(again.statusCode, 429);
});
