import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { testEntityId } from "./test-entity-id.ts";
import test from "node:test";
import { createApiApp } from "../src/app.ts";
import type { AccountRecoveryService } from "../src/account-recovery/service.ts";
import { CapsuleServiceError, type CapsuleService } from "../src/capsule/service.ts";
import type { ApiConfig } from "../src/config.ts";
import type { SessionService } from "../src/session/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";
  setHeader(_name: string, _value: string): void {}
  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

function loggerStub(logs?: Array<Record<string, unknown>>) {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
    ...(logs
      ? {
          info(message: string, extra?: Record<string, unknown>) {
            logs.push({ level: "info", message, ...(extra ?? {}) });
          },
          warn(message: string, extra?: Record<string, unknown>) {
            logs.push({ level: "warn", message, ...(extra ?? {}) });
          },
          error(message: string, extra?: Record<string, unknown>) {
            logs.push({ level: "error", message, ...(extra ?? {}) });
          },
        }
      : {}),
  };
}

const config: ApiConfig = createTestApiConfig();

function mkBlob(payload = "x", cryptoVersion = 2) {
  return {
    crypto_version: cryptoVersion,
    algorithm: "opaque",
    payload: Buffer.from(payload).toString("base64"),
    meta: {},
  };
}

function createCapsuleServiceStub(overrides?: Partial<CapsuleService>): CapsuleService {
  const capsuleId = testEntityId();
  return {
    createCapsule: async () => ({
      capsuleId,
      type: "item",
      expiresAt: null,
      maxViews: null,
      viewCount: 0,
      passwordRequired: false,
      createdAt: new Date().toISOString(),
    }),
    getCapsuleMetadata: async () => ({
      capsuleId,
      type: "item",
      expiresAt: null,
      maxViews: null,
      viewCount: 0,
      passwordRequired: false,
      createdAt: new Date().toISOString(),
    }),
    openCapsule: async () => ({
      capsuleId,
      type: "item",
      expiresAt: null,
      maxViews: null,
      viewCount: 1,
      passwordRequired: false,
      createdAt: new Date().toISOString(),
      encryptedPayload: mkBlob("x"),
    }),
    revokeCapsule: async () => {},
    ...(overrides ?? {}),
  } as unknown as CapsuleService;
}

