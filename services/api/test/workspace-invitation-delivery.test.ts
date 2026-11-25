import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { MailSettingsService } from "../src/mail-settings/service.ts";
import type { ServerMailSettingsRow, ServerMailSettingsStore } from "../src/mail-settings/types.ts";
import {
  WorkspaceMembersService,
  WorkspaceMembersServiceError,
} from "../src/workspace-members/service.ts";
import { entitlementConfig } from "./entitlement-config.ts";
import { createTestApiConfig } from "./test-api-config.ts";

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
  logger?: { info(message: string, fields?: Record<string, unknown>): void };
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
    publicAppBaseUrl: "http://localhost:5173",
    emailTemplates: overrides.emailTemplates ?? { sendWorkspaceInvite: async () => {} },
    resolveOutboundMailActive: overrides.resolveOutboundMailActive,
    logger: overrides.logger,
    config: entitlementConfig(),
  });
}

test("createInvitations stores pending delivery and skips email when mail is inactive", async () => {
  const inserts: unknown[][] = [];
  let sent = 0;
  const service = membersService({
    resolveOutboundMailActive: async () => false,
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
        return undefined;
      }),
    } as never,
  });

  const result = await service.createInvitations(WORKSPACE_ID, ACTOR_ID, [
    { email: "new@example.com", roleId: ROLE_ID },
  ]);
  assert.equal(result.deliveryStatus, "pending");
  assert.equal(result.created.length, 1);
  assert.equal(sent, 0);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0]?.[7], "pending");
});

test("createInvitations emails immediately when mail is active", async () => {
  let sent = 0;
  const inserts: unknown[][] = [];
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
        return undefined;
      }),
    } as never,
  });

  const result = await service.createInvitations(WORKSPACE_ID, ACTOR_ID, [
    { email: "new@example.com", roleId: ROLE_ID },
  ]);
  assert.equal(result.deliveryStatus, "sent");
  assert.equal(sent, 1);
  assert.equal(inserts[0]?.[7], "sent");
});

test("deliverPendingInvitationEmails claims each invite once and rotates the token", async () => {
  const sentUrls: string[] = [];
  const tokenHashes: string[] = [];
  let claimCalls = 0;
  const service = membersService({
    emailTemplates: {
      sendWorkspaceInvite: async (input) => {
        sentUrls.push(input.variables.inviteUrl);
      },
    },
    db: {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes("FROM workspace_invitations wi") && sql.includes("delivery_status = 'pending'")) {
          return [
            {
              id: INVITE_ID,
              workspace_id: WORKSPACE_ID,
              email: "pending@example.com",
              role_id: ROLE_ID,
              expires_at: new Date(Date.now() + 86_400_000).toISOString(),
              invited_by_user_id: ACTOR_ID,
              workspace_name: "WS",
              role_builtin_key: "admin",
              role_name: "Admin",
              inviter_email: "admin@example.com",
              inviter_first_name: "Ada",
              inviter_last_name: "Lovelace",
            },
          ];
        }
        if (sql.includes("SET token_hash") && sql.includes("delivery_status = 'sent'")) {
          claimCalls += 1;
          tokenHashes.push(String(params?.[1] ?? ""));
          return claimCalls === 1 ? [{ id: INVITE_ID }] : [];
        }
        if (sql.includes("SELECT locale FROM users")) {
          return [{ locale: null }];
        }
        return [];
      },
    } as never,
  });

  const first = await service.deliverPendingInvitationEmails();
  assert.equal(first.delivered, 1);
  assert.equal(sentUrls.length, 1);
  assert.match(sentUrls[0] ?? "", /^http:\/\/localhost:5173\/invite\/[A-Za-z0-9_-]+$/);
  const raw = (sentUrls[0] ?? "").split("/invite/")[1] ?? "";
  assert.equal(tokenHashes[0], hashInviteToken(raw));

  const second = await service.deliverPendingInvitationEmails();
  assert.equal(second.delivered, 0);
  assert.equal(sentUrls.length, 1);
});

test("copyInvitationLink requires members.post, rotates token, and never returns a list token", async () => {
  const logs: Array<{ message: string; fields?: Record<string, unknown> }> = [];
  let storedHash = "old-hash";
  const cell = { get: 0, post: 0, put: 0, delete: 0 };
  const memberWithoutPost = "1000000000000000008";

  const denied = new WorkspaceMembersService({
    deploymentMode: "saas",
    db: {
      query: async (sql: string) => {
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: ACTOR_ID }];
        }
        if (sql.includes("permissions_json")) {
          return [
            {
              permissions_json: {
                settings: cell,
                settings_items: cell,
                settings_capsules: cell,
                settings_mail: cell,
                roles: cell,
                profiles: cell,
                members: { get: 1, post: 0, put: 0, delete: 0 },
                vaults: cell,
                billing: cell,
              },
            },
          ];
        }
        return [];
      },
    } as never,
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
    publicAppBaseUrl: "http://localhost:5173",
    emailTemplates: { sendWorkspaceInvite: async () => {} },
    config: entitlementConfig(),
  });

  await assert.rejects(
    () => denied.copyInvitationLink(WORKSPACE_ID, memberWithoutPost, INVITE_ID),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "ACCESS_DENIED");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );

  const service = membersService({
    logger: {
      info(message, fields) {
        logs.push({ message, fields });
      },
    },
    db: {
      query: async (sql: string, params?: unknown[]) => {
        if (
          sql.includes("SELECT id, status, expires_at") &&
          sql.includes("FROM workspace_invitations")
        ) {
          return [
            {
              id: INVITE_ID,
              status: "pending",
              expires_at: new Date(Date.now() + 86_400_000).toISOString(),
            },
          ];
        }
        if (sql.includes("SET token_hash")) {
          storedHash = String(params?.[2] ?? "");
          return [];
        }
        return baseQuery()(sql, params);
      },
    } as never,
  });

  const copied = await service.copyInvitationLink(WORKSPACE_ID, ACTOR_ID, INVITE_ID);
  assert.match(copied.inviteUrl, /^http:\/\/localhost:5173\/invite\/[A-Za-z0-9_-]+$/);
  const raw = copied.inviteUrl.split("/invite/")[1] ?? "";
  assert.equal(storedHash, hashInviteToken(raw));
  assert.equal(logs.some((entry) => entry.message === "workspace invitation link copied"), true);
  assert.equal(
    JSON.stringify(logs).includes(raw),
    false,
    "raw invite token must not appear in logs",
  );
});

