import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";

import { createApiApp } from "../src/app.ts";
import { DeviceService } from "../src/device/service.ts";
import type { DeviceRecord, DevicesRepository } from "../src/storage/repositories.ts";
import type { SessionService } from "../src/session/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";
  setHeader(): void {}
  end(chunk?: string): void {
    if (chunk) this.body += chunk;
    this.writableEnded = true;
  }
}

const OWNER = "owner-1";
const OTHER = "owner-2";
let clock = Date.parse("2026-06-15T12:00:00.000Z");

function record(partial: Partial<DeviceRecord> & Pick<DeviceRecord, "id" | "userId" | "status">): DeviceRecord {
  return {
    deviceFingerprint: "web_app-chrome-macos-14.5",
    deviceName: "Chrome",
    devicePublicKey: "AAAA",
    deviceShare: Uint8Array.from([1]),
    platform: "macos",
    osName: "macOS",
    osVersion: "14.5",
    appVersion: "1",
    clientType: "chrome",
    userAgent: "test",
    ipFirst: "127.0.0.1",
    ipLast: "127.0.0.1",
    createdAt: new Date(clock).toISOString(),
    lastSeenAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    revokedAt: null,
    blockedUntil: null,
    ...partial,
  };
}

function createDevices() {
  const devices: DeviceRecord[] = [];
  let seq = 1;
  const repo = {
    async registerOrUpdate(input: {
      userId: string;
      deviceFingerprint: string;
      now: string;
    }) {
      const now = Date.parse(input.now);
      const existing = devices.find(
        (row) => row.userId === input.userId && row.deviceFingerprint === input.deviceFingerprint && row.status !== "revoked",
      );
      if (existing?.status === "blocked") {
        const until = existing.blockedUntil ? Date.parse(existing.blockedUntil) : null;
        if (until == null || until > now) {
          return existing;
        }
        existing.status = "pending";
        existing.blockedUntil = null;
        return existing;
      }
      if (existing) return existing;
      const created = record({
        id: `dev-${seq++}`,
        userId: input.userId,
        deviceFingerprint: input.deviceFingerprint,
        status: "pending",
      });
      devices.push(created);
      return created;
    },
    async isTrustedDevice(userId: string, deviceId: string) {
      return devices.some((row) => row.userId === userId && row.id === deviceId && row.status === "trusted");
    },
    async blockPending(input: {
      userId: string;
      deviceId: string;
      blockedUntil: string | null;
    }) {
      const row = devices.find(
        (item) => item.userId === input.userId && item.id === input.deviceId && item.status === "pending",
      );
      if (!row) return null;
      row.status = "blocked";
      row.blockedUntil = input.blockedUntil;
      return row;
    },
    async unblockDevice(input: { userId: string; deviceId: string; trust: boolean }) {
      const row = devices.find((item) => item.userId === input.userId && item.id === input.deviceId && item.status === "blocked");
      if (!row) return null;
      row.status = input.trust ? "trusted" : "revoked";
      row.blockedUntil = null;
      return row;
    },
    async revokeOwned(input: { userId: string; deviceId: string }) {
      const row = devices.find((item) => item.userId === input.userId && item.id === input.deviceId);
      if (!row) return null;
      row.status = "revoked";
      return row;
    },
    async resolveApproval() {
      return { kind: "not_found" as const, device: null };
    },
    async listByUser() {
      return [];
    },
    async renameDevice() {
      return null;
    },
    async clearExpiredBlocks() {
      return 0;
    },
    async reclaimSoleTrusted() {
      return null;
    },
    async claimTrustedAfterRecovery() {
      throw new Error("not used");
    },
  };
  return { devices, repo: repo as unknown as DevicesRepository };
}

function createApp(repo: DevicesRepository) {
  const service = new DeviceService({
    devices: repo,
    config: { deviceApprovalTtlSeconds: 600, publicAppBaseUrl: "https://app.okkey.test" },
    now: () => new Date(clock),
  });
  return createApiApp(createTestApiConfig({ allowHeaderUserIdAuth: false }), {
    info() {},
    warn() {},
    error() {},
  }, {
    deviceService: service,
    sessionService: {
      async resolveAccessToken(token: string) {
        if (token === "owner") return { userId: OWNER };
        if (token === "other") return { userId: OTHER };
        return null;
      },
    } as unknown as SessionService,
  });
}

