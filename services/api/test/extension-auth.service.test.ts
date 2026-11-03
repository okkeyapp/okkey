import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ExtensionAuthService,
  isAllowedExtensionRedirectUri,
} from "../src/extension-auth/service.ts";

function sha256Base64Url(input: string): string {
  return createHash("sha256")
    .update(input, "utf8")
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function memoryRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async get(key: string): Promise<string | null> {
      const row = store.get(key);
      if (!row) return null;
      if (Date.now() >= row.expiresAt) {
        store.delete(key);
        return null;
      }
      return row.value;
    },
    async del(key: string): Promise<number> {
      return store.delete(key) ? 1 : 0;
    },
  };
}

test("isAllowedExtensionRedirectUri accepts extension schemes", () => {
  assert.equal(
    isAllowedExtensionRedirectUri("chrome-extension://abcdefghijklmnop/auth-callback.html"),
    true,
  );
  assert.equal(
    isAllowedExtensionRedirectUri("moz-extension://uuid-here/auth-callback.html"),
    true,
  );
  assert.equal(
    isAllowedExtensionRedirectUri("https://abcdefghijklmnop.chromiumapp.org/"),
    true,
  );
  assert.equal(isAllowedExtensionRedirectUri("https://evil.example/callback"), false);
  assert.equal(isAllowedExtensionRedirectUri("http://localhost:5173/callback"), false);
  assert.equal(
    isAllowedExtensionRedirectUri("chrome-extension://invalid/auth-callback.html"),
    false,
  );
  assert.equal(
    isAllowedExtensionRedirectUri("chrome-extension://abcdefghijklmnop/other.html"),
    false,
  );
});

test("issue + exchange auth code with PKCE S256", async () => {
  const redis = memoryRedis();
  const service = new ExtensionAuthService({
    redis,
    sessionService: {
      async createSession(userId: string) {
        return {
          accessToken: `tok-${userId}`,
          expiresAt: "2099-01-01T00:00:00.000Z",
        };
      },
    },
    generateCode: () => "test-auth-code",
  });

  const verifier = "a".repeat(64);
  const challenge = sha256Base64Url(verifier);
  const redirectUri = "chrome-extension://abc123/auth-callback.html";

  const issued = await service.issueAuthCode({
    userId: "user-1",
    clientId: "okkey_extension",
    redirectUri,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });
  assert.equal(issued.code, "test-auth-code");

  const token = await service.exchangeAuthCode({
    clientId: "okkey_extension",
    redirectUri,
    code: issued.code,
    codeVerifier: verifier,
  });
  assert.equal(token.accessToken, "tok-user-1");
  assert.equal(token.userId, "user-1");
  assert.equal(token.tokenType, "Bearer");

  // One-time use
  await assert.rejects(
    () =>
      service.exchangeAuthCode({
        clientId: "okkey_extension",
        redirectUri,
        code: issued.code,
        codeVerifier: verifier,
      }),
    (err: unknown) => err instanceof Error && err.message.includes("invalid or expired"),
  );
});

test("rejects bad PKCE verifier", async () => {
  const redis = memoryRedis();
  const service = new ExtensionAuthService({
    redis,
    sessionService: {
      async createSession() {
        return { accessToken: "x", expiresAt: "2099-01-01T00:00:00.000Z" };
      },
    },
    generateCode: () => "code-2",
  });
  const redirectUri = "chrome-extension://abc123/auth-callback.html";
  const challenge = sha256Base64Url("b".repeat(64));
  await service.issueAuthCode({
    userId: "user-1",
    clientId: "okkey_extension",
    redirectUri,
    codeChallenge: challenge,
  });
  await assert.rejects(
    () =>
      service.exchangeAuthCode({
        clientId: "okkey_extension",
        redirectUri,
        code: "code-2",
        codeVerifier: "c".repeat(64),
      }),
    (err: unknown) => err instanceof Error && /PKCE/.test(err.message),
  );
});

test("exchange of a capped code does not mint a longer session", async () => {
  const redis = memoryRedis();
  const cap = new Date(Date.now() + 30_000).toISOString();
  let seenTtl: number | undefined;
  const service = new ExtensionAuthService({
    redis,
    sessionService: {
      async createSession(_userId: string, options?: { ttlSeconds?: number }) {
        seenTtl = options?.ttlSeconds;
        return {
          accessToken: "capped",
          expiresAt: cap,
          scope: null,
        };
      },
    },
    generateCode: () => "capped-code",
    now: () => new Date(),
  });
  const verifier = "b".repeat(64);
  const challenge = sha256Base64Url(verifier);
  const redirectUri = "chrome-extension://abc123/auth-callback.html";
  await service.issueAuthCode({
    userId: "user-1",
    clientId: "okkey_extension",
    redirectUri,
    codeChallenge: challenge,
    expiresAtCap: cap,
  });
  await service.exchangeAuthCode({
    clientId: "okkey_extension",
    redirectUri,
    code: "capped-code",
    codeVerifier: verifier,
  });
  assert.equal(typeof seenTtl, "number");
  assert.ok((seenTtl ?? 0) <= 30);
  assert.ok((seenTtl ?? 0) >= 1);
});
