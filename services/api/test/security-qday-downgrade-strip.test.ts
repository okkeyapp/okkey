import test from "node:test";
import assert from "node:assert/strict";
import { SyncService, SyncServiceError } from "../src/sync/service.ts";
import { CryptoDowngradeInvariantError } from "../src/storage/errors.ts";
import { testEntityId } from "./test-entity-id.ts";

const TEST_ITEM_ID = testEntityId();

function mkItemUpdateInput(
  encryptedBlob: unknown,
  baseVersion = 0,
): {
  eventType: "ITEM_UPDATE";
  encryptedBlob: unknown;
  baseVersion: number;
  referencedItemId: string;
} {
  return {
    eventType: "ITEM_UPDATE",
    encryptedBlob,
    baseVersion,
    referencedItemId: TEST_ITEM_ID,
  };
}

function mkBlob(payload: string, cryptoVersion = 2) {
  return {
    crypto_version: cryptoVersion,
    algorithm: "opaque",
    payload: Buffer.from(payload, "utf8").toString("base64"),
    meta: {},
  };
}

function createSyncService(
  appendImpl: (input: {
    payloadSchemaVersion: number;
  }) => Promise<unknown>,
  allowedCryptoProfileVersions: number[] = [2],
) {
  return new SyncService({
    vaults: {
      findById: async () => ({
        id: "v-security",
        workspaceId: "w-security",
        name: "Security Vault",
        isPersonal: false,
        ownerId: "u-owner",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      canReadVault: async () => true,
    },
    events: {
      listAfterVersion: async () => [],
      append: async (input) => {
        await appendImpl({ payloadSchemaVersion: input.payloadSchemaVersion });
        return {
          id: "e-security",
          vaultId: "v-security",
          actorId: "u-owner",
          eventType: input.eventType,
          encryptedPayload: input.encryptedPayload,
          payloadSchemaVersion: input.payloadSchemaVersion,
          idempotencyKey: input.idempotencyKey ?? null,
          clientCreatedAt: input.clientCreatedAt ?? null,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
        };
      },
    },
    config: {
      allowedCryptoProfileVersions,
      deployEnv: "prod",
    },
  });
}

test("security: rejects strip attack with removed crypto_version", async () => {
  const service = createSyncService(async () => {});
  const strippedBlob: unknown = {
    algorithm: "opaque",
    payload: Buffer.from("cipher", "utf8").toString("base64"),
    meta: {},
  };

  await assert.rejects(
    () => service.appendEvent("v-security", "u-owner", mkItemUpdateInput(strippedBlob)),
    (error: unknown) => error instanceof SyncServiceError && error.code === "SYNC_BAD_REQUEST",
  );
});

test("security: rejects legacy encryptedBlob string when legacy shape is disabled", async () => {
  const service = createSyncService(async () => {});

  await assert.rejects(
    () =>
      service.appendEvent(
        "v-security",
        "u-owner",
        mkItemUpdateInput(Buffer.from("legacy-cipher", "utf8").toString("base64")),
      ),
    (error: unknown) => error instanceof SyncServiceError && error.code === "SYNC_BAD_REQUEST",
  );
});

test("security: maps downgrade attempt to CRYPTO_DOWNGRADE_NOT_ALLOWED", async () => {
  const service = createSyncService(async () => {
    throw new CryptoDowngradeInvariantError("v-security", 2, 1);
  }, [1, 2]);

  await assert.rejects(
    () =>
      service.appendEvent("v-security", "u-owner", mkItemUpdateInput(mkBlob("downgrade-attempt", 1))),
    (error: unknown) =>
      error instanceof SyncServiceError &&
      error.code === "CRYPTO_DOWNGRADE_NOT_ALLOWED" &&
      Boolean(error.details && (error.details as { establishedMaxVersion?: number }).establishedMaxVersion === 2),
  );
});

test("security: rejects profile not allowed by production policy", async () => {
  const service = createSyncService(async () => {}, [2]);

  await assert.rejects(
    () =>
      service.appendEvent("v-security", "u-owner", mkItemUpdateInput(mkBlob("policy-violation", 1))),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "CRYPTO_PROFILE_NOT_ALLOWED",
  );
});