async function call(
  app: ReturnType<typeof createApiApp>,
  input: { method: string; url: string; body?: unknown; token?: string; deviceId?: string },
) {
  const headers: Record<string, string> = {};
  if (input.token) headers.authorization = `Bearer ${input.token}`;
  if (input.deviceId) headers["x-device-id"] = input.deviceId;
  const req = { method: input.method, url: input.url, headers, body: input.body } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

function json(res: MockResponse): Record<string, unknown> {
  return JSON.parse(res.body) as Record<string, unknown>;
}

const registerBody = {
  device_public_key: "AAAA",
  device_share: "AAAA",
  device_fingerprint: "web_app-chrome-macos-14.5",
  device_name: "Chrome",
};

test("device block routes require auth and a known duration (QA web 4.4, 12.5)", async () => {
  clock = Date.parse("2026-06-15T12:00:00.000Z");
  const { repo } = createDevices();
  const app = createApp(repo);
  const missing = await call(app, {
    method: "POST",
    url: "/devices/dev-1/block",
    body: { duration: "1h" },
  });
  assert.equal(missing.statusCode, 401);
  assert.equal(json(missing).error, "AUTH_REQUIRED");

  const bad = await call(app, {
    method: "POST",
    url: "/devices/dev-1/block",
    token: "owner",
    deviceId: "approver",
    body: { duration: "2h" },
  });
  assert.equal(bad.statusCode, 400);
  assert.equal(json(bad).error, "DEVICE_BAD_REQUEST");
});

test("block for 1h, 1 day, and forever; forever does not expire; unblock allows approval again (QA web 4.4, 12.5)", async () => {
  clock = Date.parse("2026-06-15T12:00:00.000Z");
  const { devices, repo } = createDevices();
  devices.push(record({ id: "approver", userId: OWNER, status: "trusted", deviceFingerprint: "web_app-firefox-linux-1.0" }));
  const app = createApp(repo);

  const registered = json(await call(app, {
    method: "POST",
    url: "/devices/register",
    token: "owner",
    body: registerBody,
  }));
  assert.equal(registered.status, "pending_approval");
  const pendingId = String(registered.device_id);

  const blocked = await call(app, {
    method: "POST",
    url: `/devices/${pendingId}/block`,
    token: "owner",
    deviceId: "approver",
    body: { duration: "1h" },
  });
  assert.equal(blocked.statusCode, 200);
  const until = Date.parse(String(json(blocked).blocked_until));
  assert.equal(until - clock, 60 * 60 * 1000);

  const whileBlocked = json(await call(app, {
    method: "POST",
    url: "/devices/register",
    token: "owner",
    body: registerBody,
  }));
  assert.equal(whileBlocked.status, "blocked");
  const approve = await call(app, {
    method: "POST",
    url: `/devices/${pendingId}/approve`,
    token: "owner",
    deviceId: "approver",
    body: {},
  });
  assert.equal(approve.statusCode, 404);

  clock += 60 * 60 * 1000 + 1;
  const afterHour = json(await call(app, {
    method: "POST",
    url: "/devices/register",
    token: "owner",
    body: registerBody,
  }));
  assert.equal(afterHour.status, "pending_approval");

  const day = await call(app, {
    method: "POST",
    url: `/devices/${pendingId}/block`,
    token: "owner",
    deviceId: "approver",
    body: { duration: "1d" },
  });
  assert.equal(Date.parse(String(json(day).blocked_until)) - clock, 24 * 60 * 60 * 1000);

  clock += 24 * 60 * 60 * 1000 + 1;
  await call(app, { method: "POST", url: "/devices/register", token: "owner", body: registerBody });
  const forever = await call(app, {
    method: "POST",
    url: `/devices/${pendingId}/block`,
    token: "owner",
    deviceId: "approver",
    body: { duration: "forever" },
  });
  assert.equal(forever.statusCode, 200);
  assert.equal(json(forever).blocked_until, null);
  clock += 365 * 24 * 60 * 60 * 1000;
  const still = json(await call(app, {
    method: "POST",
    url: "/devices/register",
    token: "owner",
    body: registerBody,
  }));
  assert.equal(still.status, "blocked");

  const unblocked = await call(app, {
    method: "POST",
    url: `/devices/${pendingId}/unblock`,
    token: "owner",
    body: {},
  });
  assert.equal(unblocked.statusCode, 200);
  const again = json(await call(app, {
    method: "POST",
    url: "/devices/register",
    token: "owner",
    body: registerBody,
  }));
  assert.equal(again.status, "pending_approval");
});

test("only the owner can block a device (QA web 12.5)", async () => {
  clock = Date.parse("2026-06-15T12:00:00.000Z");
  const { devices, repo } = createDevices();
  devices.push(record({ id: "approver", userId: OTHER, status: "trusted", deviceFingerprint: "web_app-firefox-linux-1.0" }));
  devices.push(record({ id: "pending-owner", userId: OWNER, status: "pending" }));
  const app = createApp(repo);
  const res = await call(app, {
    method: "POST",
    url: "/devices/pending-owner/block",
    token: "other",
    deviceId: "approver",
    body: { duration: "forever" },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(json(res).error, "DEVICE_APPROVAL_NOT_FOUND");
});

test(
  "the current device cannot be revoked (QA web 4.4)",
  { todo: true },
  async () => {
    clock = Date.parse("2026-06-15T12:00:00.000Z");
    const { devices, repo } = createDevices();
    devices.push(record({ id: "current", userId: OWNER, status: "trusted" }));
    const app = createApp(repo);
    const res = await call(app, {
      method: "POST",
      url: "/devices/current/revoke",
      token: "owner",
      deviceId: "current",
      body: {},
    });
    assert.ok(res.statusCode >= 400 && res.statusCode < 500);
  },
);
