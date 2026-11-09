/**
 * Workspace rights: a non-owner without members.post cannot invite, and
 * vaults.get = own hides other people's shared vaults.
 * Docs: docs/api/workspace-roles.md (permission levels) and
 * docs/architecture/04_feature_gating.md (shared vaults / members).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WorkspaceMembersService,
  WorkspaceMembersServiceError,
} from "../src/workspace-members/service.ts";
import {
  WorkspaceSharedVaultsService,
  WorkspaceSharedVaultsServiceError,
} from "../src/workspace-shared-vaults/service.ts";
import { entitlementConfig } from "./entitlement-config.ts";

const ownerId = "1000000000000000001";
const memberId = "1000000000000000008";
const roleId = "1000000000000000002";
const workspaceId = "1000000000000000100";

const cell = { get: 0, post: 0, put: 0, delete: 0 };

function matrix(overrides: Record<string, { get: number; post: number; put: number; delete: number }>) {
  return {
    settings: cell,
    settings_items: cell,
    settings_capsules: cell,
    roles: cell,
    profiles: cell,
    members: cell,
    vaults: cell,
    billing: cell,
    ...overrides,
  };
}

test("createInvitations denies a non-owner whose role has members.post = 0", async () => {
  let inserts = 0;
  const service = new WorkspaceMembersService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: ownerId }];
        }
        if (sql.includes("permissions_json")) {
          return [{ permissions_json: matrix({ members: { get: 1, post: 0, put: 0, delete: 0 } }) }];
        }
        if (sql.includes("INSERT INTO workspace_invitations")) {
          inserts += 1;
        }
        return [];
      },
    } as never,
    workspaces: {
      findById: async () => ({
        id: workspaceId,
        name: "WS",
        ownerId,
        planTier: "ENTERPRISE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
    },
    vaultService: {
      getVaultAccess: async () => ({ members: [], invitations: [] }),
      updateVaultAccess: async () => {},
    },
    publicAppBaseUrl: "http://localhost:5173",
    emailTemplates: { sendWorkspaceInvite: async () => {} },
    config: entitlementConfig(),
  });

  await assert.rejects(
    () =>
      service.createInvitations(workspaceId, memberId, [
        { email: "new@example.com", roleId },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "ACCESS_DENIED");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
  assert.equal(inserts, 0);
});

test("createSharedVault denies a non-owner whose role has vaults.post = 0", async () => {
  const service = new WorkspaceSharedVaultsService({
    vaults: {
      findById: async () => null,
      listAccessibleByWorkspace: async () => [],
      listByWorkspace: async () => [],
      canReadVault: async () => false,
      canManageVaultSettings: async () => false,
      create: async () => {
        throw new Error("not used");
      },
      updateMetadata: async () => null,
      deleteById: async () => false,
    },
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "WS",
        ownerId,
        planTier: "ENTERPRISE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    db: {
      query: async (sql: string) => {
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: ownerId }];
        }
        if (sql.includes("permissions_json")) {
          return [{
            permissions_json: matrix({
              vaults: { get: 1, post: 0, put: 0, delete: 0 },
            }),
          }];
        }
        return [];
      },
    },
    config: entitlementConfig(),
  });

  await assert.rejects(
    () =>
      service.createSharedVault("w1", memberId, {
        name: "Shared",
        encryptedPayload: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: "YQ==",
          meta: {},
        },
        members: [],
      }),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceSharedVaultsServiceError);
      assert.equal(error.code, "ACCESS_DENIED");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
});

test("listWorkspaceVaults with vaults.get = own hides shared vaults owned by someone else", async () => {
  const own = {
    id: "v-own",
    workspaceId: "w1",
    name: "Mine",
    description: "",
    icon: "",
    isPersonal: false,
    ownerId: memberId,
    cryptoVersion: 2,
    createdAt: "",
    updatedAt: "",
  };
  const foreign = {
    ...own,
    id: "v-foreign",
    name: "Theirs",
    ownerId,
  };
  const service = new WorkspaceSharedVaultsService({
    vaults: {
      findById: async () => null,
      listAccessibleByWorkspace: async () => [],
      listByWorkspace: async () => [own, foreign],
      canReadVault: async () => false,
      canManageVaultSettings: async () => false,
      create: async () => {
        throw new Error("not used");
      },
      updateMetadata: async () => null,
      deleteById: async () => false,
    },
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "WS",
        ownerId,
        planTier: "ENTERPRISE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    db: {
      query: async (sql: string) => {
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: ownerId }];
        }
        if (sql.includes("permissions_json")) {
          return [{
            permissions_json: matrix({
              vaults: { get: 2, post: 0, put: 0, delete: 0 },
            }),
          }];
        }
        return [];
      },
    },
    config: entitlementConfig(),
  });

  const listed = await service.listWorkspaceVaults("w1", memberId);
  assert.deepEqual(listed.map((vault) => vault.id), ["v-own"]);
});

test("listWorkspaceVaults denies vaults.get = 0 before returning any vault", async () => {
  const service = new WorkspaceSharedVaultsService({
    vaults: {
      findById: async () => null,
      listAccessibleByWorkspace: async () => [],
      listByWorkspace: async () => {
        throw new Error("should not list");
      },
      canReadVault: async () => false,
      canManageVaultSettings: async () => false,
      create: async () => {
        throw new Error("not used");
      },
      updateMetadata: async () => null,
      deleteById: async () => false,
    },
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "WS",
        ownerId,
        planTier: "ENTERPRISE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    db: {
      query: async (sql: string) => {
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: ownerId }];
        }
        if (sql.includes("permissions_json")) {
          return [{ permissions_json: matrix({}) }];
        }
        return [];
      },
    },
    config: entitlementConfig(),
  });

  await assert.rejects(
    () => service.listWorkspaceVaults("w1", memberId),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceSharedVaultsServiceError);
      assert.equal(error.code, "ACCESS_DENIED");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
});
