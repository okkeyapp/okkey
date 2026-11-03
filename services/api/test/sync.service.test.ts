import test from "node:test";
import assert from "node:assert/strict";
import { SyncService, SyncServiceError } from "../src/sync/service.ts";
import { CryptoDowngradeInvariantError, VersionConflictError } from "../src/storage/errors.ts";
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

test("listEvents returns mapped events for readable vault", async () => {
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
      listAfterVersion: async () => [
        {
          id: "e1",
          vaultId: "v1",
          actorId: "u1",
          eventType: "ITEM_CREATE",
          encryptedPayload: new Uint8Array([1, 2, 3]),
          payloadSchemaVersion: 1,
          idempotencyKey: null,
          clientCreatedAt: null,
          referencedItemId: null,
          itemSoftDeleted: null,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
  });

  const events = await service.listEvents("v1", "u1", 0);
  assert.equal(events[0].referencedItemId, null);
  assert.equal(events.length, 1);
  assert.equal(events[0].encryptedPayload, Buffer.from([1, 2, 3]).toString("base64"));
});

test("appendEvent validates event type", async () => {
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
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "BAD_TYPE",
        encryptedBlob: mkBlob("x"),
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError &&
      error.code === "SYNC_INVALID_EVENT_TYPE",
  );
});

test("appendEvent maps version conflict", async () => {
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
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new VersionConflictError(1, 5);
      },
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "ITEM_UPDATE",
        encryptedBlob: mkBlob("x"),
        baseVersion: 1,
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError &&
      error.code === "VERSION_MISMATCH" &&
      error.details?.code === "VERSION_MISMATCH" &&
      error.details?.expectedBaseVersion === 1 &&
      error.details?.latestVersion === 5,
  );
});

test("appendEvent rejects FOLDER_CREATE on vault stream", async () => {
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
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "FOLDER_CREATE",
        encryptedBlob: mkBlob("x"),
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
        idempotencyKey: "1156820912149001",
      }),
    (error: unknown) =>
      error instanceof SyncServiceError &&
      error.code === "SYNC_INVALID_EVENT_TYPE",
  );
});

