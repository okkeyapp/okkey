import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync } from "@okkey/crypto-wasm";

import { AuthService } from "../src/auth/service.ts";
import { createLoginVerifier, loginVerifierMatches } from "../src/crypto/login-verifier.ts";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { TwoFactorService } from "../src/two-factor/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const cryptoDist = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/crypto/dist");
initSync(readFileSync(join(cryptoDist, "okkey_crypto_engine_bg.wasm")));

const { deriveLoginKey } = await import("../../../packages/crypto/dist/index.js");

class InMemoryRedis {
  private readonly values = new Map<string, string>();
  private readonly counters = new Map<string, number>();

  async setWithTtl(key: string, value: string, _ttlSeconds: number): Promise<void> {
    this.values.set(key, value);
  }

  async setIfNotExistsWithTtl(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.values.has(key)) {
      return false;
    }
    await this.setWithTtl(key, value, ttlSeconds);
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async expire(_key: string, _seconds: number): Promise<boolean> {
    return true;
  }
}

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

const password = new TextEncoder().encode("horse-battery-staple-login");
const email = "ada@example.com";

function loggerStub() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

async function setup(
  overrides?: Partial<ApiConfig>,
  resolveOutboundEmailDeliverable?: () => Promise<boolean>,
) {
  const loginKey = await deriveLoginKey({ masterPasswordUtf8: password, email });
  const material = createLoginVerifier(loginKey);
  assert.notDeepEqual(Buffer.from(material.verifier), Buffer.from(loginKey));
  assert.equal(loginVerifierMatches(loginKey, material.salt, material.verifier), true);

  const redis = new InMemoryRedis();
  let twoFactor = false;
  const users = {
    findByEmail: async () => null,
    isTwoFactorEnabled: async () => twoFactor,
    hasAnyUsers: async () => true,
    findLoginVerifierByEmail: async (lookup: string) => {
      if (lookup !== email) {
        return null;
      }
      return {
        userId: "user-1",
        verifier: material.verifier,
        salt: material.salt,
      };
    },
  };
  const config = createTestApiConfig({
    authRateLimitLoginKeyPerEmail: 3,
    authRateLimitLoginKeyPerIp: 20,
    ...overrides,
  });
  const authService = new AuthService({
    redis,
    users,
    emailTemplates: { sendAuthEmailCode: async () => {} },
    config,
    generateAuthStateId: () => "auth-state-login",
    resolveOutboundEmailDeliverable,
  });
  return { authService, loginKey, config, redis, setTwoFactor: (value: boolean) => { twoFactor = value; } };
}

test("login key proof returns device_check and does not include the master password", async () => {
  const { authService, loginKey } = await setup();
  const result = await authService.loginWithMasterPasswordProof({
    email: "Ada@Example.com",
    loginKey,
    requestIp: "203.0.113.10",
  });
  assert.equal(result.nextStep, "device_check");
  assert.equal(result.userExists, true);
  assert.equal(result.authStateId, "auth-state-login");
  assert.equal("accessToken" in result, false);
  const serialized = JSON.stringify({ email, loginKey: Buffer.from(loginKey).toString("base64") });
  assert.equal(serialized.includes(new TextDecoder().decode(password)), false);
});

test("wrong login key and unknown account share one error", async () => {
  const { authService, loginKey } = await setup();
  const wrong = new Uint8Array(loginKey);
  wrong[0] ^= 0xff;
  const wrongResult = await authService.loginWithMasterPasswordProof({
    email,
    loginKey: wrong,
    requestIp: "203.0.113.11",
  }).then(
    () => null,
    (error: { code?: string; message?: string; statusCode?: number }) => error,
  );
  const unknown = await authService.loginWithMasterPasswordProof({
    email: "missing@example.com",
    loginKey,
    requestIp: "203.0.113.12",
  }).then(
    () => null,
    (error: { code?: string; message?: string; statusCode?: number }) => error,
  );
  assert.equal(wrongResult?.code, "AUTH_LOGIN_FAILED");
  assert.equal(unknown?.code, "AUTH_LOGIN_FAILED");
  assert.equal(wrongResult?.statusCode, 401);
  assert.equal(unknown?.message, wrongResult?.message);
});

test("login key proof is rate limited per account", async () => {
  const { authService, loginKey } = await setup({ authRateLimitLoginKeyPerEmail: 2 });
  const wrong = new Uint8Array(32).fill(9);
  for (let i = 0; i < 2; i++) {
    await assert.rejects(
      () =>
        authService.loginWithMasterPasswordProof({
          email,
          loginKey: wrong,
          requestIp: `203.0.113.${20 + i}`,
        }),
      (error: { code?: string }) => error.code === "AUTH_LOGIN_FAILED",
    );
  }
  await assert.rejects(
    () =>
      authService.loginWithMasterPasswordProof({
        email,
        loginKey,
        requestIp: "203.0.113.30",
      }),
    (error: { code?: string; statusCode?: number }) =>
      error.code === "AUTH_RATE_LIMITED" && error.statusCode === 429,
  );
});

