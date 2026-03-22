import test from "node:test";
import assert from "node:assert/strict";
import type { AuthService } from "../src/auth/service.ts";
import type { ApiConfig } from "../src/config.ts";
import type { PostgresDatabase } from "../src/storage/postgres.ts";
import { RegistrationError, RegistrationService } from "../src/registration/service.ts";

const baseConfig: ApiConfig = {
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

function baseInput() {
  return {
    authStateId: "s1",
    userPublicKey: Buffer.alloc(32, 9).toString("base64"),
    encryptedPrivateKey: new Uint8Array(48).fill(1),
    serverKeyShare: new Uint8Array(32).fill(2),
    passwordKdfSalt: new Uint8Array(16).fill(3),
    passwordKdfParamsVersion: 1,
    deviceFingerprint: "b".repeat(64),
    deviceName: "d",
    devicePublicKey: Buffer.from("pk").toString("base64"),
    deviceShare: new Uint8Array(32).fill(4),
    platform: "p",
    osName: "o",
    osVersion: "v",
    appVersion: "1",
    clientType: "c",
    userAgent: "ua",
    requestIp: "127.0.0.1",
  };
}

function createService() {
  return new RegistrationService({
    authService: {
      readAuthState: async () => ({
        id: "s1",
        email: "new@okkey.local",
        userId: null,
        createdAt: new Date().toISOString(),
      }),
      removeAuthState: async () => {},
    } as unknown as AuthService,
    users: {
      findByEmail: async () => null,
    },
    postgres: {
      transaction: async () => {
        throw new Error("postgres should not be called");
      },
    } as unknown as PostgresDatabase,
    redis: {
      get: async () => null,
      setWithTtl: async () => {},
      del: async () => {},
    },
    config: baseConfig,
  });
}

test("completeRegistration rejects short server_key_share", async () => {
  const service = createService();
  const input = baseInput();
  input.serverKeyShare = new Uint8Array(31);
  await assert.rejects(
    () => service.completeRegistration(input),
    (err: unknown) =>
      err instanceof RegistrationError &&
      err.code === "CRYPTO_PAYLOAD_INVALID" &&
      err.statusCode === 400,
  );
});

test("completeRegistration rejects unsupported kdf version", async () => {
  const service = createService();
  const input = baseInput();
  input.passwordKdfParamsVersion = 99;
  await assert.rejects(
    () => service.completeRegistration(input),
    (err: unknown) =>
      err instanceof RegistrationError && err.code === "CRYPTO_PAYLOAD_INVALID",
  );
});

test("completeRegistration returns Redis registration:result without Postgres", async () => {
  const cached = {
    userId: "u-from-redis",
    workspaceId: "w-from-redis",
    vaultId: "v-from-redis",
    deviceId: "d-from-redis",
    deviceStatus: "trusted" as const,
  };
  const service = new RegistrationService({
    authService: {
      readAuthState: async () => {
        throw new Error("readAuthState must not run when registration result is cached");
      },
      removeAuthState: async () => {
        throw new Error("removeAuthState must not run when registration result is cached");
      },
    } as unknown as AuthService,
    users: {
      findByEmail: async () => {
        throw new Error("findByEmail must not run when registration result is cached");
      },
    },
    postgres: {
      transaction: async () => {
        throw new Error("postgres.transaction must not run when registration result is cached");
      },
    } as unknown as PostgresDatabase,
    redis: {
      get: async (key) => {
        assert.equal(key, "registration:result:s1");
        return JSON.stringify(cached);
      },
      setWithTtl: async () => {
        throw new Error("setWithTtl must not run on cache hit");
      },
      del: async () => {},
    },
    config: baseConfig,
  });

  const out = await service.completeRegistration(baseInput());
  assert.deepEqual(out, cached);
});
