import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WorkspaceSharedVaultsService,
  WorkspaceSharedVaultsServiceError,
} from "../src/workspace-shared-vaults/service.ts";
import {
  WorkspaceMembersService,
  WorkspaceMembersServiceError,
} from "../src/workspace-members/service.ts";
import { entitlementConfig } from "./entitlement-config.ts";

test("WorkspaceSharedVaultsService.createSharedVault rejects FREE once the shared vault quota is full", async () => {
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
        ownerId: "u1",
        planTier: "FREE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    db: {
      query: async () => [{ count: "1" }],
      transaction: async <T>(fn: (tx: { query: () => Promise<unknown[]> }) => Promise<T>) =>
        fn({ query: async () => [] }),
    },
    config: entitlementConfig(),
  });

  await assert.rejects(
    () =>
      service.createSharedVault("w1", "u1", {
        name: "Shared",
        encryptedPayload: { v: 1, alg: "none", ciphertext: "" },
        members: [
          {
            userId: "u1",
            profileId: "1000000000000000001",
            encryptedVaultKey: { v: 1, alg: "none", ciphertext: "" },
          },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceSharedVaultsServiceError);
      assert.equal(error.code, "PLAN_QUOTA_EXCEEDED");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
});

test("WorkspaceSharedVaultsService.updateVault allows FREE to rename a shared vault", async () => {
  let metadataWrites = 0;
  const service = new WorkspaceSharedVaultsService({
    vaults: {
      findById: async () => ({
        id: "v-shared",
        workspaceId: "w1",
        name: "Finance",
        description: "Existing",
        icon: "vault",
        isPersonal: false,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      listAccessibleByWorkspace: async () => [],
      listByWorkspace: async () => [],
      canReadVault: async () => true,
      canManageVaultSettings: async () => true,
      create: async () => {
        throw new Error("not used");
      },
      updateMetadata: async () => {
        metadataWrites += 1;
        return {
          id: "v-shared",
          workspaceId: "w1",
          name: "Renamed",
          description: "nope",
          icon: "x",
          isPersonal: false,
          ownerId: "u1",
          cryptoVersion: 2,
          createdAt: "",
          updatedAt: "",
        };
      },
      deleteById: async () => false,
    },
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "WS",
        ownerId: "u1",
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
          return [{ owner_id: "u1" }];
        }
        return [];
      },
    },
    config: entitlementConfig(),
  });

  const updated = await service.updateVault("v-shared", "u1", {
    name: "Renamed",
    icon: "x",
    description: "nope",
  });
  assert.equal(updated.name, "Renamed");
  assert.equal(metadataWrites, 1);
});

test("WorkspaceSharedVaultsService.updateVaultAccess on FREE is not blocked by the plan feature", async () => {
  let keyWrites = 0;
  const service = new WorkspaceSharedVaultsService({
    vaults: {
      findById: async () => ({
        id: "v-shared",
        workspaceId: "w1",
        name: "Finance",
        description: "Existing",
        icon: "vault",
        isPersonal: false,
        ownerId: "u1",
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      listAccessibleByWorkspace: async () => [],
      listByWorkspace: async () => [],
      canReadVault: async () => true,
      canManageVaultSettings: async () => true,
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
        ownerId: "u1",
        planTier: "FREE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    db: {
      query: async (sql: string) => {
        if (sql.includes("INSERT INTO vault_keys")) {
          keyWrites += 1;
        }
        return [];
      },
      transaction: async <T>(fn: (tx: { query: () => Promise<unknown[]> }) => Promise<T>) =>
        fn({ query: async () => [] }),
    },
    vaultSharing: {
      shareVault: async () => {},
      revokeVaultAccess: async () => {},
    },
    config: entitlementConfig(),
  });

  await assert.rejects(
    () =>
      service.updateVaultAccess("v-shared", "u1", {
        grants: [
          {
            userId: "u2",
            profileId: "1000000000000000001",
            encryptedVaultKey: { v: 1, alg: "none", ciphertext: "wrapped" },
          },
        ],
        profileUpdates: [],
        revokes: [],
        baseVersion: 0,
      }),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceSharedVaultsServiceError);
      assert.notEqual(error.code, "PLAN_FEATURE_REQUIRED");
      assert.notEqual(error.code, "PLAN_QUOTA_EXCEEDED");
      return true;
    },
  );
  assert.equal(keyWrites, 0);
});

