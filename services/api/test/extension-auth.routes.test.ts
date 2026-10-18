import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { createApiApp } from "../src/app.ts";
import { ExtensionAuthService } from "../src/extension-auth/service.ts";
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

const REDIRECT = "chrome-extension://abcdefghijklmnop/auth-callback.html";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

function memoryRedis(clock: { now: number }) {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    async setWithTtl(key: string, value: string, ttlSeconds: number) {
      store.set(key, { value, expiresAt: clock.now + ttlSeconds * 1000 });
    },
    async get(key: string) {
      const row = store.get(key);
      if (!row || clock.now >= row.expiresAt) return null;
      return row.value;
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
  };
}

function createHarness() {
  const logs: string[] = [];
  const clock = { now: Date.parse("2026-06-15T12:00:00.000Z") };
  const service = new ExtensionAuthService({
    redis: memoryRedis(clock),
    sessionService: {
      async createSession(userId: string) {
        return { accessToken: `ext-token-${userId}`, expiresAt: "2099-01-01T00:00:00.000Z" };
      },
    },
    now: () => new Date(clock.now),
    generateCode: () => "issued-auth-code",
  });
  const app = createApiApp(
    createTestApiConfig({ allowHeaderUserIdAuth: false }),
    {
      info(message: string, extra?: Record<string, unknown>) {
        logs.push(`${message} ${JSON.stringify(extra ?? {})}`);
      },
      warn(message: string, extra?: Record<string, unknown>) {
        logs.push(`${message} ${JSON.stringify(extra ?? {})}`);
      },
      error(message: string, extra?: Record<string, unknown>) {
        logs.push(`${message} ${JSON.stringify(extra ?? {})}`);
      },
    },
    {
      extensionAuthService: service,
      sessionService: {
        async resolveAccessToken(token: string) {
          return token === "web-session" ? { userId: "user-1" } : null;
        },
      } as unknown as SessionService,
    },
  );
  return { app, logs, clock };
}

async function call(
  app: ReturnType<typeof createApiApp>,
  input: { url: string; body: unknown; token?: string },
) {
  const headers: Record<string, string> = {};
  if (input.token) headers.authorization = `Bearer ${input.token}`;
  const req = { method: "POST", url: input.url, headers, body: input.body } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

test("extension code issue requires a web session and an allowed redirect (QA extension PKCE)", async () => {
  const { app } = createHarness();
  const anon = await call(app, {
    url: "/auth/extension/code",
    body: {
      client_id: "okkey_extension",
      redirect_uri: REDIRECT,
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
    },
  });
  assert.equal(anon.statusCode, 401);
  assert.equal(JSON.parse(anon.body).error, "UNAUTHORIZED");

  const badRedirect = await call(app, {
    url: "/auth/extension/code",
    token: "web-session",
    body: {
      client_id: "okkey_extension",
      redirect_uri: "https://evil.example/callback",
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
    },
  });
  assert.equal(badRedirect.statusCode, 400);
  assert.equal(JSON.parse(badRedirect.body).error, "EXTENSION_AUTH_INVALID_REDIRECT");
});

test("token exchange rejects a bad verifier, a replay, and an expired code, and logs no secrets (QA extension PKCE)", async () => {
  const { app, logs, clock } = createHarness();
  const issued = await call(app, {
    url: "/auth/extension/code",
    token: "web-session",
    body: {
      client_id: "okkey_extension",
      redirect_uri: REDIRECT,
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
    },
  });
  assert.equal(issued.statusCode, 200);
  assert.equal(JSON.parse(issued.body).code, "issued-auth-code");

  const wrong = await call(app, {
    url: "/auth/extension/token",
    body: {
      client_id: "okkey_extension",
      redirect_uri: REDIRECT,
      code: "issued-auth-code",
      code_verifier: "c".repeat(64),
    },
  });
  assert.equal(wrong.statusCode, 400);
  assert.equal(JSON.parse(wrong.body).error, "EXTENSION_AUTH_INVALID_VERIFIER");

  const replay = await call(app, {
    url: "/auth/extension/token",
    body: {
      client_id: "okkey_extension",
      redirect_uri: REDIRECT,
      code: "issued-auth-code",
      code_verifier: VERIFIER,
    },
  });
  assert.equal(replay.statusCode, 400);
  assert.equal(JSON.parse(replay.body).error, "EXTENSION_AUTH_INVALID_CODE");

  const again = await call(app, {
    url: "/auth/extension/code",
    token: "web-session",
    body: {
      client_id: "okkey_extension",
      redirect_uri: REDIRECT,
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
    },
  });
  assert.equal(again.statusCode, 200);
  clock.now += 121_000;
  const expired = await call(app, {
    url: "/auth/extension/token",
    body: {
      client_id: "okkey_extension",
      redirect_uri: REDIRECT,
      code: "issued-auth-code",
      code_verifier: VERIFIER,
    },
  });
  assert.equal(expired.statusCode, 400);
  assert.equal(JSON.parse(expired.body).error, "EXTENSION_AUTH_INVALID_CODE");

  const fresh = createHarness();
  const minted = await call(fresh.app, {
    url: "/auth/extension/code",
    token: "web-session",
    body: {
      client_id: "okkey_extension",
      redirect_uri: REDIRECT,
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
    },
  });
  const exchanged = await call(fresh.app, {
    url: "/auth/extension/token",
    body: {
      client_id: "okkey_extension",
      redirect_uri: REDIRECT,
      code: JSON.parse(minted.body).code,
      code_verifier: VERIFIER,
    },
  });
  assert.equal(exchanged.statusCode, 200);
  const token = JSON.parse(exchanged.body) as { access_token: string; user_id: string; token_type: string };
  assert.equal(token.access_token, "ext-token-user-1");
  assert.equal(token.user_id, "user-1");
  assert.equal(token.token_type, "Bearer");
  const second = await call(fresh.app, {
    url: "/auth/extension/token",
    body: {
      client_id: "okkey_extension",
      redirect_uri: REDIRECT,
      code: JSON.parse(minted.body).code,
      code_verifier: VERIFIER,
    },
  });
  assert.equal(second.statusCode, 400);

  const logged = [...logs, ...fresh.logs].join("\n");
  assert.equal(logged.includes(VERIFIER), false);
  assert.equal(logged.includes("issued-auth-code"), false);
  assert.equal(logged.includes("ext-token-user-1"), false);
});