test("appendEvent requires idempotencyKey for ITEM_CREATE", async () => {
  const service = new SyncService({
    vaults: {
      findById: async () => ({
        id: "v1",
        workspaceId: "w1",
        name: "Vault",
        isPersonal: true,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      canReadVault: async () => true,
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => false,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "ITEM_CREATE",
        encryptedBlob: mkBlob("x"),
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError &&
      error.code === "SYNC_BAD_REQUEST",
  );
});

test("appendEvent rejects ITEM_CREATE in shared vault without sharedVaults plan", async () => {
  const service = new SyncService({
    vaults: {
      findById: async () => ({
        id: "v-shared",
        workspaceId: "w1",
        name: "Shared",
        isPersonal: false,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      canReadVault: async () => true,
    },
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "Workspace",
        ownerId: "u1",
        planTier: "FREE",
        planCustomOverride: false,
        planFeatureOverrides: {},
        createdAt: "",
        updatedAt: "",
      }),
    },
    config: {
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: false,
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => false,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v-shared", "u1", {
        eventType: "ITEM_CREATE",
        encryptedBlob: mkBlob("x"),
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
        idempotencyKey: "idem-1",
      }),
    (error: unknown) =>
      error instanceof SyncServiceError &&
      error.code === "PLAN_FEATURE_REQUIRED" &&
      error.statusCode === 403,
  );
});

test("appendEvent rejects ITEM_UPDATE when ITEM_CREATE is missing", async () => {
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
      hasItemCreateEvent: async () => false,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
      deleteByVaultAndReferencedItemId: async () => {},
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "ITEM_UPDATE",
        encryptedBlob: mkBlob("x"),
        baseVersion: 1,
        referencedItemId: TEST_ITEM_ID,
        itemSoftDeleted: false,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError &&
      error.code === "SYNC_ITEM_NOT_FOUND" &&
      error.statusCode === 404,
  );
});

test("appendEvent allows ITEM_UPDATE in shared vault without sharedVaults plan", async () => {
  const service = new SyncService({
    vaults: {
      findById: async () => ({
        id: "v-shared",
        workspaceId: "w1",
        name: "Shared",
        isPersonal: false,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      canReadVault: async () => true,
    },
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "Workspace",
        ownerId: "u1",
        planTier: "FREE",
        planCustomOverride: false,
        planFeatureOverrides: {},
        createdAt: "",
        updatedAt: "",
      }),
    },
    config: {
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: false,
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => ({
        id: "e1",
        vaultId: "v-shared",
        actorId: "u1",
        eventType: "ITEM_UPDATE",
        encryptedPayload: new Uint8Array([1]),
        payloadSchemaVersion: 1,
        idempotencyKey: null,
        clientCreatedAt: null,
        referencedItemId: null,
        itemSoftDeleted: null,
        version: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      deleteByVaultAndReferencedItemId: async () => {},
    },
  });

  const event = await service.appendEvent("v-shared", "u1", {
    eventType: "ITEM_UPDATE",
    encryptedBlob: mkBlob("x"),
    baseVersion: 1,
    referencedItemId: TEST_ITEM_ID,
  });
  assert.equal(event.eventType, "ITEM_UPDATE");
  assert.equal(event.version, 2);
});

test("appendEvent persists itemSoftDeleted=true for ITEM_DELETE", async () => {
  let capturedSoft: boolean | null | undefined;
  let softDeleteUpserts = 0;
  const service = new SyncService({
    vaults: {
      findById: async () => ({
        id: "v-shared",
        workspaceId: "w1",
        name: "Shared",
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
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async (input) => {
        capturedSoft = input.itemSoftDeleted ?? null;
        return {
          id: "e-del",
          vaultId: "v-shared",
          actorId: "u1",
          eventType: "ITEM_DELETE",
          encryptedPayload: input.encryptedPayload,
          payloadSchemaVersion: input.payloadSchemaVersion ?? 2,
          idempotencyKey: null,
          clientCreatedAt: null,
          referencedItemId: input.referencedItemId ?? null,
          itemSoftDeleted: input.itemSoftDeleted ?? null,
          version: 2,
          createdAt: "2026-01-01T00:00:00.000Z",
        };
      },
      deleteByVaultAndReferencedItemId: async () => 0,
    },
    softDeletes: {
      upsert: async () => {
        softDeleteUpserts += 1;
      },
      remove: async () => {},
    },
  });

  const event = await service.appendEvent("v-shared", "u1", {
    eventType: "ITEM_DELETE",
    encryptedBlob: mkBlob("x"),
    baseVersion: 1,
    referencedItemId: TEST_ITEM_ID,
  });
  assert.equal(capturedSoft, true);
  assert.equal(event.itemSoftDeleted, true);
  assert.equal(softDeleteUpserts, 1);
});

test("appendEvent persists itemSoftDeleted=true for soft-delete ITEM_UPDATE on shared vault", async () => {
  let capturedSoft: boolean | null | undefined;
  let softDeleteUpserts = 0;
  const service = new SyncService({
    vaults: {
      findById: async () => ({
        id: "v-shared",
        workspaceId: "w1",
        name: "Shared",
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
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async (input) => {
        capturedSoft = input.itemSoftDeleted ?? null;
        return {
          id: "e-soft",
          vaultId: "v-shared",
          actorId: "u1",
          eventType: "ITEM_UPDATE",
          encryptedPayload: input.encryptedPayload,
          payloadSchemaVersion: input.payloadSchemaVersion ?? 2,
          idempotencyKey: null,
          clientCreatedAt: null,
          referencedItemId: input.referencedItemId ?? null,
          itemSoftDeleted: input.itemSoftDeleted ?? null,
          version: 2,
          createdAt: "2026-01-01T00:00:00.000Z",
        };
      },
      deleteByVaultAndReferencedItemId: async () => 0,
    },
    softDeletes: {
      upsert: async () => {
        softDeleteUpserts += 1;
      },
      remove: async () => {},
    },
  });

  const event = await service.appendEvent("v-shared", "u1", {
    eventType: "ITEM_UPDATE",
    encryptedBlob: mkBlob("x"),
    baseVersion: 1,
    referencedItemId: TEST_ITEM_ID,
    itemSoftDeleted: true,
    itemDeletedAtMs: 1_700_000_000_000,
  });
  assert.equal(capturedSoft, true);
  assert.equal(event.itemSoftDeleted, true);
  assert.equal(softDeleteUpserts, 1);
});

test("appendEvent does not upsert softDeletes when idempotent row lacks soft-delete mark", async () => {
  let softDeleteUpserts = 0;
  const existing = {
    id: "e-old",
    vaultId: "v-shared",
    actorId: "u1",
    eventType: "ITEM_UPDATE",
    encryptedPayload: new Uint8Array([1]),
    payloadSchemaVersion: 2,
    idempotencyKey: testEntityId(),
    clientCreatedAt: null,
    referencedItemId: TEST_ITEM_ID,
    itemSoftDeleted: false,
    version: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const service = new SyncService({
    vaults: {
      findById: async () => ({
        id: "v-shared",
        workspaceId: "w1",
        name: "Shared",
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
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => existing,
      append: async () => existing,
      deleteByVaultAndReferencedItemId: async () => 0,
    },
    softDeletes: {
      upsert: async () => {
        softDeleteUpserts += 1;
      },
      remove: async () => {},
    },
  });

  // Request claims soft-delete, but idempotent append returns a prior non-soft row.
  await service.appendEvent("v-shared", "u1", {
    eventType: "ITEM_UPDATE",
    encryptedBlob: mkBlob("x"),
    baseVersion: 1,
    referencedItemId: TEST_ITEM_ID,
    itemSoftDeleted: true,
    itemDeletedAtMs: 1_700_000_000_000,
    idempotencyKey: existing.idempotencyKey!,
  });
  assert.equal(softDeleteUpserts, 0);
});

test("appendEvent persists itemSoftDeleted=false when omitted on ITEM_UPDATE", async () => {
  let capturedSoft: boolean | null | undefined;
  const service = new SyncService({
    vaults: {
      findById: async () => ({
        id: "v1",
        workspaceId: "w1",
        name: "Vault",
        isPersonal: true,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      canReadVault: async () => true,
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async (input) => {
        capturedSoft = input.itemSoftDeleted ?? null;
        return {
          id: "e1",
          vaultId: "v1",
          actorId: "u1",
          eventType: "ITEM_UPDATE",
          encryptedPayload: input.encryptedPayload,
          payloadSchemaVersion: input.payloadSchemaVersion ?? 2,
          idempotencyKey: null,
          clientCreatedAt: null,
          referencedItemId: input.referencedItemId ?? null,
          itemSoftDeleted: input.itemSoftDeleted ?? null,
          version: 2,
          createdAt: "2026-01-01T00:00:00.000Z",
        };
      },
      deleteByVaultAndReferencedItemId: async () => 0,
    },
  });

  const event = await service.appendEvent("v1", "u1", {
    eventType: "ITEM_UPDATE",
    encryptedBlob: mkBlob("x"),
    baseVersion: 1,
    referencedItemId: TEST_ITEM_ID,
  });
  assert.equal(capturedSoft, false);
  assert.equal(event.itemSoftDeleted, false);
});

test("appendEvent rejects oversized payload", async () => {
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
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
  });

  const big = Buffer.alloc(600 * 1024, 7).toString("base64");
  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "ITEM_UPDATE",
        encryptedBlob: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: big,
          meta: {},
        },
        baseVersion: 0,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "PAYLOAD_TOO_LARGE",
  );
});

test("appendEvent rejects strip attack: missing crypto_version in encryptedBlob", async () => {
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
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
  });

  const encryptedBlobMissing: unknown = {
    // attacker stripped `crypto_version`
    algorithm: "opaque",
    payload: Buffer.from("x").toString("base64"),
    meta: {},
  };

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "ITEM_UPDATE",
        encryptedBlob: encryptedBlobMissing,
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "SYNC_BAD_REQUEST",
  );
});

test("appendEvent rejects strip attack: legacy encryptedBlob string when legacy is disabled", async () => {
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
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "ITEM_UPDATE",
        encryptedBlob: Buffer.from("x").toString("base64"),
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "SYNC_BAD_REQUEST",
  );
});

test("listEvents returns VAULT_NOT_FOUND when vault does not exist", async () => {
  const service = new SyncService({
    vaults: {
      findById: async () => null,
      canReadVault: async () => true,
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
  });

  await assert.rejects(
    () => service.listEvents("v1", "u1", 0),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "VAULT_NOT_FOUND",
  );
});

test("listEvents returns ACCESS_DENIED when user cannot read vault", async () => {
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
      canReadVault: async () => false,
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
  });

  await assert.rejects(
    () => service.listEvents("v1", "u1", 0),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "ACCESS_DENIED",
  );
});

test("appendEvent returns VAULT_NOT_FOUND when vault does not exist", async () => {
  const service = new SyncService({
    vaults: {
      findById: async () => null,
      canReadVault: async () => true,
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "ITEM_UPDATE",
        encryptedBlob: mkBlob("x"),
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "VAULT_NOT_FOUND",
  );
});

test("appendEvent returns ACCESS_DENIED when user cannot read vault", async () => {
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
      canReadVault: async () => false,
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "ITEM_UPDATE",
        encryptedBlob: mkBlob("x"),
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "ACCESS_DENIED",
  );
});

test("appendEvent maps CryptoDowngradeInvariantError to CRYPTO_DOWNGRADE_NOT_ALLOWED", async () => {
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
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new CryptoDowngradeInvariantError("v1", 2, 1);
      },
    },
    config: {
      allowedCryptoProfileVersions: [1, 2],
      deployEnv: "dev",
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "ITEM_UPDATE",
        encryptedBlob: mkBlob("x", 1),
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError &&
      error.code === "CRYPTO_DOWNGRADE_NOT_ALLOWED" &&
      Boolean(error.details && (error.details as { reason?: string }).reason === "downgrade"),
  );
});

test("appendEvent rejects disallowed crypto profile by policy", async () => {
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
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
    config: {
      allowedCryptoProfileVersions: [2],
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "ITEM_UPDATE",
        encryptedBlob: mkBlob("x", 1),
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "CRYPTO_PROFILE_NOT_ALLOWED",
  );
});

test("appendEvent preserves encryptedBlob crypto_version", async () => {
  let capturedVersion = -1;
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
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async (input) => {
        capturedVersion = input.payloadSchemaVersion;
        return {
          id: "e1",
          vaultId: input.vaultId,
          actorId: input.actorId ?? null,
          eventType: input.eventType,
          encryptedPayload: input.encryptedPayload,
          payloadSchemaVersion: input.payloadSchemaVersion,
          idempotencyKey: input.idempotencyKey ?? null,
          clientCreatedAt: input.clientCreatedAt ?? null,
          referencedItemId: input.referencedItemId ?? null,
          itemSoftDeleted: null,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
        };
      },
    },
    config: {
      allowedCryptoProfileVersions: [2],
    },
  });

  await service.appendEvent("v1", "u1", {
    eventType: "ITEM_UPDATE",
    encryptedBlob: mkBlob("x", 2),
    baseVersion: 0,
    referencedItemId: TEST_ITEM_ID,
  });
  assert.equal(capturedVersion, 2);
});

