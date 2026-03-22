import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { SyncServiceError, type SyncService } from "../src/sync/service.ts";

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
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

const config: ApiConfig = {
  nodeEnv: "test",
  port: 4000,
  logLevel: "debug",
  corsOrigin: "*",
  databaseUrl: "",
  redisUrl: "",
  authCodeTtlSeconds: 300,
  authResendCooldownSeconds: 60,
  authCodeMaxAttempts: 5,
  authRateLimitWindowSeconds: 600,
  authRateLimitStartPerEmail: 5,
  authRateLimitStartPerIp: 10,
  authRateLimitConfirmPerIp: 30,
  authRateLimitResendPerIp: 10,
  registrationAuthStateTtlSeconds: 3600,
  registrationResultTtlSeconds: 604800,
  deviceApprovalTtlSeconds: 600,
  defaultEmailLocale: "en",
  emailFrom: "no-reply@okkey.local",
  emailProvider: "logger",
  smtpHost: "localhost",
  smtpPort: 1025,
  smtpSecure: false,
  smtpUser: "",
  smtpPassword: "",
  emailApiEndpoint: "",
  emailApiKey: "",
  emailApiTimeoutMs: 10000,
};

function createSyncServiceStub(overrides?: Partial<SyncService>): SyncService {
  return {
    listEvents: async () => [
      {
        id: "e1",
        vaultId: "v1",
        actorId: "u1",
        eventType: "ITEM_CREATE",
        encryptedPayload: Buffer.from("x").toString("base64"),
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    appendEvent: async () => ({
      id: "e2",
      vaultId: "v1",
      actorId: "u1",
      eventType: "ITEM_UPDATE",
      encryptedPayload: Buffer.from("x").toString("base64"),
      version: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    ...(overrides ?? {}),
  } as unknown as SyncService;
}

async function dispatch(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  syncService?: SyncService;
}) {
  const app = createApiApp(config, loggerStub(), {
    syncService: input.syncService ?? createSyncServiceStub(),
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

test("GET /vaults/:vaultId/events returns events", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vaults/v1/events?afterVersion=0",
    headers: { "x-user-id": "u1" },
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { events: Array<{ id: string }> };
  assert.equal(payload.events[0].id, "e1");
});

test("POST /vaults/:vaultId/events appends event", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/events",
    headers: { "x-user-id": "u1" },
    body: {
      eventType: "ITEM_UPDATE",
      encryptedPayload: Buffer.from("x").toString("base64"),
      baseVersion: 1,
    },
  });

  assert.equal(res.statusCode, 201);
  const payload = JSON.parse(res.body) as { id: string; version: number };
  assert.equal(payload.id, "e2");
  assert.equal(payload.version, 2);
});

test("sync routes require x-user-id", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vaults/v1/events?afterVersion=0",
  });

  assert.equal(res.statusCode, 401);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "AUTH_REQUIRED");
});

test("POST /vaults/:vaultId/events validates required fields", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/events",
    headers: { "x-user-id": "u1" },
    body: { eventType: "ITEM_UPDATE" },
  });

  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "SYNC_BAD_REQUEST");
});

test("sync routes map VERSION_MISMATCH", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/events",
    headers: { "x-user-id": "u1" },
    body: {
      eventType: "ITEM_UPDATE",
      encryptedPayload: Buffer.from("x").toString("base64"),
      baseVersion: 1,
    },
    syncService: createSyncServiceStub({
      appendEvent: async () => {
        throw new SyncServiceError("VERSION_MISMATCH", 409, "baseVersion is stale");
      },
    }),
  });

  assert.equal(res.statusCode, 409);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "VERSION_MISMATCH");
});
