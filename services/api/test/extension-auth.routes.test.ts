import test from "node:test";
import assert from "node:assert/strict";
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
