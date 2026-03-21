import test from "node:test";
import assert from "node:assert/strict";
import { VaultService, VaultServiceError } from "../src/vault/service.ts";

test("listWorkspaceVaults returns vaults for accessible workspace", async () => {
  const service = new VaultService({
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "Workspace",
        ownerId: "u1",
        planTier: "FREE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
    },
    vaults: {
      listAccessibleByWorkspace: async () => [
        {
          id: "v1",
          workspaceId: "w1",
          name: "Personal",
          isPersonal: true,
          ownerId: "u1",
          createdAt: "",
          updatedAt: "",
        },
      ],
      findById: async () => null,
      canReadVault: async () => false,
    },
  });

  const result = await service.listWorkspaceVaults("w1", "u1");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "v1");
});

test("getVault returns 404 when vault missing", async () => {
  const service = new VaultService({
    workspaces: {
      findById: async () => null,
      hasAccess: async () => false,
    },
    vaults: {
      findById: async () => null,
      canReadVault: async () => false,
      listAccessibleByWorkspace: async () => [],
    },
  });

  await assert.rejects(
    () => service.getVault("missing", "u1"),
    (error: unknown) =>
      error instanceof VaultServiceError && error.code === "VAULT_NOT_FOUND",
  );
});

test("getVault returns 403 when user has no access", async () => {
  const service = new VaultService({
    workspaces: {
      findById: async () => null,
      hasAccess: async () => false,
    },
    vaults: {
      findById: async () => ({
        id: "v1",
        workspaceId: "w1",
        name: "Shared",
        isPersonal: false,
        ownerId: null,
        createdAt: "",
        updatedAt: "",
      }),
      canReadVault: async () => false,
      listAccessibleByWorkspace: async () => [],
    },
  });

  await assert.rejects(
    () => service.getVault("v1", "u1"),
    (error: unknown) =>
      error instanceof VaultServiceError && error.code === "ACCESS_DENIED",
  );
});
