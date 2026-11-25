import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  WorkspaceMembersService,
  WorkspaceMembersServiceError,
} from "../src/workspace-members/service.ts";
import { entitlementConfig } from "./entitlement-config.ts";

const WORKSPACE_ID = "1000000000000000100";
const ACTOR_ID = "1000000000000000001";
const ROLE_ID = "1000000000000000002";
const INVITE_ID = "1000000000000000300";

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function baseQuery(
  extras: (sql: string, params?: unknown[]) => unknown[] | undefined = () => undefined,
) {
  return async (sql: string, params?: unknown[]) => {
    const extra = extras(sql, params);
    if (extra !== undefined) {
      return extra;
    }
    if (sql.includes("SELECT owner_id FROM workspaces")) {
      return [{ owner_id: ACTOR_ID }];
    }
    if (sql.includes("SELECT id, email, first_name, last_name FROM users")) {
      return [{ id: ACTOR_ID, email: "admin@example.com", first_name: "Ada", last_name: "Lovelace" }];
    }
    if (sql.includes("FROM roles") && sql.includes("builtin_key")) {
      if (sql.includes("builtin_key, name") || sql.includes("SELECT id, builtin_key, name")) {
        return [{ id: ROLE_ID, builtin_key: "admin", name: "Admin" }];
      }
      return [{ id: ROLE_ID }];
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

function membersService(overrides: {
  db?: ConstructorParameters<typeof WorkspaceMembersService>[0]["db"];
  emailTemplates?: ConstructorParameters<typeof WorkspaceMembersService>[0]["emailTemplates"];
  resolveOutboundMailActive?: () => Promise<boolean>;
  publicAppBaseUrl?: string;
}): WorkspaceMembersService {
  return new WorkspaceMembersService({
    deploymentMode: "saas",
    db: overrides.db ?? ({ query: baseQuery() } as never),
    workspaces: {
      findById: async () => ({
        id: WORKSPACE_ID,
        name: "WS",
        ownerId: ACTOR_ID,
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
    publicAppBaseUrl: overrides.publicAppBaseUrl ?? "http://localhost:5173",
    emailTemplates: overrides.emailTemplates,
    resolveOutboundMailActive: overrides.resolveOutboundMailActive,
    config: entitlementConfig(),
  });
}

test("createInvitations link method returns invite URLs without email or mail transport", async () => {
  const inserts: unknown[][] = [];
  let sent = 0;
  const service = membersService({
    emailTemplates: undefined,
    resolveOutboundMailActive: async () => false,
    db: {
      query: baseQuery((sql, params) => {
        if (sql.includes("INSERT INTO workspace_invitations")) {
          inserts.push(params ?? []);
          return [];
        }
        return undefined;
      }),
    } as never,
  });

  const result = await service.createInvitations(WORKSPACE_ID, ACTOR_ID, [
    { roleId: ROLE_ID, deliveryMethod: "link" },
    { roleId: ROLE_ID, deliveryMethod: "link" },
  ]);

  assert.equal(result.deliveryStatus, "sent");
  assert.equal(result.created.length, 2);
  assert.equal(sent, 0);
  for (const item of result.created) {
    assert.equal(item.email, null);
    assert.equal(item.deliveryMethod, "link");
    assert.match(item.inviteUrl ?? "", /^http:\/\/localhost:5173\/invite\/[A-Za-z0-9_-]+$/);
    assert.ok(item.expiresAt);
    const raw = (item.inviteUrl ?? "").split("/invite/")[1] ?? "";
    assert.equal(raw.length >= 32, true);
  }
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0]?.[2], ROLE_ID);
});

test("createInvitations rejects email on link invites and rejects link without PUBLIC_APP_URL", async () => {
  const withEmail = membersService({ emailTemplates: undefined });
  await assert.rejects(
    () =>
      withEmail.createInvitations(WORKSPACE_ID, ACTOR_ID, [
        { email: "a@example.com", roleId: ROLE_ID, deliveryMethod: "link" },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "BAD_REQUEST");
      return true;
    },
  );

  const noUrl = membersService({ emailTemplates: undefined, publicAppBaseUrl: "" });
  await assert.rejects(
    () =>
      noUrl.createInvitations(WORKSPACE_ID, ACTOR_ID, [
        { roleId: ROLE_ID, deliveryMethod: "link" },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "EMAIL_NOT_CONFIGURED");
      return true;
    },
  );
});

test("createInvitations bulk mixes email and link delivery", async () => {
  const inserts: unknown[][] = [];
  let sent = 0;
  const service = membersService({
    resolveOutboundMailActive: async () => true,
    emailTemplates: {
      sendWorkspaceInvite: async () => {
        sent += 1;
      },
    },
    db: {
      query: baseQuery((sql, params) => {
        if (sql.includes("INSERT INTO workspace_invitations")) {
          inserts.push(params ?? []);
          return [];
        }
        if (sql.includes("SELECT locale FROM users")) {
          return [{ locale: null }];
        }
        return undefined;
      }),
    } as never,
  });

  const result = await service.createInvitations(WORKSPACE_ID, ACTOR_ID, [
    { email: "one@example.com", roleId: ROLE_ID, deliveryMethod: "email" },
    { roleId: ROLE_ID, deliveryMethod: "link" },
  ]);

  assert.equal(result.created.length, 2);
  assert.equal(result.created[0]?.deliveryMethod, "email");
  assert.equal(result.created[0]?.email, "one@example.com");
  assert.equal(result.created[0]?.inviteUrl, undefined);
  assert.equal(result.created[1]?.deliveryMethod, "link");
  assert.ok(result.created[1]?.inviteUrl);
  assert.equal(sent, 1);
  assert.equal(inserts.length, 2);
});

test("resendInvitation rejects link invitations", async () => {
  const service = membersService({
    emailTemplates: { sendWorkspaceInvite: async () => {} },
    resolveOutboundMailActive: async () => true,
    db: {
      query: baseQuery((sql) => {
        if (sql.includes("FROM workspace_invitations wi") && sql.includes("JOIN roles")) {
          return [
            {
              id: INVITE_ID,
              email: null,
              delivery_method: "link",
              status: "pending",
              expires_at: new Date(Date.now() + 86_400_000).toISOString(),
              role_id: ROLE_ID,
              role_builtin_key: "admin",
              role_name: "Admin",
            },
          ];
        }
        return undefined;
      }),
    } as never,
  });

  await assert.rejects(
    () => service.resendInvitation(WORKSPACE_ID, ACTOR_ID, INVITE_ID),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "BAD_REQUEST");
      return true;
    },
  );
});

test("acceptInvitation allows any signed-in user for link invites", async () => {
  const token = "link-accept-token";
  const inserts: string[] = [];
  const service = membersService({
    emailTemplates: undefined,
    db: {
      query: async (sql: string) => {
        if (sql.includes("INSERT INTO")) {
          inserts.push(sql);
        }
        if (sql.includes("FROM workspace_invitations") && sql.includes("FOR UPDATE")) {
          return [
            {
              id: INVITE_ID,
              workspace_id: WORKSPACE_ID,
              email: null,
              delivery_method: "link",
              token_hash: hashInviteToken(token),
              role_id: ROLE_ID,
              status: "pending",
              expires_at: new Date(Date.now() + 86_400_000),
              invited_by_user_id: ACTOR_ID,
              accepted_user_id: null,
            },
          ];
        }
        if (sql.includes("SELECT email FROM users")) {
          return [{ email: "anyone@example.com" }];
        }
        if (sql.includes("SELECT EXISTS")) {
          return [{ ok: false }];
        }
        if (sql.includes("SELECT id FROM vaults")) {
          return [];
        }
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: ACTOR_ID }];
        }
        return [];
      },
      transaction: async <T>(fn: (tx: { query: typeof baseQuery }) => Promise<T>) =>
        fn({ query: async (sql: string, params?: unknown[]) => {
          if (sql.includes("INSERT INTO")) {
            inserts.push(sql);
          }
          if (sql.includes("FROM workspace_invitations") && sql.includes("FOR UPDATE")) {
            return [
              {
                id: INVITE_ID,
                workspace_id: WORKSPACE_ID,
                email: null,
                delivery_method: "link",
                token_hash: hashInviteToken(token),
                role_id: ROLE_ID,
                status: "pending",
                expires_at: new Date(Date.now() + 86_400_000),
                invited_by_user_id: ACTOR_ID,
                accepted_user_id: null,
              },
            ];
          }
          if (sql.includes("SELECT email FROM users")) {
            return [{ email: "anyone@example.com" }];
          }
          if (sql.includes("SELECT EXISTS")) {
            return [{ ok: false }];
          }
          if (sql.includes("SELECT id FROM vaults")) {
            return [];
          }
          if (sql.includes("SELECT owner_id FROM workspaces")) {
            return [{ owner_id: ACTOR_ID }];
          }
          if (sql.includes("UPDATE workspace_invitations") && sql.includes("RETURNING id")) {
            return [{ id: INVITE_ID }];
          }
          if (sql.includes("COUNT(*)")) {
            return [{ count: "0" }];
          }
          return baseQuery()(sql, params);
        } } as never),
    } as never,
  });

  const result = await service.acceptInvitation(token, "1000000000000000099");
  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.ok(result.vaultId);
  assert.equal(inserts.some((sql) => sql.includes("workspace_members")), true);
});

