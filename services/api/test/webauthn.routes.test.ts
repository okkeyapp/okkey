import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";

import { createApiApp } from "../src/app.ts";
import type { SessionService } from "../src/session/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import type { WebAuthnCredentialRecord, WebAuthnCredentialsRepository } from "../src/webauthn/repository.ts";
import { WebAuthnService } from "../src/webauthn/service.ts";

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

function memoryCredentials(): WebAuthnCredentialsRepository {
  const rows: WebAuthnCredentialRecord[] = [
    {
      id: "cred-row-1",
      userId: "user-a",
      credentialId: "cred-public",
      publicKey: Uint8Array.from([1]),
      signCount: 0,
      transports: [],
      authenticatorAttachment: "platform",
      name: "Passkey",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  return {
    async listByUserId(userId) {
      return rows.filter((row) => row.userId === userId);
    },
    async listByUserAndAttachment(userId, attachment) {
      return rows.filter((row) => row.userId === userId && row.authenticatorAttachment === attachment);
    },
    async findByCredentialId(credentialId) {
      return rows.find((row) => row.credentialId === credentialId) ?? null;
    },
    async findByIdForUser(userId, id) {
      return rows.find((row) => row.userId === userId && row.id === id) ?? null;
    },
    async insert() {
      throw new Error("not used");
    },
    async updateSignCount() {},
    async deleteByIdForUser(userId, id) {
      const index = rows.findIndex((row) => row.userId === userId && row.id === id);
      if (index >= 0) rows.splice(index, 1);
    },
    async deleteByAttachment() {},
    async getPrimaryLoginMethod() {
      return "email";
    },
    async setPrimaryLoginMethod() {},
  } as WebAuthnCredentialsRepository;
}

function createApp() {
  const service = new WebAuthnService({
    redis: {
      async setWithTtl() {},
      async get() {
        return null;
      },
      async del() {
        return 0;
      },
    },
    credentials: memoryCredentials(),
    users: {
      async findByEmail() {
        return null;
      },
      async findById() {
        return null;
      },
      async isTwoFactorEnabled() {
        return false;
      },
    },
    authService: {
      async removeAuthState() {},
      async createAuthStateForExistingUser() {
        return { authStateId: "state", nextStep: "device_check" as const };
      },
    },
    config: createTestApiConfig(),
  });
  return createApiApp(createTestApiConfig({ allowHeaderUserIdAuth: false }), {
    info() {},
    warn() {},
    error() {},
  }, {
    webauthnService: service,
    sessionService: {
      async resolveAccessToken(token: string) {
        if (token === "user-a") return { userId: "user-a" };
        if (token === "user-b") return { userId: "user-b" };
        return null;
      },
    } as unknown as SessionService,
  });
}

async function call(
  input: { method: string; url: string; body?: unknown; token?: string },
) {
  const headers: Record<string, string> = {};
  if (input.token) headers.authorization = `Bearer ${input.token}`;
  const req = {
    method: input.method,
    url: input.url,
    headers,
    body: input.body ?? {},
  } as IncomingMessage;
  const res = new MockResponse();
  await createApp().handler()(req, res as unknown as ServerResponse);
  return res;
}

test("account WebAuthn routes require auth (QA web 12.9)", async () => {
  const routes = [
    ["POST", "/account/webauthn/register/options"],
    ["POST", "/account/webauthn/register/verify"],
    ["DELETE", "/account/webauthn/credentials/cred-row-1"],
  ] as const;
  for (const [method, url] of routes) {
    const res = await call({
      method,
      url,
      body: { attachment: "platform", challengeId: "missing", response: { id: "x" } },
    });
    assert.equal(res.statusCode, 401, url);
    assert.equal(JSON.parse(res.body).error, "AUTH_REQUIRED");
  }
});

test("WebAuthn verify rejects a bad challenge (QA web 12.9)", async () => {
  const login = await call({
    method: "POST",
    url: "/auth/webauthn/login/verify",
    body: { challengeId: "missing-challenge", response: { id: "x", type: "public-key" } },
  });
  assert.equal(login.statusCode, 400);
  assert.equal(JSON.parse(login.body).error, "WEBAUTHN_CHALLENGE_EXPIRED");

  const register = await call({
    method: "POST",
    url: "/account/webauthn/register/verify",
    token: "user-a",
    body: { challengeId: "missing-challenge", response: { id: "x", type: "public-key" } },
  });
  assert.equal(register.statusCode, 400);
  assert.match(String(JSON.parse(register.body).error), /WEBAUTHN_CHALLENGE_/);
});

test("deleting another user's credential is not found (QA web 12.9)", async () => {
  const res = await call({
    method: "DELETE",
    url: "/account/webauthn/credentials/cred-row-1",
    token: "user-b",
  });
  assert.equal(res.statusCode, 404);
  assert.equal(JSON.parse(res.body).error, "WEBAUTHN_CREDENTIAL_NOT_FOUND");
});
