/**
 * Self-hosted entitlements:
 * modules on → ENTERPRISE matrix, numeric caps unlimited (`null`);
 * modules off → FREE quotas (10 additional members, 1 shared vault) even when
 * the stored plan_tier is ENTERPRISE. `plan_tier` is not read.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { getPlanQuotaLimits } from "@okkey/types";
import {
  WorkspaceMembersService,
  WorkspaceMembersServiceError,
} from "../src/workspace-members/service.ts";
import {
  WorkspaceSharedVaultsService,
  WorkspaceSharedVaultsServiceError,
} from "../src/workspace-shared-vaults/service.ts";
import { entitlementConfig } from "./entitlement-config.ts";

const actorId = "1000000000000000001";
const roleId = "1000000000000000002";
const profileId = "1000000000000000003";
const workspaceId = "1000000000000000100";

const selfHostedEnterprise = entitlementConfig({
  deploymentMode: "self_hosted",
  enterpriseModulesEnabled: true,
});

const selfHostedOss = entitlementConfig({
  deploymentMode: "self_hosted",
  enterpriseModulesEnabled: false,
});

test("self-hosted modules map quotas to unlimited ENTERPRISE, not the stored FREE tier", () => {
  const limits = getPlanQuotaLimits("FREE", {
    deploymentMode: "self_hosted",
    enterpriseModulesActive: true,
  });
  assert.equal(limits.maxAdditionalMembers, null);
  assert.equal(limits.maxSharedVaults, null);
  const oss = getPlanQuotaLimits("ENTERPRISE", {
    deploymentMode: "self_hosted",
    enterpriseModulesActive: false,
  });
  assert.equal(oss.maxAdditionalMembers, 10);
  assert.equal(oss.maxSharedVaults, 1);
});

test("self-hosted modules allow an invite far past FAMILY and TEAM seat caps when plan_tier is FREE", async () => {
  let inserts = 0;
  const service = new WorkspaceMembersService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: actorId }];
        }
        if (sql.includes("SELECT id, email, first_name, last_name FROM users")) {
          return [{ id: actorId, email: "owner@example.com", first_name: "Ada", last_name: "Lovelace" }];
        }
        if (sql.includes("FROM roles")) {
          return [{ id: roleId, builtin_key: "user", name: "User" }];
        }
        if (sql.includes("COUNT") && sql.includes("workspace_members")) {
          return [{ count: "10000" }];
        }
        if (sql.includes("COUNT") && sql.includes("workspace_invitations")) {
          return [{ count: "10000" }];
        }
        if (sql.includes("SELECT EXISTS")) {
          return [{ ok: false }];
        }
        if (sql.includes("FROM workspace_invitations") && sql.includes("SELECT id")) {
          return [];
        }
        if (sql.includes("INSERT INTO workspace_invitations")) {
          inserts += 1;
          return [];
        }
        return [];
      },
    } as never,
    workspaces: {
      findById: async () => ({
        id: workspaceId,
        name: "On-prem",
        ownerId: actorId,
        planTier: "FREE",
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
    config: selfHostedEnterprise,
  });

  const created = await service.createInvitations(workspaceId, actorId, [
    { email: "far-past-cap@example.com", roleId },
  ]);
  assert.equal(created.length, 1);
  assert.equal(inserts, 1);
});

test("self-hosted without modules applies the FREE seat cap even when plan_tier is ENTERPRISE", async () => {
  let inserts = 0;
  const service = new WorkspaceMembersService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: actorId }];
        }
        if (sql.includes("COUNT") && sql.includes("workspace_members")) {
          return [{ count: "10" }];
        }
        if (sql.includes("COUNT") && sql.includes("workspace_invitations")) {
          return [{ count: "0" }];
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
        name: "On-prem",
        ownerId: actorId,
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
    config: selfHostedOss,
  });

  await assert.rejects(
    () =>
      service.createInvitations(workspaceId, actorId, [
        { email: "new@example.com", roleId },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "PLAN_QUOTA_EXCEEDED");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
  assert.equal(inserts, 0);
});

test("self-hosted modules allow a shared vault far past the TEAM cap when plan_tier is FREE", async () => {
  let vaultInserts = 0;
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
        name: "On-prem",
        ownerId: actorId,
        planTier: "FREE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    db: {
      query: async (sql: string) => {
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: actorId }];
        }
        if (sql.includes("COUNT") && sql.includes("is_personal")) {
          return [{ count: "999" }];
        }
        if (sql.includes("public_pq_key")) {
          return [{
            public_key: Buffer.alloc(32, 1).toString("base64"),
            public_pq_key: Buffer.alloc(1184, 2).toString("base64"),
          }];
        }
        return [];
      },
      transaction: async <T>(fn: (tx: { query: (sql: string) => Promise<unknown[]> }) => Promise<T>) =>
        fn({
          query: async (sql: string) => {
            if (sql.includes("INSERT INTO vaults")) {
              vaultInserts += 1;
              return [
                {
                  id: "2000000000000000001",
                  workspace_id: "w1",
                  name: "Shared",
                  description: "",
                  icon: "",
                  is_personal: false,
                  owner_id: actorId,
                  crypto_version: 2,
                  created_at: "",
                  updated_at: "",
                },
              ];
            }
            if (sql.includes("SELECT EXISTS")) {
              return [{ ok: true }];
            }
            if (sql.includes("FROM profiles")) {
              return [{ id: profileId }];
            }
            if (sql.includes("current_version")) {
              return [{ current_version: 0 }];
            }
            if (sql.includes("COUNT")) {
              return [{ count: "999" }];
            }
            return [];
          },
        }),
    },
    config: selfHostedEnterprise,
  });

  await assert.rejects(
    () =>
      service.createSharedVault("w1", actorId, {
        name: "Past team cap",
        encryptedPayload: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: "YQ==",
          meta: {},
        },
        members: [
          {
            userId: actorId,
            profileId,
            encryptedVaultKey: {
              crypto_version: 2,
              algorithm: "opaque",
              payload: "Yg==",
              meta: {},
            },
          },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceSharedVaultsServiceError);
      assert.notEqual(error.code, "PLAN_QUOTA_EXCEEDED");
      assert.notEqual(error.code, "PLAN_FEATURE_REQUIRED");
      return true;
    },
  );
  assert.equal(vaultInserts, 0);
});
