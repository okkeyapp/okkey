/**
 * Lapsed self-hosted enterprise license: custom role assignment is a write.
 * List and delete of remnant roles stay on WorkspaceBuiltInRolesService and are not plan-gated.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  WorkspaceMembersService,
  WorkspaceMembersServiceError,
} from "../src/workspace-members/service.ts";
import { entitlementConfig } from "./entitlement-config.ts";

const actorId = "1000000000000000001";
const targetId = "1000000000000000004";
const roleId = "1000000000000000002";
const workspaceId = "1000000000000000100";

const selfHostedEnterprise = entitlementConfig({
  deploymentMode: "self_hosted",
  enterpriseModulesEnabled: true,
});

function membersService(planTier: "FREE" | "ENTERPRISE") {
  let memberUpdates = 0;
  const service = new WorkspaceMembersService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("FROM roles")) {
          return [{ id: roleId, builtin_key: null, name: "Auditors" }];
        }
        if (sql.includes("UPDATE workspace_members")) {
          memberUpdates += 1;
        }
        return [];
      },
    } as never,
    workspaces: {
      findById: async () => ({
        id: workspaceId,
        name: "On-prem",
        ownerId: actorId,
        planTier,
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
  return {
    service,
    memberUpdates: () => memberUpdates,
  };
}

test("lapsed enterprise license blocks assigning a custom role", async () => {
  const { service, memberUpdates } = membersService("FREE");
  await assert.rejects(
    () => service.updateMemberRole(workspaceId, actorId, targetId, roleId),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "PLAN_LICENSE_LAPSED");
      assert.equal(error.statusCode, 402);
      return true;
    },
  );
  assert.equal(memberUpdates(), 0);
});

test("paid self-hosted plan does not lapse custom role assignment", async () => {
  const { service } = membersService("ENTERPRISE");
  await assert.rejects(
    () => service.updateMemberRole(workspaceId, actorId, targetId, roleId),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.notEqual(error.code, "PLAN_LICENSE_LAPSED");
      assert.notEqual(error.code, "PLAN_FEATURE_REQUIRED");
      return true;
    },
  );
});

test("SaaS FREE still rejects a custom role as a missing plan feature", async () => {
  const service = new WorkspaceMembersService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("FROM roles")) {
          return [{ id: roleId, builtin_key: null, name: "Auditors" }];
        }
        return [];
      },
    } as never,
    workspaces: {
      findById: async () => ({
        id: workspaceId,
        name: "Cloud",
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
    config: entitlementConfig(),
  });

  await assert.rejects(
    () => service.updateMemberRole(workspaceId, actorId, targetId, roleId),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "PLAN_FEATURE_REQUIRED");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
});