async function dispatch(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  capsuleService?: CapsuleService;
  sessionService?: SessionService;
  accountRecoveryService?: AccountRecoveryService;
  logs?: Array<Record<string, unknown>>;
}) {
  const app = createApiApp(config, loggerStub(input.logs), {
    capsuleService: input.capsuleService ?? createCapsuleServiceStub(),
    ...(input.sessionService ? { sessionService: input.sessionService } : {}),
    ...(input.accountRecoveryService
      ? { accountRecoveryService: input.accountRecoveryService }
      : {}),
  });
  const req = {
    method: input.method,
    url: input.url,
    headers: input.headers ?? {},
    ...(input.body !== undefined ? { body: input.body } : {}),
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

test("GET /capsules/:capsuleId/owner and PUT /capsules/:capsuleId require auth", async () => {
  const capsuleId = testEntityId();
  const ownerRes = await dispatch({
    method: "GET",
    url: `/capsules/${capsuleId}/owner`,
  });
  assert.equal(ownerRes.statusCode, 401);

  const updateRes = await dispatch({
    method: "PUT",
    url: `/capsules/${capsuleId}`,
    body: { type: "text", encryptedPayload: mkBlob("x") },
  });
  assert.equal(updateRes.statusCode, 401);
});

test("GET /capsules/:capsuleId/owner returns owner detail", async () => {
  const capsuleId = testEntityId();
  const res = await dispatch({
    method: "GET",
    url: `/capsules/${capsuleId}/owner`,
    headers: { "x-user-id": "u1" },
    capsuleService: createCapsuleServiceStub({
      getOwnerCapsule: async () => ({
        capsuleId,
        type: "text",
        state: "active",
        activateAt: null,
        deactivateAt: null,
        deleteAt: null,
        maxViews: 2,
        viewCount: 1,
        viewLimitAction: "deactivate",
        passwordRequired: false,
        passwordAttemptLimit: null,
        recipientRestricted: false,
        approvalRequired: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        encryptedMetadata: mkBlob("meta"),
        ownerKeyWrap: mkBlob("wrap"),
        encryptedPayload: mkBlob("payload"),
      }),
    }),
  });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { capsuleId: string; encryptedPayload?: unknown };
  assert.equal(payload.capsuleId, capsuleId);
  assert.ok(payload.encryptedPayload);
});

test("POST /workspaces/:workspaceId/capsules requires auth", async () => {
  const res = await dispatch({
    method: "POST",
    url: `/workspaces/${testEntityId()}/capsules`,
    body: { type: "item", encryptedPayload: mkBlob("x") },
  });
  assert.equal(res.statusCode, 401);
});

test("GET /capsules/:capsuleId returns metadata", async () => {
  const capsuleId = testEntityId();
  const res = await dispatch({
    method: "GET",
    url: `/capsules/${capsuleId}`,
    capsuleService: createCapsuleServiceStub({
      getCapsuleMetadata: async () => ({
        capsuleId,
        type: "item",
        expiresAt: null,
        maxViews: null,
        viewCount: 0,
        passwordRequired: false,
        createdAt: new Date().toISOString(),
      }),
    }),
  });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { capsuleId: string };
  assert.equal(payload.capsuleId, capsuleId);
});

test("capsules routes map domain errors", async () => {
  const capsuleId = testEntityId();
  const res = await dispatch({
    method: "POST",
    url: `/capsules/${capsuleId}/open`,
    body: {},
    capsuleService: createCapsuleServiceStub({
      openCapsule: async () => {
        throw new CapsuleServiceError("CAPSULE_PASSWORD_REQUIRED", 401, "password required");
      },
    }),
  });
  assert.equal(res.statusCode, 401);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "CAPSULE_PASSWORD_REQUIRED");
});

test("capsules routes reject unsafe key transport in URL query", async () => {
  const capsuleId = testEntityId();
  const res = await dispatch({
    method: "POST",
    url: `/capsules/${capsuleId}/open?key=raw-secret`,
    body: {},
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "CAPSULE_UNSAFE_KEY_TRANSPORT");
});

test("GET /capsule-approval-requests/:id rejects a malformed guestSessionId before lookup", async () => {
  const requestId = testEntityId();
  const lookups = { session: 0, recovery: 0, status: 0 };
  const malformed = [
    "%00",
    "not-a-session",
    "guest",
    "bad%20id",
    "%0A",
  ];
  for (const guestSessionId of malformed) {
    const res = await dispatch({
      method: "GET",
      url: `/capsule-approval-requests/${requestId}?guestSessionId=${guestSessionId}`,
      headers: { authorization: "Bearer tok" },
      capsuleService: createCapsuleServiceStub({
        getApprovalStatus: async () => {
          lookups.status += 1;
          throw new Error("should not query");
        },
      }),
      sessionService: {
        resolveAccessToken: async () => {
          lookups.session += 1;
          return null;
        },
      } as unknown as SessionService,
      accountRecoveryService: {
        hasExportedRecoveryKey: async () => {
          lookups.recovery += 1;
          return false;
        },
      } as unknown as AccountRecoveryService,
    });
    assert.equal(res.statusCode, 400, guestSessionId);
    const payload = JSON.parse(res.body) as { error: string };
    assert.equal(payload.error, "INVALID_GUEST_SESSION_ID", guestSessionId);
  }
  assert.equal(lookups.session, 0);
  assert.equal(lookups.recovery, 0);
  assert.equal(lookups.status, 0);
});

test("GET /capsule-approval-requests/:id accepts a guest session token and still requires one", async () => {
  const requestId = testEntityId();
  const guestSessionId = "550e8400-e29b-41d4-a716-446655440000";
  let seenGuest: string | undefined;
  const ok = await dispatch({
    method: "GET",
    url: `/capsule-approval-requests/${requestId}?guestSessionId=${encodeURIComponent(`  ${guestSessionId}  `)}`,
    capsuleService: createCapsuleServiceStub({
      getApprovalStatus: async (_requestId, _userId, guest) => {
        seenGuest = guest;
        return { requestId, status: "pending" };
      },
    }),
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(seenGuest, guestSessionId);

  const guestToken = `guest-session-${testEntityId()}`;
  let seenToken: string | undefined;
  const tokenRes = await dispatch({
    method: "GET",
    url: `/capsule-approval-requests/${requestId}?guestSessionId=${encodeURIComponent(guestToken)}`,
    capsuleService: createCapsuleServiceStub({
      getApprovalStatus: async (_requestId, _userId, guest) => {
        seenToken = guest;
        return { requestId, status: "pending" };
      },
    }),
  });
  assert.equal(tokenRes.statusCode, 200);
  assert.equal(seenToken, guestToken);

  const missing = await dispatch({
    method: "GET",
    url: `/capsule-approval-requests/${requestId}`,
  });
  assert.equal(missing.statusCode, 401);
  assert.equal(JSON.parse(missing.body).error, "AUTH_REQUIRED");
});

test("request logger redacts sensitive key transport query values", async () => {
  const capsuleId = testEntityId();
  const logs: Array<Record<string, unknown>> = [];
  const res = await dispatch({
    method: "GET",
    url: `/capsules/${capsuleId}?key=raw-secret`,
    logs,
  });
  assert.equal(res.statusCode, 400);
  const requestLog = logs.find((entry) => entry.message === "request completed");
  assert.ok(requestLog);
  assert.equal(requestLog?.path, `/capsules/${capsuleId}?key=%5Bredacted%5D`);
});
