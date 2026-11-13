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
import {
  WorkspaceSharedVaultsService,
  WorkspaceSharedVaultsServiceError,
} from "../src/workspace-shared-vaults/service.ts";
import { entitlementConfig } from "./entitlement-config.ts";

const actorId = "1000000000000000001";
const targetId = "1000000000000000004";
const roleId = "1000000000000000002";
const workspaceId = "1000000000000000100";
const vaultId = "1000000000000000005";
const profileId = "1000000000000000006";
const invitationId = "1000000000000000011";

const VALID_PK = Buffer.alloc(32, 1).toString("base64");
const VALID_PQ = Buffer.alloc(1184, 2).toString("base64");

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

/**
 * QA web 2.16 / plans-quotas-roles: a custom vault profile cannot be applied in a
 * new place after the self-hosted enterprise plan lapses. Built-in Extended stays
 * assignable, and removing access stays allowed. Shared vaults themselves stay on
 * the FREE catalog (okkey #251, #291).
 */
function workspaceRow(planTier: "FREE" | "ENTERPRISE") {
  return {
    id: workspaceId,
    name: "On-prem",
    ownerId: actorId,
    planTier,
    createdAt: "",
    updatedAt: "",
  };
}

function memberVaultAccessService(input: {
  planTier: "FREE" | "ENTERPRISE";
  builtinKey: string | null;
  currentProfileId?: string | null;
}) {
  let accessUpdates = 0;
  let invitationProfileWrites = 0;
  const service = new WorkspaceMembersService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: actorId }];
        }
        if (sql.includes("FROM workspace_invitations")) {
          return [{ id: invitationId, status: "pending", invited_by_user_id: actorId }];
        }
        if (sql.includes("FROM workspace_members")) {
          return [{ id: "1000000000000000008", invited_by_user_id: actorId }];
        }
        if (sql.includes("is_personal")) {
          return [{ id: vaultId, is_personal: false }];
        }
        if (sql.includes("FROM vault_profiles")) {
          return input.currentProfileId ? [{ profile_id: input.currentProfileId }] : [];
        }
        if (sql.includes("public_pq_key")) {
          return [{ public_key: VALID_PK, public_pq_key: VALID_PQ }];
        }
        if (sql.includes("FROM profiles")) {
          return [{ id: profileId, builtin_key: input.builtinKey }];
        }
        if (sql.includes("INSERT INTO workspace_invitation_vault_access")) {
          invitationProfileWrites += 1;
        }
        return [];
      },
    } as never,
    workspaces: {
      findById: async () => workspaceRow(input.planTier),
      hasAccess: async () => true,
    },
    vaultService: {
      getVaultAccess: async () => ({ members: [], invitations: [] }),
      updateVaultAccess: async () => {
        accessUpdates += 1;
      },
    },
    publicAppBaseUrl: "http://localhost:5173",
    emailTemplates: { sendWorkspaceInvite: async () => {} },
    config: selfHostedEnterprise,
  });
  return {
    service,
    accessUpdates: () => accessUpdates,
    invitationProfileWrites: () => invitationProfileWrites,
  };
}

function sharedVaultProfileService(planTier: "FREE" | "ENTERPRISE", builtinKey: string | null) {
  let profileWrites = 0;
  const service = new WorkspaceSharedVaultsService({
    vaults: {
      findById: async () => ({
        id: vaultId,
        workspaceId,
        name: "Shared",
        description: "",
        icon: "",
        isPersonal: false,
        ownerId: actorId,
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
    } as never,
    workspaces: {
      findById: async () => workspaceRow(planTier),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    db: {
      query: async (sql: string) => {
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: actorId }];
        }
        if (sql.includes("FROM profiles")) {
          return [{ id: profileId, builtin_key: builtinKey }];
        }
        if (sql.includes("INSERT INTO vault_profiles")) {
          profileWrites += 1;
        }
        return [];
      },
    } as never,
    vaultSharing: {
      shareVault: async () => {},
      revokeVaultAccess: async () => {},
    },
    config: selfHostedEnterprise,
  });
  return { service, profileWrites: () => profileWrites };
}

const grantKey = {
  crypto_version: 2,
  algorithm: "opaque",
  payload: "YQ==",
  meta: { entity: "vault_key_wrap" },
};

