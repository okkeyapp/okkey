import test from "node:test";
import assert from "node:assert/strict";
import { SyncService, SyncServiceError } from "../src/sync/service.ts";
import { VersionConflictError } from "../src/storage/errors.ts";

test("listEvents returns mapped events for readable vault", async () => {
  const service = new SyncService({
    vaults: {
      findById: async () => ({
        id: "v1",
        workspaceId: "w1",
        name: "Vault",
        isPersonal: false,
        ownerId: "u1",
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
        encryptedPayload: Buffer.from("x").toString("base64"),
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
        encryptedPayload: Buffer.from("x").toString("base64"),
        baseVersion: 1,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError &&
      error.code === "VERSION_MISMATCH",
  );
});
