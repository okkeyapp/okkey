import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import { ExtensionAuthService } from "../src/extension-auth/service.ts";
import type { SessionService } from "../src/session/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const REDIRECT = "chrome-extension://abcdefghijklmnop/auth-callback.html";
const CHALLENGE = "a".repeat(43);

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

function memoryRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async get(key: string): Promise<string | null> {
      const row = store.get(key);
      if (!row || Date.now() >= row.expiresAt) {
        return null;
      }
      return row.value;
    },
    async del(key: string): Promise<number> {
      return store.delete(key) ? 1 : 0;
    },
  };
}

test("POST /auth/extension/code accepts an unbound full session from email login", async () => {
  const extensionAuthService = new ExtensionAuthService({
    redis: memoryRedis(),
    sessionService: {
      async createSession() {
        return { accessToken: "ext", expiresAt: "2099-01-01T00:00:00.000Z", scope: null };
      },
    },
    generateCode: () => "pkce-code",
  });
  const sessionService = {
    resolveAccessToken: async (token: string) => {
      if (token !== "tok-unbound") {
        return null;
      }
      return {
        userId: "u1",
        deviceId: null,
        scope: null,
        tokenHash: "hash:tok-unbound",
        expiresAt: "2099-01-01T00:00:00.000Z",
      };
    },
  } as unknown as SessionService;

  const app = createApiApp(createTestApiConfig(), loggerStub(), {
    extensionAuthService,
    sessionService,
  });

  async function call(headers: Record<string, string>) {
    const req = {
      method: "POST",
      url: "/auth/extension/code",
      headers,
      body: {
        client_id: "okkey_extension",
        redirect_uri: REDIRECT,
        code_challenge: CHALLENGE,
        code_challenge_method: "S256",
      },
    } as IncomingMessage;
    const res = new MockResponse();
    await app.handler()(req, res as unknown as ServerResponse);
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  }

  const anonymous = await call({});
  assert.equal(anonymous.status, 401);

  const unbound = await call({ authorization: "Bearer tok-unbound" });
  assert.equal(unbound.status, 200);
  assert.equal(unbound.body.code, "pkce-code");
});

test("extension token returns name and email while GET /account/profile is 401 before approval", async () => {
  const profiles = new Map<string, { email: string; firstName: string | null; lastName: string | null }>([
    ["u-named", { email: "ada@example.com", firstName: "Ada", lastName: "Lovelace" }],
    ["u-email", { email: "no-name@example.com", firstName: null, lastName: "  " }],
  ]);
  const issued = new Map<string, string>();
  const extensionAuthService = new ExtensionAuthService({
    redis: memoryRedis(),
    sessionService: {
      async createSession(userId: string) {
        const accessToken = `ext-${userId}`;
        issued.set(accessToken, userId);
        return { accessToken, expiresAt: "2099-01-01T00:00:00.000Z", scope: null };
      },
    },
    loadAccountIdentity: async (userId) => profiles.get(userId) ?? null,
  });
  const sessionService = {
    resolveAccessToken: async (token: string) => {
      const userId = token.startsWith("web-") ? token.slice(4) : issued.get(token);
      if (!userId) {
        return null;
      }
      return {
        userId,
        deviceId: null,
        scope: null,
        tokenHash: `hash:${token}`,
        expiresAt: "2099-01-01T00:00:00.000Z",
      };
    },
  } as unknown as SessionService;

  const app = createApiApp(createTestApiConfig(), loggerStub(), {
    extensionAuthService,
    sessionService,
    usersRepository: {
      async loadAccountProfile(userId: string) {
        const row = profiles.get(userId);
        if (!row) {
          return null;
        }
        return {
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          locale: "en",
          billingRegion: "US",
          vaultIdleLockSeconds: 900,
          masterPasswordChangedAt: "2026-01-01T00:00:00.000Z",
        };
      },
    } as never,
  });

  async function call(method: string, url: string, headers: Record<string, string>, body?: unknown) {
    const req = {
      method,
      url,
      headers,
      body,
    } as IncomingMessage;
    const res = new MockResponse();
    await app.handler()(req, res as unknown as ServerResponse);
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  }

  async function signIn(userId: string) {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const code = await call(
      "POST",
      "/auth/extension/code",
      { authorization: `Bearer web-${userId}` },
      {
        client_id: "okkey_extension",
        redirect_uri: REDIRECT,
        code_challenge: challenge,
        code_challenge_method: "S256",
      },
    );
    assert.equal(code.status, 200);
    const token = await call("POST", "/auth/extension/token", {}, {
      client_id: "okkey_extension",
      redirect_uri: REDIRECT,
      code: code.body.code,
      code_verifier: verifier,
    });
    assert.equal(token.status, 200);
    const profile = await call("GET", "/account/profile", {
      authorization: `Bearer ${token.body.access_token}`,
    });
    assert.equal(profile.status, 401);
    return token.body as Record<string, unknown>;
  }

  const named = await signIn("u-named");
  assert.equal(named.email, "ada@example.com");
  assert.equal(named.first_name, "Ada");
  assert.equal(named.last_name, "Lovelace");
  assert.equal("billing_region" in named, false);
  assert.equal("locale" in named, false);
  assert.equal("vault_idle_lock_seconds" in named, false);
  assert.equal("master_password_changed_at" in named, false);

  const emailOnly = await signIn("u-email");
  assert.equal(emailOnly.email, "no-name@example.com");
  assert.equal(emailOnly.first_name, null);
  assert.equal(emailOnly.last_name, null);
});