test("lapsed plan rejects applying a custom profile to a shared vault member", async () => {
  const { service, accessUpdates } = memberVaultAccessService({
    planTier: "FREE",
    builtinKey: null,
  });
  await assert.rejects(
    () =>
      service.updateMemberVaultAccess(workspaceId, actorId, targetId, [
        { vaultId, profileId, encryptedVaultKey: grantKey },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "PLAN_LICENSE_LAPSED");
      assert.equal(error.statusCode, 402);
      return true;
    },
  );
  assert.equal(accessUpdates(), 0);
});

test("lapsed plan still grants the built-in extended profile", async () => {
  const { service, accessUpdates } = memberVaultAccessService({
    planTier: "FREE",
    builtinKey: "extended",
  });
  await service.updateMemberVaultAccess(workspaceId, actorId, targetId, [
    { vaultId, profileId, encryptedVaultKey: grantKey },
  ]);
  assert.equal(accessUpdates(), 1);
});

test("lapsed plan still revokes shared vault access", async () => {
  const { service, accessUpdates } = memberVaultAccessService({
    planTier: "FREE",
    builtinKey: null,
    currentProfileId: profileId,
  });
  await service.updateMemberVaultAccess(workspaceId, actorId, targetId, [
    {
      vaultId,
      profileId: null,
      rotatedVaultKeys: [{ userId: targetId, encryptedVaultKey: grantKey }],
      encryptedPayload: grantKey,
      baseVersion: 3,
    },
  ]);
  assert.equal(accessUpdates(), 1);
});

test("paid self-hosted plan applies a custom profile to a shared vault member", async () => {
  const { service, accessUpdates } = memberVaultAccessService({
    planTier: "ENTERPRISE",
    builtinKey: null,
  });
  await service.updateMemberVaultAccess(workspaceId, actorId, targetId, [
    { vaultId, profileId, encryptedVaultKey: grantKey },
  ]);
  assert.equal(accessUpdates(), 1);
});

test("lapsed plan rejects a custom profile on a pending invitation", async () => {
  const { service, invitationProfileWrites } = memberVaultAccessService({
    planTier: "FREE",
    builtinKey: null,
  });
  await assert.rejects(
    () =>
      service.updateInvitationVaultAccess(workspaceId, actorId, invitationId, [
        { vaultId, profileId },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "PLAN_LICENSE_LAPSED");
      assert.equal(error.statusCode, 402);
      return true;
    },
  );
  assert.equal(invitationProfileWrites(), 0);
});

test("lapsed plan still assigns the built-in extended profile on an invitation", async () => {
  const { service, invitationProfileWrites } = memberVaultAccessService({
    planTier: "FREE",
    builtinKey: "extended",
  });
  await service.updateInvitationVaultAccess(workspaceId, actorId, invitationId, [
    { vaultId, profileId },
  ]);
  assert.equal(invitationProfileWrites(), 1);
});

test("shared vault profile update rejects a custom profile when the plan lapsed", async () => {
  const { service, profileWrites } = sharedVaultProfileService("FREE", null);
  await assert.rejects(
    () =>
      service.updateVaultAccess(vaultId, actorId, {
        grants: [],
        profileUpdates: [{ userId: targetId, profileId }],
        revokes: [],
        baseVersion: 1,
      }),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceSharedVaultsServiceError);
      assert.equal(error.code, "PLAN_LICENSE_LAPSED");
      assert.equal(error.statusCode, 402);
      return true;
    },
  );
  assert.equal(profileWrites(), 0);
});

test("shared vault profile update keeps the built-in extended profile when the plan lapsed", async () => {
  const { service, profileWrites } = sharedVaultProfileService("FREE", "extended");
  await service.updateVaultAccess(vaultId, actorId, {
    grants: [],
    profileUpdates: [{ userId: targetId, profileId }],
    revokes: [],
    baseVersion: 1,
  });
  assert.equal(profileWrites(), 1);
});

test("paid self-hosted plan stores a custom profile on a shared vault", async () => {
  const { service, profileWrites } = sharedVaultProfileService("ENTERPRISE", null);
  await service.updateVaultAccess(vaultId, actorId, {
    grants: [],
    profileUpdates: [{ userId: targetId, profileId }],
    revokes: [],
    baseVersion: 1,
  });
  assert.equal(profileWrites(), 1);
});