test("copyInvitationLink rejects expired and accepted invites", async () => {
  const expired = membersService({
    db: {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes("SELECT id, status, expires_at")) {
          return [
            {
              id: INVITE_ID,
              status: "pending",
              expires_at: new Date(Date.now() - 1000).toISOString(),
            },
          ];
        }
        return baseQuery()(sql, params);
      },
    } as never,
  });
  await assert.rejects(
    () => expired.copyInvitationLink(WORKSPACE_ID, ACTOR_ID, INVITE_ID),
    (error: unknown) =>
      error instanceof WorkspaceMembersServiceError && error.code === "INVITE_EXPIRED",
  );

  const accepted = membersService({
    db: {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes("SELECT id, status, expires_at")) {
          return [
            {
              id: INVITE_ID,
              status: "accepted",
              expires_at: new Date(Date.now() + 86_400_000).toISOString(),
            },
          ];
        }
        return baseQuery()(sql, params);
      },
    } as never,
  });
  await assert.rejects(
    () => accepted.copyInvitationLink(WORKSPACE_ID, ACTOR_ID, INVITE_ID),
    (error: unknown) =>
      error instanceof WorkspaceMembersServiceError && error.code === "BAD_REQUEST",
  );
});

test("resendInvitation rotates token and sends when mail is active", async () => {
  let sentUrl = "";
  let storedHash = "";
  const service = membersService({
    resolveOutboundMailActive: async () => true,
    emailTemplates: {
      sendWorkspaceInvite: async (input) => {
        sentUrl = input.variables.inviteUrl;
      },
    },
    db: {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes("wi.status") && sql.includes("FROM workspace_invitations wi")) {
          return [
            {
              id: INVITE_ID,
              email: "pending@example.com",
              status: "pending",
              expires_at: new Date(Date.now() + 86_400_000).toISOString(),
              role_id: ROLE_ID,
              role_builtin_key: "user",
              role_name: "User",
            },
          ];
        }
        if (sql.includes("SET token_hash") && sql.includes("delivery_status = 'sent'")) {
          storedHash = String(params?.[2] ?? "");
          return [];
        }
        if (sql.includes("SELECT locale FROM users")) {
          return [{ locale: "en" }];
        }
        return baseQuery()(sql, params);
      },
    } as never,
  });

  const result = await service.resendInvitation(WORKSPACE_ID, ACTOR_ID, INVITE_ID);
  assert.equal(result.deliveryStatus, "sent");
  assert.match(sentUrl, /^http:\/\/localhost:5173\/invite\/[A-Za-z0-9_-]+$/);
  assert.equal(storedHash, hashInviteToken(sentUrl.split("/invite/")[1] ?? ""));
});

test("resendInvitation fails when outbound mail is inactive", async () => {
  const service = membersService({
    resolveOutboundMailActive: async () => false,
  });
  await assert.rejects(
    () => service.resendInvitation(WORKSPACE_ID, ACTOR_ID, INVITE_ID),
    (error: unknown) =>
      error instanceof WorkspaceMembersServiceError && error.code === "EMAIL_NOT_CONFIGURED",
  );
});

test("successful SMTP test triggers pending invite delivery hook", async () => {
  class MemoryMailStore implements ServerMailSettingsStore {
    row: ServerMailSettingsRow | null = {
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpTlsMode: "starttls",
      smtpUsername: "user",
      smtpPasswordCiphertext: null,
      emailFrom: "mailer@example.com",
      publicAppUrl: "http://localhost:5173",
      smtpVerifiedAt: null,
      updatedBy: "seed",
    };

    async read(): Promise<ServerMailSettingsRow | null> {
      return this.row ? { ...this.row } : null;
    }

    async write(row: ServerMailSettingsRow, updatedBy: string): Promise<void> {
      this.row = { ...row, updatedBy };
    }
  }

  let hookCalls = 0;
  const store = new MemoryMailStore();
  const service = new MailSettingsService({
    store,
    config: createTestApiConfig({
      deploymentMode: "self_hosted",
      emailProvider: "logger",
      publicAppBaseUrl: "http://localhost:5173",
      emailFrom: "mailer@example.com",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "user",
      smtpPassword: "secret",
      sessionSecret: "test-session-secret-32-characters!!",
    }),
    users: {
      findById: async () => ({ email: "owner@example.com" }),
    },
    workspaces: {
      findById: async () => ({ ownerId: ACTOR_ID }),
      hasAccess: async () => true,
    },
    assertPermission: async () => {},
    sendSmtp: async () => {},
    onSmtpActivated: async () => {
      hookCalls += 1;
    },
  });

  const activated = await service.sendTestEmail(WORKSPACE_ID, ACTOR_ID, {
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    smtpTlsMode: "starttls",
    smtpUsername: "user",
    emailFrom: "mailer@example.com",
    password: "secret",
  });
  assert.equal(activated.smtpActive, true);
  assert.equal(hookCalls, 1);
});
