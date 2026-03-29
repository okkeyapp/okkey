import assert from "node:assert/strict";
import test from "node:test";
import { CapsuleService, CapsuleServiceError } from "../src/capsule/service.ts";
import { RegistrationError, RegistrationService } from "../src/registration/service.ts";
import { VaultSharingService, VaultSharingServiceError } from "../src/vault-sharing/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

function createCaptureLogger() {
  const records: Array<{ level: "info" | "warn" | "error"; message: string; extra?: Record<string, unknown> }> =
    [];
  return {
    logger: {
      info(message: string, extra?: Record<string, unknown>) {
        records.push({ level: "info", message, extra });
      },
      warn(message: string, extra?: Record<string, unknown>) {
        records.push({ level: "warn", message, extra });
      },
      error(message: string, extra?: Record<string, unknown>) {
        records.push({ level: "error", message, extra });
      },
    },
    records,
  };
}

function findBlockedOutcomeMetric(
  records: Array<{ message: string; extra?: Record<string, unknown> }>,
  operation: string,
): boolean {
  return records.some((record) => {
    if (record.message !== "crypto_metric") {
      return false;
    }
    if (record.extra?.metric_name !== "crypto.operation_total") {
      return false;
    }
    const tags = record.extra?.tags as Record<string, unknown> | undefined;
    return (
      tags?.operation === operation &&
      tags?.outcome === "blocked" &&
      tags?.code === "CRYPTO_ROLLOUT_PAUSED"
    );
  });
}

test("registration gate blocks write path and emits blocked metric", async () => {
  const { logger, records } = createCaptureLogger();
  const service = new RegistrationService({
    authService: {
      readAuthState: async () => null,
      removeAuthState: async () => {},
    } as never,
    users: {
      findByEmail: async () => null,
    },
    postgres: {
      transaction: async () => {
        throw new Error("postgres should not be called");
      },
    } as never,
    redis: {
      get: async () => null,
      setWithTtl: async () => {},
      del: async () => 0,
    },
    config: createTestApiConfig({
      cryptoRolloutEnabled: true,
      cryptoRolloutState: "stop",
      cryptoRolloutStopWritePaths: ["registration.complete"],
    }),
    log: logger,
  });

  await assert.rejects(
    () =>
      service.completeRegistration({
        authStateId: "s1",
        userPublicKey: Buffer.alloc(32, 9).toString("base64"),
        userPublicPqKey: Buffer.alloc(1184, 7).toString("base64"),
        encryptedPrivateKey: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: Buffer.from(new Uint8Array(2473).fill(1)).toString("base64"),
          meta: {},
        },
        serverKeyShare: new Uint8Array(32).fill(2),
        passwordKdfSalt: new Uint8Array(16).fill(3),
        passwordKdfParamsVersion: 2,
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
      }),
    (error: unknown) =>
      error instanceof RegistrationError && error.code === "CRYPTO_ROLLOUT_PAUSED",
  );

  assert.equal(findBlockedOutcomeMetric(records, "registration.complete"), true);
});

test("capsule gate blocks create path and emits blocked metric", async () => {
  const { logger, records } = createCaptureLogger();
  const service = new CapsuleService({
    db: {
      transaction: async () => {
        throw new Error("db should not be called");
      },
      query: async () => {
        throw new Error("db should not be called");
      },
    },
    redis: {
      incr: async () => 1,
      expire: async () => true,
    },
    objectStorage: {
      putObject: async () => {},
      getObject: async () => null,
    },
    config: createTestApiConfig({
      cryptoRolloutEnabled: true,
      cryptoRolloutState: "stop",
      cryptoRolloutStopWritePaths: ["capsule.create"],
    }),
    log: logger,
  });

  await assert.rejects(
    () =>
      service.createCapsule("w1", "u1", {
        type: "item",
        encryptedPayload: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: Buffer.from("cipher").toString("base64"),
          meta: {},
        },
      }),
    (error: unknown) =>
      error instanceof CapsuleServiceError && error.code === "CRYPTO_ROLLOUT_PAUSED",
  );

  assert.equal(findBlockedOutcomeMetric(records, "capsule.create"), true);
});

test("vault share gate blocks write path and emits blocked metric", async () => {
  const { logger, records } = createCaptureLogger();
  const service = new VaultSharingService({
    db: {
      query: async () => {
        throw new Error("db should not be called");
      },
      transaction: async () => {
        throw new Error("db should not be called");
      },
    },
    vaults: {
      findById: async () => null,
      canReadVault: async () => false,
    },
    config: {
      allowedCryptoProfileVersions: [2],
      deployEnv: "dev",
      cryptoRolloutMode: "compat",
      cryptoRolloutEnabled: true,
      cryptoRolloutState: "stop",
      cryptoRolloutStopWritePaths: ["vault.share"],
    },
    log: logger,
  });

  await assert.rejects(
    () =>
      service.shareVault("v1", "u1", {
        recipientUserId: "00000000-0000-0000-0000-000000000001",
        encryptedVaultKey: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: Buffer.from("k").toString("base64"),
          meta: {},
        },
        encryptedPayload: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: Buffer.from("p").toString("base64"),
          meta: {},
        },
        baseVersion: 0,
      }),
    (error: unknown) =>
      error instanceof VaultSharingServiceError && error.code === "CRYPTO_ROLLOUT_PAUSED",
  );

  assert.equal(findBlockedOutcomeMetric(records, "vault.share"), true);
});
