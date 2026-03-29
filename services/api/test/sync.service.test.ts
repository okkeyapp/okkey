import test from "node:test";
import assert from "node:assert/strict";
import { SyncService, SyncServiceError } from "../src/sync/service.ts";
import { CryptoDowngradeInvariantError, VersionConflictError } from "../src/storage/errors.ts";

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
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      append: async () => {
        throw new Error("not used");
      },
    },
  });

  const events = await service.listEvents("v1", "u1", 0);
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
      }),
    (error: unknown) =>
      error instanceof SyncServiceError &&
      error.code === "VERSION_MISMATCH",
  );
});

test("appendEvent requires idempotencyKey for FOLDER_CREATE", async () => {
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
      }),
    (error: unknown) =>
      error instanceof SyncServiceError &&
      error.code === "SYNC_BAD_REQUEST",
  );
});

test("appendEvent requires idempotencyKey for ITEM_CREATE", async () => {
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
      }),
    (error: unknown) =>
      error instanceof SyncServiceError &&
      error.code === "SYNC_BAD_REQUEST",
  );
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
      allowedCryptoProfileVersions: [2],
      deployEnv: "dev",
      cryptoRolloutMode: "compat",
    },
  });

  const result = await service.appendEvent("v1", "u1", {
    eventType: "ITEM_UPDATE",
    encryptedBlob: mkBlob("x", 2),
    baseVersion: 0,
  });
  assert.equal(result.eventType, "ITEM_UPDATE");
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
      }),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "SIGNATURE_INVALID",
  );
});