test("appendEvent strict mode rejects actor without PQ capability", async () => {
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
    users: {
      findById: async () => ({
        id: "u1",
        email: "u1@okkey.local",
        publicKey: "pk",
        publicPqKey: null,
        locale: "en",
        createdAt: "",
        updatedAt: "",
      }),
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
    config: {
      allowedCryptoProfileVersions: [2],
      deployEnv: "dev",
      cryptoRolloutMode: "strict",
    },
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
      error instanceof SyncServiceError && error.code === "CRYPTO_CAPABILITY_REQUIRED",
  );
});

test("appendEvent compat mode allows actor without PQ capability", async () => {
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
    users: {
      findById: async () => ({
        id: "u1",
        email: "u1@okkey.local",
        publicKey: "pk",
        publicPqKey: null,
        locale: "en",
        createdAt: "",
        updatedAt: "",
      }),
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async (input) => ({
        id: "e1",
        vaultId: input.vaultId,
        actorId: input.actorId ?? null,
        eventType: input.eventType,
        encryptedPayload: input.encryptedPayload,
        payloadSchemaVersion: input.payloadSchemaVersion,
        idempotencyKey: input.idempotencyKey ?? null,
        clientCreatedAt: input.clientCreatedAt ?? null,
        referencedItemId: input.referencedItemId ?? null,
        itemSoftDeleted: null,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    },
    config: {
      allowedCryptoProfileVersions: [2],
      deployEnv: "dev",
      cryptoRolloutMode: "compat",
    },
  });

  const result = await service.appendEvent("v1", "u1", {
    eventType: "ITEM_UPDATE",
    encryptedBlob: mkBlob("x", 2),
    baseVersion: 0,
    referencedItemId: TEST_ITEM_ID,
  });
  assert.equal(result.eventType, "ITEM_UPDATE");
  assert.equal(result.referencedItemId, TEST_ITEM_ID);
});

