import assert from "node:assert/strict";
import test from "node:test";
import { logCryptoPolicyViolation } from "../src/crypto/policy-log.ts";
import { SyncService, SyncServiceError } from "../src/sync/service.ts";
import { testEntityId } from "./test-entity-id.ts";

const TEST_ITEM_ID = testEntityId();

function mkBlob(payload = "x", cryptoVersion = 2) {
  return {
    crypto_version: cryptoVersion,
    algorithm: "opaque",
    payload: Buffer.from(payload).toString("base64"),
    meta: {},
  };
}

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

function createSyncServiceWithLogger(config: {
  cryptoRolloutState: "resume" | "stop";
  cryptoRolloutStopWritePaths: string[];
}) {
  const { logger, records } = createCaptureLogger();
  const service = new SyncService({
    vaults: {
      findById: async () => ({
        id: "v1",
        workspaceId: "w1",
        name: "Vault",
        isPersonal: false,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      canReadVault: async () => true,
    },
    events: {
      listAfterVersion: async () => [],
      append: async (input) => ({
        id: "e1",
        vaultId: input.vaultId,
        actorId: input.actorId ?? null,
        eventType: input.eventType,
        encryptedPayload: input.encryptedPayload,
        payloadSchemaVersion: input.payloadSchemaVersion,
        idempotencyKey: input.idempotencyKey ?? null,
        clientCreatedAt: input.clientCreatedAt ?? null,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    },
    config: {
      deployEnv: "dev",
      allowedCryptoProfileVersions: [2],
      cryptoRolloutMode: "compat",
      cryptoRolloutEnabled: true,
      cryptoRolloutState: config.cryptoRolloutState,
      cryptoRolloutStopWritePaths: config.cryptoRolloutStopWritePaths,
    },
    log: logger,
  });
  return { service, records };
}

test("logCryptoPolicyViolation emits policy metric and structured warning", () => {
  const { logger, records } = createCaptureLogger();
  logCryptoPolicyViolation(logger, {
    reason: "policy",
    deployEnv: "prod",
    requestedVersion: 1,
  });
  const metricRecord = records.find((record) => record.message === "crypto_metric");
  assert.ok(metricRecord);
  assert.equal(metricRecord?.extra?.metric_name, "crypto.policy_violations_total");

  const warningRecord = records.find((record) => record.message === "crypto_policy_violation");
  assert.ok(warningRecord);
  assert.equal(warningRecord?.extra?.event, "crypto_policy_violation");
});

test("sync append is blocked when rollout state is stop for path", async () => {
  const { service, records } = createSyncServiceWithLogger({
    cryptoRolloutState: "stop",
    cryptoRolloutStopWritePaths: ["sync.append"],
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "ITEM_UPDATE",
        encryptedBlob: mkBlob("x", 2),
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "CRYPTO_ROLLOUT_PAUSED",
  );

  const blockedOutcome = records.find(
    (record) =>
      record.message === "crypto_metric" &&
      record.extra?.metric_name === "crypto.operation_total" &&
      (record.extra?.tags as Record<string, unknown>)?.outcome === "blocked",
  );
  assert.ok(blockedOutcome);
});

test("stop/resume drill: sync write recovers after rollout resume", async () => {
  const blocked = createSyncServiceWithLogger({
    cryptoRolloutState: "stop",
    cryptoRolloutStopWritePaths: ["sync.append"],
  });
  await assert.rejects(
    () =>
      blocked.service.appendEvent("v1", "u1", {
        eventType: "ITEM_UPDATE",
        encryptedBlob: mkBlob("x", 2),
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) => error instanceof SyncServiceError && error.code === "CRYPTO_ROLLOUT_PAUSED",
  );

  const resumed = createSyncServiceWithLogger({
    cryptoRolloutState: "resume",
    cryptoRolloutStopWritePaths: ["sync.append"],
  });
  const result = await resumed.service.appendEvent("v1", "u1", {
    eventType: "ITEM_UPDATE",
    encryptedBlob: mkBlob("x", 2),
    baseVersion: 0,
    referencedItemId: TEST_ITEM_ID,
  });
  assert.equal(result.eventType, "ITEM_UPDATE");

  const successOutcome = resumed.records.find(
    (record) =>
      record.message === "crypto_metric" &&
      record.extra?.metric_name === "crypto.operation_total" &&
      (record.extra?.tags as Record<string, unknown>)?.outcome === "success",
  );
  assert.ok(successOutcome);
});
