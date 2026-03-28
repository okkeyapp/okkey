import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApiApp } from "../src/app.ts";
import { CapsuleServiceError, type CapsuleService } from "../src/capsule/service.ts";
import type { ApiConfig } from "../src/config.ts";
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
  const capsuleId = randomUUID();
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
  logs?: Array<Record<string, unknown>>;
}) {
  const app = createApiApp(config, loggerStub(input.logs), {
    capsuleService: input.capsuleService ?? createCapsuleServiceStub(),
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

test("POST /workspaces/:workspaceId/capsules requires auth", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/workspaces/w1/capsules",
    body: { type: "item", encryptedPayload: mkBlob("x") },
  });
  assert.equal(res.statusCode, 401);
});

test("GET /capsules/:capsuleId returns metadata", async () => {
  const capsuleId = randomUUID();
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
  const capsuleId = randomUUID();
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
  const capsuleId = randomUUID();
  const res = await dispatch({
    method: "POST",
    url: `/capsules/${capsuleId}/open?key=raw-secret`,
    body: {},
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "CAPSULE_UNSAFE_KEY_TRANSPORT");
});

test("request logger redacts sensitive key transport query values", async () => {
  const capsuleId = randomUUID();
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