test("appendEvent strict mode requires signature for VAULT_SHARE", async () => {
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
    users: {
      findById: async () => ({
        id: "u1",
        email: "u1@okkey.local",
        publicKey: "cHVibGljLWtleQ==",
        publicPqKey: "cHEta2V5",
        locale: "en",
        createdAt: "",
        updatedAt: "",
      }),
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
    config: {
      allowedCryptoProfileVersions: [2],
      deployEnv: "dev",
      cryptoRolloutMode: "strict",
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "VAULT_SHARE",
        encryptedBlob: mkBlob("x", 2),
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "SIGNATURE_REQUIRED",
  );
});

test("appendEvent rejects malformed signature envelope when provided", async () => {
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
    users: {
      findById: async () => ({
        id: "u1",
        email: "u1@okkey.local",
        publicKey: "cHVibGljLWtleQ==",
        publicPqKey: "cHEta2V5",
        locale: "en",
        createdAt: "",
        updatedAt: "",
      }),
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("not used");
      },
    },
    config: {
      allowedCryptoProfileVersions: [2],
      deployEnv: "dev",
      cryptoRolloutMode: "compat",
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "VAULT_SHARE",
        encryptedBlob: mkBlob("x", 2),
        signature: {
          version: 1,
          algorithm: "hybrid_ed25519_pq_bind_v1",
          key_id: "k1",
          context: "vault.rotate",
          signer_pq_public_key: "cHEta2V5",
          payload_hash: "aGFzaA==",
          signature: "c2ln",
          created_at: "2026-01-01T00:00:00.000Z",
        },
        baseVersion: 0,
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "SIGNATURE_INVALID",
  );
});