test("WorkspaceSharedVaultsService.deleteVault rejects personal vault", async () => {
  const service = new WorkspaceSharedVaultsService({
    vaults: {
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
      listAccessibleByWorkspace: async () => [],
      listByWorkspace: async () => [],
      canReadVault: async () => true,
      canManageVaultSettings: async () => true,
      create: async () => {
        throw new Error("not used");
      },
      updateMetadata: async () => null,
      deleteById: async () => {
        throw new Error("should not delete");
      },
    },
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "WS",
        ownerId: "u1",
        planTier: "ENTERPRISE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    config: entitlementConfig(),
  });

  await assert.rejects(
    () => service.deleteVault("v1", "u1"),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceSharedVaultsServiceError);
      assert.equal(error.code, "VAULT_DELETE_FORBIDDEN");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
});

function freeMembersService(): WorkspaceMembersService {
  return new WorkspaceMembersService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("COUNT") && sql.includes("workspace_members")) {
          return [{ count: "3" }];
        }
        if (sql.includes("COUNT") && sql.includes("workspace_invitations")) {
          return [{ count: "0" }];
        }
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: "u1" }];
        }
        return [];
      },
    } as never,
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "WS",
        ownerId: "u1",
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
    config: entitlementConfig(),
  });
}

test("WorkspaceMembersService.createInvitations rejects FREE once the seat quota is full", async () => {
  const service = freeMembersService();

  await assert.rejects(
    () =>
      service.createInvitations("1000000000000000100", "u1", [
        { email: "a@example.com", roleId: "1000000000000000001" },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "PLAN_QUOTA_EXCEEDED");
      assert.equal(error.message, "additional workspace member quota exceeded");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
});

test("WorkspaceMembersService.updateInvitationRole is not plan-blocked on FREE", async () => {
  const service = freeMembersService();

  await assert.rejects(
    () => service.updateInvitationRole("w1", "u1", "1000000000000000002", "1000000000000000001"),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.notEqual(error.code, "PLAN_FEATURE_REQUIRED");
      return true;
    },
  );
});

test("WorkspaceMembersService.updateInvitationVaultAccess is not plan-blocked on FREE", async () => {
  const service = freeMembersService();

  await assert.rejects(
    () =>
      service.updateInvitationVaultAccess("w1", "u1", "1000000000000000002", [
        { vaultId: "1000000000000000003", profileId: "1000000000000000004" },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.notEqual(error.code, "PLAN_FEATURE_REQUIRED");
      return true;
    },
  );
});

test("WorkspaceMembersService.updateMemberRole is not plan-blocked on FREE", async () => {
  const service = freeMembersService();

  await assert.rejects(
    () => service.updateMemberRole("w1", "u1", "1000000000000000002", "1000000000000000001"),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.notEqual(error.code, "PLAN_FEATURE_REQUIRED");
      return true;
    },
  );
});

test("WorkspaceMembersService.updateMemberVaultAccess is not plan-blocked on FREE", async () => {
  const service = freeMembersService();

  await assert.rejects(
    () =>
      service.updateMemberVaultAccess("w1", "u1", "1000000000000000002", [
        { vaultId: "1000000000000000003", profileId: "1000000000000000004" },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.notEqual(error.code, "PLAN_FEATURE_REQUIRED");
      return true;
    },
  );
});

test("self_hosted: modules active unlocks shared vaults even when plan_tier is FREE", async () => {
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
        ownerId: "u1",
        planTier: "FREE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    db: {
      query: async () => [],
      transaction: async <T>(fn: (tx: { query: () => Promise<unknown[]> }) => Promise<T>) =>
        fn({ query: async () => [] }),
    },
    config: entitlementConfig({
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: true,
    }),
  });

  await assert.rejects(
    () =>
      service.createSharedVault("w1", "u1", {
        name: "Shared",
        encryptedPayload: { v: 1, alg: "none", ciphertext: "" },
        members: [
          {
            userId: "u1",
            profileId: "1000000000000000001",
            encryptedVaultKey: { v: 1, alg: "none", ciphertext: "" },
          },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceSharedVaultsServiceError);
      assert.notEqual(error.code, "PLAN_FEATURE_REQUIRED");
      return true;
    },
  );
});

