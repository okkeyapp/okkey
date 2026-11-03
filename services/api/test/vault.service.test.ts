import test from "node:test";
import assert from "node:assert/strict";
import { VaultService, VaultServiceError } from "../src/vault/service.ts";

function vaultsStub(overrides?: Record<string, unknown>) {
  return {
    listAccessibleByWorkspace: async () => [
      {
        id: "v1",
        workspaceId: "w1",
        name: "Personal",
        description: "",
        icon: "🏠",
        isPersonal: true,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      },
    ],
    listByWorkspace: async () => [
      {
        id: "v1",
        workspaceId: "w1",
        name: "Personal",
        description: "",
        icon: "🏠",
        isPersonal: true,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      },
    ],
    findById: async () => null,
    canReadVault: async () => false,
    canManageVaultSettings: async () => false,
    updateMetadata: async () => null,
    deleteById: async () => false,
    ...overrides,
  };
}

test("listWorkspaceVaults returns vaults for accessible workspace", async () => {
  const service = new VaultService({
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
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    vaults: vaultsStub(),
  });

  const result = await service.listWorkspaceVaults("w1", "u1");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "v1");
});

test("listWorkspaceVaults hides other members personal vaults for workspace owner", async () => {
  const service = new VaultService({
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "Workspace",
        ownerId: "u1",
        planTier: "ENTERPRISE",
        planCustomOverride: false,
        planFeatureOverrides: {},
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    vaults: vaultsStub({
      listByWorkspace: async () => [
        {
          id: "v-own",
          workspaceId: "w1",
          name: "Личный сейф",
          description: "",
          icon: "🌟",
          isPersonal: true,
          ownerId: "u1",
          cryptoVersion: 2,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "v-other",
          workspaceId: "w1",
          name: "Personal",
          description: "",
          icon: "🏠",
          isPersonal: true,
          ownerId: "u2",
          cryptoVersion: 2,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "v-shared",
          workspaceId: "w1",
          name: "Новый сейф",
          description: "",
          icon: "💜",
          isPersonal: false,
          ownerId: null,
          cryptoVersion: 2,
          createdAt: "",
          updatedAt: "",
        },
      ],
    }),
  });

  const result = await service.listWorkspaceVaults("w1", "u1");
  assert.deepEqual(
    result.map((vault) => vault.id),
    ["v-own", "v-shared"],
  );
});

test("getVault returns 404 when vault missing", async () => {
  const service = new VaultService({
    workspaces: {
      findById: async () => null,
      hasAccess: async () => false,
      listAccessibleByUser: async () => [],
    },
    vaults: vaultsStub(),
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
      listAccessibleByUser: async () => [],
    },
    vaults: vaultsStub({
      findById: async () => ({
        id: "v1",
        workspaceId: "w1",
        name: "Shared",
        description: "",
        icon: "💼",
        isPersonal: false,
        ownerId: null,
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      canReadVault: async () => false,
    }),
  });

  await assert.rejects(
    () => service.getVault("v1", "u1"),
    (error: unknown) =>
      error instanceof VaultServiceError && error.code === "ACCESS_DENIED",
  );
});

test("listAccessibleWorkspaces delegates to workspaces repository", async () => {
  const ws = {
    id: "w1",
    name: "Personal",
    ownerId: "u1",
    planTier: "FREE",
    planCustomOverride: false,
    planFeatureOverrides: {},
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  };
  const service = new VaultService({
    workspaces: {
      findById: async () => null,
      hasAccess: async () => false,
      listAccessibleByUser: async (userId: string) => (userId === "u1" ? [ws] : []),
    },
    vaults: vaultsStub(),
  });

  const result = await service.listAccessibleWorkspaces("u1");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "w1");
});


test("updateVault freezes shared vault metadata without sharedVaults plan", async () => {
  const service = new VaultService({
    config: {
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: false,
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
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    vaults: vaultsStub({
      findById: async () => ({
        id: "v-shared",
        workspaceId: "w1",
        name: "Shared",
        description: "",
        icon: "💜",
        isPersonal: false,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      canManageVaultSettings: async () => true,
      updateMetadata: async () => {
        throw new Error("should not update");
      },
    }),
  });

  await assert.rejects(
    () => service.updateVault("v-shared", "u1", { name: "Renamed" }),
    (error: unknown) =>
      error instanceof VaultServiceError &&
      error.code === "PLAN_FEATURE_REQUIRED" &&
      error.statusCode === 403,
  );
});

test("updateVault allows personal vault metadata without sharedVaults plan", async () => {
  const service = new VaultService({
    config: {
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: false,
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
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    vaults: vaultsStub({
      findById: async () => ({
        id: "v1",
        workspaceId: "w1",
        name: "Personal",
        description: "",
        icon: "🏠",
        isPersonal: true,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      updateMetadata: async () => ({
        id: "v1",
        workspaceId: "w1",
        name: "Renamed",
        description: "",
        icon: "🏠",
        isPersonal: true,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
    }),
  });

  const updated = await service.updateVault("v1", "u1", { name: "Renamed" });
  assert.equal(updated.name, "Renamed");
});

test("deleteVault removes shared vault when actor can manage settings", async () => {
  let deletedId: string | null = null;
  const service = new VaultService({
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
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    vaults: vaultsStub({
      findById: async () => ({
        id: "v-shared",
        workspaceId: "w1",
        name: "Shared",
        description: "",
        icon: "💜",
        isPersonal: false,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      canManageVaultSettings: async () => true,
      deleteById: async (id: string) => {
        deletedId = id;
        return true;
      },
    }),
  });

  await service.deleteVault("v-shared", "u1");
  assert.equal(deletedId, "v-shared");
});

test("deleteVault rejects personal vault", async () => {
  const service = new VaultService({
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
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    vaults: vaultsStub({
      findById: async () => ({
        id: "v1",
        workspaceId: "w1",
        name: "Personal",
        description: "",
        icon: "🏠",
        isPersonal: true,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
    }),
  });

  await assert.rejects(
    () => service.deleteVault("v1", "u1"),
    (error: unknown) =>
      error instanceof VaultServiceError && error.code === "VAULT_DELETE_FORBIDDEN",
  );
});