test("appendEvent rejects duplicate ITEM_CREATE for the same referencedItemId", async () => {
  const service = new SyncService({
    vaults: {
      findById: async () => ({
        id: "v1",
        workspaceId: "w1",
        name: "Vault",
        isPersonal: true,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      canReadVault: async () => true,
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async () => {
        throw new Error("append must not be called");
      },
    },
  });

  await assert.rejects(
    () =>
      service.appendEvent("v1", "u1", {
        eventType: "ITEM_CREATE",
        encryptedBlob: mkBlob("x"),
        baseVersion: 0,
        idempotencyKey: testEntityId(),
        referencedItemId: TEST_ITEM_ID,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError &&
      error.code === "SYNC_ITEM_ALREADY_EXISTS" &&
      error.statusCode === 409,
  );
});

test("appendEvent returns existing ITEM_CREATE on matching idempotency retry", async () => {
  const idempotencyKey = testEntityId();
  const existing = {
    id: "e1",
    vaultId: "v1",
    actorId: "u1",
    eventType: "ITEM_CREATE",
    encryptedPayload: new Uint8Array([1, 2, 3]),
    payloadSchemaVersion: 2,
    idempotencyKey,
    clientCreatedAt: null,
    referencedItemId: TEST_ITEM_ID,
    itemSoftDeleted: null,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const service = new SyncService({
    vaults: {
      findById: async () => ({
        id: "v1",
        workspaceId: "w1",
        name: "Vault",
        isPersonal: true,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      canReadVault: async () => true,
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => existing,
      append: async () => {
        throw new Error("append must not be called for idempotent retry");
      },
    },
  });

  const result = await service.appendEvent("v1", "u1", {
    eventType: "ITEM_CREATE",
    encryptedBlob: mkBlob("x"),
    baseVersion: 0,
    idempotencyKey,
    referencedItemId: TEST_ITEM_ID,
  });
  assert.equal(result.id, "e1");
  assert.equal(result.version, 1);
  assert.equal(result.referencedItemId, TEST_ITEM_ID);
});