test("self_hosted: modules active unlocks invitations even when plan_tier is FREE", async () => {
  const service = new WorkspaceMembersService({
    db: {
      query: async () => [],
    } as never,
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "WS",
        ownerId: "u1",
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
    config: entitlementConfig({
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: true,
    }),
  });

  await assert.rejects(
    () =>
      service.createInvitations("1000000000000000100", "u1", [
        { email: "a@example.com", roleId: "1000000000000000001" },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.notEqual(error.code, "PLAN_FEATURE_REQUIRED");
      return true;
    },
  );
});

function paidMembersService(overrides: {
  db?: ConstructorParameters<typeof WorkspaceMembersService>[0]["db"];
  emailTemplates?: ConstructorParameters<typeof WorkspaceMembersService>[0]["emailTemplates"];
  publicAppBaseUrl?: string;
  resolvePublicAppBaseUrl?: () => Promise<string>;
}): WorkspaceMembersService {
  return new WorkspaceMembersService({
    db: overrides.db ?? ({ query: async () => [] } as never),
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "WS",
        ownerId: "u1",
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
    publicAppBaseUrl: overrides.publicAppBaseUrl ?? "",
    resolvePublicAppBaseUrl: overrides.resolvePublicAppBaseUrl,
    emailTemplates: overrides.emailTemplates,
    config: entitlementConfig(),
  });
}

function ownerAwareQuery(
  extras: (sql: string, params?: unknown[]) => unknown[] | undefined = () => undefined,
) {
  return async (sql: string, params?: unknown[]) => {
    const extra = extras(sql, params);
    if (extra !== undefined) {
      return extra;
    }
    if (sql.includes("SELECT owner_id FROM workspaces")) {
      return [{ owner_id: "u1" }];
    }
    if (sql.includes("SELECT id, email, first_name, last_name FROM users")) {
      return [{ id: "u1", email: "admin@example.com", first_name: "Ada", last_name: "Lovelace" }];
    }
    if (sql.includes("FROM roles") && sql.includes("builtin_key") && sql.includes("SELECT id") && !sql.includes("INSERT")) {
      if (sql.includes("builtin_key, name") || sql.includes("SELECT id, builtin_key, name")) {
        return [{ id: "1000000000000000001", builtin_key: "admin", name: "Admin" }];
      }
      return [{ id: "1000000000000000001" }];
    }
    if (sql.includes("SELECT EXISTS")) {
      return [{ ok: false }];
    }
    if (sql.includes("FROM workspace_members") && sql.includes("SELECT id") && !sql.includes("INSERT")) {
      return [{ id: "m1" }];
    }
    if (sql.includes("FROM workspace_invitations") && sql.includes("SELECT id") && !sql.includes("INSERT")) {
      return [];
    }
    return [];
  };
}

test("WorkspaceMembersService.createInvitations requires PUBLIC_APP_URL", async () => {
  const service = paidMembersService({
    publicAppBaseUrl: "",
    emailTemplates: {
      sendWorkspaceInvite: async () => {},
    },
    db: { query: ownerAwareQuery() } as never,
  });

  await assert.rejects(
    () =>
      service.createInvitations("1000000000000000100", "u1", [
        { email: "a@example.com", roleId: "1000000000000000001" },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "EMAIL_NOT_CONFIGURED");
      assert.equal(error.statusCode, 503);
      return true;
    },
  );
});

test("WorkspaceMembersService.createInvitations rolls back when send fails", async () => {
  const deleted: string[] = [];
  const service = paidMembersService({
    publicAppBaseUrl: "http://localhost:5173",
    emailTemplates: {
      sendWorkspaceInvite: async () => {
        throw new Error("smtp down");
      },
    },
    db: {
      query: ownerAwareQuery((sql, params) => {
        if (sql.includes("DELETE FROM workspace_invitations")) {
          deleted.push(String(params?.[0] ?? ""));
          return [];
        }
        return undefined;
      }),
    } as never,
  });

  await assert.rejects(
    () =>
      service.createInvitations("1000000000000000100", "u1", [
        { email: "a@example.com", roleId: "1000000000000000001" },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "EMAIL_SEND_FAILED");
      assert.equal(error.statusCode, 503);
      return true;
    },
  );
  assert.equal(deleted.length, 1);
  assert.ok(deleted[0]);
});

test("WorkspaceMembersService.createInvitations uses the effective public app URL", async () => {
  let sentUrl = "";
  const service = paidMembersService({
    publicAppBaseUrl: "http://localhost:5173",
    resolvePublicAppBaseUrl: async () => "https://vault.customer.example/",
    emailTemplates: {
      sendWorkspaceInvite: async (input) => {
        sentUrl = input.variables.inviteUrl;
      },
    },
    db: { query: ownerAwareQuery() } as never,
  });

  await service.createInvitations("1000000000000000100", "u1", [
    { email: "a@example.com", roleId: "1000000000000000001" },
  ]);
  assert.match(sentUrl, /^https:\/\/vault\.customer\.example\/invite\/[A-Za-z0-9_-]+$/);
});

test("WorkspaceMembersService.createInvitations sends /invite/:token with Accept-Language", async () => {
  let sentUrl = "";
  let acceptLanguage: string | null | undefined;
  let userLocale: string | null | undefined;
  let sentVariables:
    | {
        inviterEmail?: string;
        roleName?: string;
        roleBuiltinKey?: string | null;
        expiresAtIso?: string;
      }
    | undefined;
  const service = paidMembersService({
    publicAppBaseUrl: "http://localhost:5173",
    emailTemplates: {
      sendWorkspaceInvite: async (input) => {
        sentUrl = input.variables.inviteUrl;
        acceptLanguage = input.localeHints.acceptLanguage;
        userLocale = input.localeHints.userLocale;
        sentVariables = input.variables;
      },
    },
    db: { query: ownerAwareQuery() } as never,
  });

  const created = await service.createInvitations(
    "1000000000000000100",
    "u1",
    [{ email: "a@example.com", roleId: "1000000000000000001" }],
    { acceptLanguage: "ru" },
  );
  assert.equal(created.length, 1);
  assert.match(sentUrl, /^http:\/\/localhost:5173\/invite\/[A-Za-z0-9_-]+$/);
  assert.equal(acceptLanguage, "ru");
  // Unknown recipient → no profile locale; inviter Accept-Language remains the fallback.
  assert.equal(userLocale, null);
  assert.equal(sentVariables?.inviterEmail, "admin@example.com");
  assert.equal(sentVariables?.roleName, "Admin");
  assert.equal(sentVariables?.roleBuiltinKey, "admin");
  assert.ok(sentVariables?.expiresAtIso);
  assert.ok(Date.parse(sentVariables!.expiresAtIso!) > Date.now());
});

test("WorkspaceMembersService.createInvitations prefers recipient users.locale over Accept-Language", async () => {
  let acceptLanguage: string | null | undefined;
  let userLocale: string | null | undefined;
  const service = paidMembersService({
    publicAppBaseUrl: "http://localhost:5173",
    emailTemplates: {
      sendWorkspaceInvite: async (input) => {
        acceptLanguage = input.localeHints.acceptLanguage;
        userLocale = input.localeHints.userLocale;
      },
    },
    db: {
      query: ownerAwareQuery((sql, params) => {
        if (sql.includes("SELECT locale FROM users") && sql.includes("lower(email)")) {
          assert.equal(params?.[0], "ru-user@example.com");
          return [{ locale: "ru" }];
        }
        return undefined;
      }),
    } as never,
  });

  const created = await service.createInvitations(
    "1000000000000000100",
    "u1",
    [{ email: "ru-user@example.com", roleId: "1000000000000000001" }],
    { acceptLanguage: "en" },
  );
  assert.equal(created.length, 1);
  assert.equal(userLocale, "ru");
  assert.equal(acceptLanguage, "en");
});

test("WorkspaceMembersService.previewInvitation maps expired pending to expired", async () => {
  const service = paidMembersService({
    db: {
      query: async () => [
        {
          email: "invitee@example.com",
          status: "pending",
          expires_at: new Date("2020-01-01T00:00:00.000Z"),
          workspace_name: "Acme",
          inviter_email: "ada@example.com",
          inviter_first_name: "Ada",
          inviter_last_name: null,
        },
      ],
    } as never,
  });

  const preview = await service.previewInvitation("raw-token");
  assert.equal(preview.status, "expired");
  assert.equal(preview.email, "invitee@example.com");
  assert.equal(preview.workspaceName, "Acme");
  assert.equal(preview.inviterDisplayName, "Ada");
});

test("WorkspaceMembersService.acceptInvitation rejects email mismatch", async () => {
  const service = paidMembersService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("FROM workspace_invitations")) {
          return [
            {
              id: "inv1",
              workspace_id: "w1",
              email: "invitee@example.com",
              role_id: "r1",
              status: "pending",
              expires_at: new Date(Date.now() + 86_400_000),
              invited_by_user_id: "admin1",
              accepted_user_id: null,
            },
          ];
        }
        if (sql.includes("SELECT email FROM users")) {
          return [{ email: "other@example.com" }];
        }
        return [];
      },
    } as never,
  });

  await assert.rejects(
    () => service.acceptInvitation("raw-token", "other-user"),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "INVITE_EMAIL_MISMATCH");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
});