test("deliverable email and SaaS still require the emailed code", async () => {
  const deliverable = await setup({
    emailProvider: "smtp",
    smtpHost: "smtp.example.com",
  });
  await assert.rejects(
    () =>
      deliverable.authService.loginWithMasterPasswordProof({
        email,
        loginKey: deliverable.loginKey,
        requestIp: "203.0.113.40",
      }),
    (error: { code?: string; statusCode?: number }) =>
      error.code === "AUTH_EMAIL_CODE_REQUIRED" && error.statusCode === 403,
  );
  const started = await deliverable.authService.startEmailLogin({
    email,
    requestIp: "203.0.113.41",
  });
  assert.equal(started.emailDeliverable, true);
  assert.ok(started.challengeId);

  const saas = await setup({ deploymentMode: "saas", emailProvider: "logger" });
  assert.equal(
    (await saas.authService.startEmailLogin({ email: "new@example.com", requestIp: "203.0.113.42" }))
      .emailDeliverable,
    true,
  );
  await assert.rejects(
    () =>
      saas.authService.loginWithMasterPasswordProof({
        email,
        loginKey: saas.loginKey,
        requestIp: "203.0.113.43",
      }),
    (error: { code?: string }) => error.code === "AUTH_EMAIL_CODE_REQUIRED",
  );
});

test("TOTP stays required and bootstrap is refused until it is verified", async () => {
  const harness = await setup();
  harness.setTwoFactor(true);
  const result = await harness.authService.loginWithMasterPasswordProof({
    email,
    loginKey: harness.loginKey,
    requestIp: "203.0.113.50",
  });
  assert.equal(result.nextStep, "two_factor");
  const twoFactor = new TwoFactorService({
    redis: harness.redis,
    twoFactorRepo: { getEncryptedTotpSecret: async () => null },
    users: { isTwoFactorEnabled: async () => true },
    authService: harness.authService,
    sessionService: { createSession: async () => { throw new Error("session must not be created"); } },
    config: harness.config,
    emailTemplates: { sendAuthEmailCode: async () => {} },
  } as unknown as ConstructorParameters<typeof TwoFactorService>[0]);
  await assert.rejects(
    () => twoFactor.bootstrapSessionAfterEmail({ authStateId: result.authStateId }),
    (error: { code?: string }) => error.code === "TWO_FACTOR_REQUIRED",
  );
});

test("POST /auth/login/master-password accepts only the login key", async () => {
  const harness = await setup();
  const seen: Array<Record<string, unknown>> = [];
  const original = harness.authService.loginWithMasterPasswordProof.bind(harness.authService);
  harness.authService.loginWithMasterPasswordProof = async (input) => {
    seen.push({ ...input, loginKey: Buffer.from(input.loginKey).toString("base64") });
    return original(input);
  };
  const app = createApiApp(harness.config, loggerStub(), { authService: harness.authService });
  const masterPassword = "horse-battery-staple-login";
  const req = {
    method: "POST",
    url: "/auth/login/master-password",
    headers: {},
    body: {
      email,
      loginKey: Buffer.from(harness.loginKey).toString("base64"),
      masterPassword,
    },
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { nextStep?: string; access_token?: string };
  assert.equal(payload.nextStep, "device_check");
  assert.equal(payload.access_token, undefined);
  assert.equal(seen.length, 1);
  assert.deepEqual(Object.keys(seen[0]).sort(), ["email", "loginKey", "requestIp"]);
  assert.equal(JSON.stringify(seen[0]).includes(masterPassword), false);
  assert.notEqual(seen[0].loginKey, Buffer.from(password).toString("base64"));
});

test("saved SMTP reports emailDeliverable true when EMAIL_PROVIDER is logger", async () => {
  const harness = await setup({ emailProvider: "logger" }, async () => true);
  const started = await harness.authService.startEmailLogin({
    email: "second@example.com",
    requestIp: "203.0.113.70",
  });
  assert.equal(started.emailDeliverable, true);
  await assert.rejects(
    () =>
      harness.authService.loginWithMasterPasswordProof({
        email,
        loginKey: harness.loginKey,
        requestIp: "203.0.113.71",
      }),
    (error: { code?: string; statusCode?: number }) =>
      error.code === "AUTH_EMAIL_CODE_REQUIRED" && error.statusCode === 403,
  );
});

test("self-host without deliverable mail reports emailDeliverable false", async () => {
  const { authService } = await setup({ emailProvider: "logger" }, async () => false);
  const started = await authService.startEmailLogin({
    email: "second@example.com",
    requestIp: "203.0.113.60",
  });
  assert.equal(started.emailDeliverable, false);
  assert.ok(started.challengeId);
});
