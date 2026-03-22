import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AuthError, type AuthService } from "../src/auth/service.ts";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";

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

const config: ApiConfig = createTestApiConfig();

function createAuthStub(overrides?: Partial<AuthService>) {
  return {
    startEmailLogin: async () => ({
      challengeId: "c1",
      expiresAt: "2026-01-01T00:05:00.000Z",
      resendAvailableAt: "2026-01-01T00:01:00.000Z",
    }),
    resendEmailCode: async () => ({
      challengeId: "c1",
      expiresAt: "2026-01-01T00:05:00.000Z",
      resendAvailableAt: "2026-01-01T00:01:00.000Z",
    }),
    confirmEmailCode: async () => ({
      authStateId: "state-1",
      userExists: false,
      nextStep: "registration" as const,
    }),
    ...(overrides ?? {}),
  } as unknown as AuthService;
}

async function dispatch(input: {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  authService?: AuthService;
}) {
  const app = createApiApp(config, loggerStub(), {
    authService: input.authService ?? createAuthStub(),
  });
  const handler = app.handler();

  const req = {
    method: input.method,
    url: input.url,
    headers: input.headers ?? {},
    body: input.body,
  } as IncomingMessage;
  const res = new MockResponse();

  await handler(req, res as unknown as ServerResponse);
  return res;
}

test("POST /auth/email/start returns challenge", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/auth/email/start",
    body: { email: "user@example.com" },
    headers: { "x-forwarded-for": "127.0.0.1" },
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { challengeId: string };
  assert.equal(payload.challengeId, "c1");
});

test("POST /auth/email/start validates email required", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/auth/email/start",
    body: {},
  });

  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "AUTH_BAD_REQUEST");
});

test("POST /auth/email/confirm maps auth error", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/auth/email/confirm",
    body: { challengeId: "c1", code: "000000" },
    authService: createAuthStub({
      confirmEmailCode: async () => {
        throw new AuthError("AUTH_CODE_INVALID", 400, "invalid code");
      },
    }),
  });

  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "AUTH_CODE_INVALID");
});

test("POST /auth/email/resend returns cooldown payload", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/auth/email/resend",
    body: { challengeId: "c1" },
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { challengeId: string };
  assert.equal(payload.challengeId, "c1");
});