test("WorkspaceMembersService.acceptInvitation rejects expired invites", async () => {
  const service = paidMembersService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("FROM workspace_invitations") && sql.includes("FOR UPDATE")) {
          return [
            {
              id: "inv1",
              workspace_id: "w1",
              email: "invitee@example.com",
              role_id: "r1",
              status: "pending",
              expires_at: new Date("2020-01-01T00:00:00.000Z"),
              invited_by_user_id: "admin1",
              accepted_user_id: null,
            },
          ];
        }
        if (sql.includes("SELECT email FROM users")) {
          return [{ email: "invitee@example.com" }];
        }
        return [];
      },
    } as never,
  });

  await assert.rejects(
    () => service.acceptInvitation("raw-token", "u2"),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "INVITE_EXPIRED");
      assert.equal(error.statusCode, 410);
      return true;
    },
  );
});

test("WorkspaceMembersService.acceptInvitation creates member and personal vault", async () => {
  const inserts: string[] = [];
  const service = paidMembersService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("INSERT INTO")) {
          inserts.push(sql);
        }
        if (sql.includes("FROM workspace_invitations") && sql.includes("FOR UPDATE")) {
          return [
            {
              id: "inv1",
              workspace_id: "w1",
              email: "invitee@example.com",
              role_id: "1000000000000000001",
              status: "pending",
              expires_at: new Date(Date.now() + 86_400_000),
              invited_by_user_id: "u1",
              accepted_user_id: null,
            },
          ];
        }
        if (sql.includes("SELECT email FROM users")) {
          return [{ email: "invitee@example.com" }];
        }
        if (sql.includes("SELECT EXISTS")) {
          return [{ ok: false }];
        }
        if (sql.includes("SELECT id FROM vaults")) {
          return [];
        }
        return [];
      },
    } as never,
  });

  const result = await service.acceptInvitation("raw-token", "u2");
  assert.equal(result.workspaceId, "w1");
  assert.ok(result.vaultId);
  assert.equal(inserts.filter((sql) => sql.includes("workspace_members")).length, 1);
  assert.equal(inserts.filter((sql) => sql.includes("INSERT INTO vaults")).length, 1);
});

