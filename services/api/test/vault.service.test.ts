import test from "node:test";
import assert from "node:assert/strict";
import { VaultService, VaultServiceError } from "../src/vault/service.ts";

function vaultsStub(overrides?: Record<string, unknown>) {
  return {
    listAccessibleByWorkspace: async () => [
      {
        id: "1000000000000000002",
        workspaceId: "1000000000000000001",
        name: "Personal",
        description: "",
        icon: "🏠",
        isPersonal: true,
        ownerId: "1000000000000000003",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      },
    ],
    listByWorkspace: async () => [
      {
        id: "1000000000000000002",
        workspaceId: "1000000000000000001",
        name: "Personal",
        description: "",
        icon: "🏠",
        isPersonal: true,
        ownerId: "1000000000000000003",
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
        id: "1000000000000000001",
        name: "Workspace",
        ownerId: "1000000000000000003",
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

  const result = await service.listWorkspaceVaults("1000000000000000001", "1000000000000000003");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "1000000000000000002");
});

test("listWorkspaceVaults hides other members personal vaults for workspace owner", async () => {
  const service = new VaultService({
    workspaces: {
      findById: async () => ({
        id: "1000000000000000001",
        name: "Workspace",
        ownerId: "1000000000000000003",
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
          id: "1000000000000000005",
          workspaceId: "1000000000000000001",
          name: "Личный сейф",
          description: "",
          icon: "🌟",
          isPersonal: true,
          ownerId: "1000000000000000003",
          cryptoVersion: 2,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "1000000000000000006",
          workspaceId: "1000000000000000001",
          name: "Personal",
          description: "",
          icon: "🏠",
          isPersonal: true,
          ownerId: "1000000000000000007",
          cryptoVersion: 2,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "1000000000000000004",
          workspaceId: "1000000000000000001",
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

  const result = await service.listWorkspaceVaults("1000000000000000001", "1000000000000000003");
  assert.deepEqual(
    result.map((vault) => vault.id),
    ["1000000000000000005", "1000000000000000004"],
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
    () => service.getVault("1999999999999999999", "1000000000000000003"),
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
        id: "1000000000000000002",
        workspaceId: "1000000000000000001",
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
    () => service.getVault("1000000000000000002", "1000000000000000003"),
    (error: unknown) =>
      error instanceof VaultServiceError && error.code === "ACCESS_DENIED",
  );
});

test("listAccessibleWorkspaces delegates to workspaces repository", async () => {
  const ws = {
    id: "1000000000000000001",
    name: "Personal",
    ownerId: "1000000000000000003",
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
      listAccessibleByUser: async (userId: string) => (userId === "1000000000000000003" ? [ws] : []),
    },
    vaults: vaultsStub(),
  });

  const result = await service.listAccessibleWorkspaces("1000000000000000003");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "1000000000000000001");
});


test("updateVault freezes shared vault metadata without sharedVaults plan", async () => {
  const service = new VaultService({
    config: {
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: false,
    },
    workspaces: {
      findById: async () => ({
        id: "1000000000000000001",
        name: "Workspace",
        ownerId: "1000000000000000003",
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
        id: "1000000000000000004",
        workspaceId: "1000000000000000001",
        name: "Shared",
        description: "",
        icon: "💜",
        isPersonal: false,
        ownerId: "1000000000000000003",
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
    () => service.updateVault("1000000000000000004", "1000000000000000003", { name: "Renamed" }),
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
        id: "1000000000000000001",
        name: "Workspace",
        ownerId: "1000000000000000003",
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
        id: "1000000000000000002",
        workspaceId: "1000000000000000001",
        name: "Personal",
        description: "",
        icon: "🏠",
        isPersonal: true,
        ownerId: "1000000000000000003",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      updateMetadata: async () => ({
        id: "1000000000000000002",
        workspaceId: "1000000000000000001",
        name: "Renamed",
        description: "",
        icon: "🏠",
        isPersonal: true,
        ownerId: "1000000000000000003",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
    }),
  });

  const updated = await service.updateVault("1000000000000000002", "1000000000000000003", { name: "Renamed" });
  assert.equal(updated.name, "Renamed");
});

test("deleteVault removes shared vault when actor can manage settings", async () => {
  let deletedId: string | null = null;
  const service = new VaultService({
    workspaces: {
      findById: async () => ({
        id: "1000000000000000001",
        name: "Workspace",
        ownerId: "1000000000000000003",
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
        id: "1000000000000000004",
        workspaceId: "1000000000000000001",
        name: "Shared",
        description: "",
        icon: "💜",
        isPersonal: false,
        ownerId: "1000000000000000003",
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

  await service.deleteVault("1000000000000000004", "1000000000000000003");
  assert.equal(deletedId, "1000000000000000004");
});

test("deleteVault rejects personal vault", async () => {
  const service = new VaultService({
    workspaces: {
      findById: async () => ({
        id: "1000000000000000001",
        name: "Workspace",
        ownerId: "1000000000000000003",
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
        id: "1000000000000000002",
        workspaceId: "1000000000000000001",
        name: "Personal",
        description: "",
        icon: "🏠",
        isPersonal: true,
        ownerId: "1000000000000000003",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
    }),
  });

  await assert.rejects(
    () => service.deleteVault("1000000000000000002", "1000000000000000003"),
    (error: unknown) =>
      error instanceof VaultServiceError && error.code === "VAULT_DELETE_FORBIDDEN",
  );
});