test("acceptInvitation rejects revoked link invites", async () => {
  const token = "revoked-link-token";
  const service = membersService({
    emailTemplates: undefined,
    db: {
      query: async (sql: string) => {
        if (sql.includes("FROM workspace_invitations") && sql.includes("FOR UPDATE")) {
          return [
            {
              id: INVITE_ID,
              workspace_id: WORKSPACE_ID,
              email: null,
              delivery_method: "link",
              token_hash: hashInviteToken(token),
              role_id: ROLE_ID,
              status: "revoked",
              expires_at: new Date(Date.now() + 86_400_000),
              invited_by_user_id: ACTOR_ID,
              accepted_user_id: null,
            },
          ];
        }
        if (sql.includes("SELECT email FROM users")) {
          return [{ email: "anyone@example.com" }];
        }
        return [];
      },
      transaction: async <T>(fn: (tx: { query: (sql: string) => Promise<unknown[]> }) => Promise<T>) =>
        fn({
          query: async (sql: string) => {
            if (sql.includes("FROM workspace_invitations") && sql.includes("FOR UPDATE")) {
              return [
                {
                  id: INVITE_ID,
                  workspace_id: WORKSPACE_ID,
                  email: null,
                  delivery_method: "link",
                  token_hash: hashInviteToken(token),
                  role_id: ROLE_ID,
                  status: "revoked",
                  expires_at: new Date(Date.now() + 86_400_000),
                  invited_by_user_id: ACTOR_ID,
                  accepted_user_id: null,
                },
              ];
            }
            if (sql.includes("SELECT email FROM users")) {
              return [{ email: "anyone@example.com" }];
            }
            return [];
          },
        }),
    } as never,
  });

  await assert.rejects(
    () => service.acceptInvitation(token, "1000000000000000099"),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "INVITE_REVOKED");
      return true;
    },
  );
});

test("previewInvitation returns null email for link invites", async () => {
  const token = "preview-link-token";
  const service = membersService({
    emailTemplates: undefined,
    db: {
      query: async () => [
        {
          email: null,
          delivery_method: "link",
          token_hash: hashInviteToken(token),
          status: "pending",
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          workspace_name: "WS",
          inviter_email: "admin@example.com",
          inviter_first_name: "Ada",
          inviter_last_name: "Lovelace",
        },
      ],
    } as never,
  });

  const preview = await service.previewInvitation(token);
  assert.equal(preview.email, null);
  assert.equal(preview.deliveryMethod, "link");
  assert.equal(preview.status, "pending");
  assert.equal(preview.inviterDisplayName, "Ada Lovelace");
});