test("WorkspaceMembersService.listPendingVaultWraps returns staged wraps without keys", async () => {
  const validPk = Buffer.alloc(32, 1).toString("base64");
  const validPq = Buffer.alloc(1184, 2).toString("base64");
  const service = paidMembersService({
    db: {
      query: ownerAwareQuery((sql) => {
        if (sql.includes("FROM workspace_invitation_vault_access")) {
          assert.match(sql, /JOIN workspace_members wm/);
          return [
            {
              user_id: "u2",
              vault_id: "v1",
              profile_id: "p1",
              public_key: validPk,
              public_pq_key: validPq,
            },
            {
              user_id: "u3",
              vault_id: "v1",
              profile_id: "p1",
              public_key: "short",
              public_pq_key: validPq,
            },
          ];
        }
        return undefined;
      }),
    } as never,
  });

  const result = await service.listPendingVaultWraps("w1", "u1");
  assert.equal(result.wraps.length, 1);
  assert.equal(result.wraps[0]?.userId, "u2");
  assert.equal(result.wraps[0]?.vaultId, "v1");
  assert.equal(result.wraps[0]?.profileId, "p1");
  assert.equal(result.skippedInvalidKeyRecipients.length, 1);
  assert.equal(result.skippedInvalidKeyRecipients[0]?.userId, "u3");
  assert.equal(result.skippedInvalidKeyRecipients[0]?.vaultId, "v1");
  assert.equal(result.skippedInvalidKeyRecipients[0]?.profileId, "p1");
});

test("WorkspaceMembersService.removeMember clears invitation vault access rows", async () => {
  const deleted: string[] = [];
  const service = paidMembersService({
    db: {
      query: ownerAwareQuery((sql) => {
        if (sql.includes("SELECT id, invited_by_user_id FROM workspace_members")) {
          return [{ id: "m2", invited_by_user_id: "u1" }];
        }
        if (sql.startsWith("DELETE FROM") || sql.includes("DELETE FROM")) {
          deleted.push(sql.replace(/\s+/g, " ").trim());
          return [];
        }
        return undefined;
      }),
    } as never,
  });

  await service.removeMember("w1", "u1", "1000000000000000002");
  assert.ok(
    deleted.some((sql) => sql.includes("DELETE FROM workspace_invitation_vault_access")),
    "expected IVA cleanup on removeMember",
  );
  assert.ok(deleted.some((sql) => sql.includes("DELETE FROM workspace_members")));
});
