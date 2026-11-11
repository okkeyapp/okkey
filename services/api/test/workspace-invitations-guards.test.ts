/**
 * Invite rules in WorkspaceMembersService: no owner role, batch cap,
 * duplicate member / pending invite.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WorkspaceMembersService,
  WorkspaceMembersServiceError,
} from "../src/workspace-members/service.ts";
import { entitlementConfig } from "./entitlement-config.ts";

const actorId = "1000000000000000001";
const roleId = "1000000000000000002";
const ownerRoleId = "1000000000000000009";

function service(
  query: (sql: string, params?: unknown[]) => Promise<unknown[]>,
  planTier = "ENTERPRISE",
) {
  return new WorkspaceMembersService({
    db: { query } as never,
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "WS",
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
    config: entitlementConfig(),
  });
}

function baseQuery(extra: (sql: string, params?: unknown[]) => unknown[] | undefined) {
  return async (sql: string, params?: unknown[]) => {
    const hit = extra(sql, params);
    if (hit) {
      return hit;
    }
    if (sql.includes("SELECT owner_id FROM workspaces")) {
      return [{ owner_id: actorId }];
    }
    if (sql.includes("SELECT id, email, first_name, last_name FROM users")) {
      return [{ id: actorId, email: "ada@example.com", first_name: "Ada", last_name: "Lovelace" }];
    }
    if (sql.includes("FROM roles")) {
      return [{ id: roleId, builtin_key: "user", name: "User" }];
    }
    if (sql.includes("SELECT EXISTS")) {
      return [{ ok: false }];
    }
    if (sql.includes("FROM workspace_invitations") && sql.includes("SELECT id")) {
      return [];
    }
    return [];
  };
}

test("createInvitations rejects an empty batch and a batch over 50", async () => {
  // Access is checked before payload validation, so the workspace lookup must succeed.
  const svc = service(baseQuery(() => undefined));
  await assert.rejects(
    () => svc.createInvitations("1000000000000000100", actorId, []),
    (error: unknown) =>
      error instanceof WorkspaceMembersServiceError &&
      error.statusCode === 400 &&
      error.message.includes("invitations required"),
  );
  const batch = Array.from({ length: 51 }, (_, index) => ({
    email: `user${index}@example.com`,
    roleId,
  }));
  await assert.rejects(
    () => svc.createInvitations("1000000000000000100", actorId, batch),
    (error: unknown) =>
      error instanceof WorkspaceMembersServiceError &&
      error.statusCode === 400 &&
      error.message.includes("too many"),
  );
});

test("createInvitations checks access before empty-batch validation", async () => {
  const svc = new WorkspaceMembersService({
    db: {
      query: async () => {
        throw new Error("should not query after access denial");
      },
    } as never,
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "WS",
        ownerId: "someone-else",
        planTier: "ENTERPRISE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => false,
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
    () => svc.createInvitations("1000000000000000100", actorId, []),
    (error: unknown) =>
      error instanceof WorkspaceMembersServiceError &&
      error.code === "ACCESS_DENIED" &&
      error.statusCode === 403,
  );
});

test("createInvitations rejects a non-snowflake workspace id with 400", async () => {
  const svc = service(async () => {
    throw new Error("should not query");
  });
  await assert.rejects(
    () => svc.createInvitations("abc", actorId, [{ email: "new@example.com", roleId }]),
    (error: unknown) =>
      error instanceof WorkspaceMembersServiceError &&
      error.code === "INVALID_WORKSPACE_ID" &&
      error.statusCode === 400,
  );
});

test("createInvitations rejects emails longer than 254 characters", async () => {
  const svc = service(baseQuery(() => undefined));
  const local = "a".repeat(250);
  const email = `${local}@example.com`; // > 254
  assert.ok(email.length > 254);
  await assert.rejects(
    () => svc.createInvitations("1000000000000000100", actorId, [{ email, roleId }]),
    (error: unknown) =>
      error instanceof WorkspaceMembersServiceError &&
      error.statusCode === 400 &&
      error.message.includes("invalid email"),
  );
});

test("createInvitations refuses the owner role", async () => {
  let inserted = 0;
  const svc = service(
    baseQuery((sql) => {
      if (sql.includes("FROM roles")) {
        return [{ id: ownerRoleId, builtin_key: "owner", name: "Owner" }];
      }
      if (sql.includes("INSERT INTO workspace_invitations")) {
        inserted += 1;
        return [];
      }
      return undefined;
    }),
  );
  await assert.rejects(
    () => svc.createInvitations("1000000000000000100", actorId, [{ email: "new@example.com", roleId: ownerRoleId }]),
    (error: unknown) =>
      error instanceof WorkspaceMembersServiceError &&
      error.statusCode === 400 &&
      error.message.includes("owner"),
  );
  assert.equal(inserted, 0);
});

test("createInvitations conflicts when the email is already a member or already invited", async () => {
  const member = service(
    baseQuery((sql) => {
      if (sql.includes("SELECT EXISTS")) {
        return [{ ok: true }];
      }
      return undefined;
    }),
  );
  await assert.rejects(
    () => member.createInvitations("1000000000000000100", actorId, [{ email: "ada@example.com", roleId }]),
    (error: unknown) =>
      error instanceof WorkspaceMembersServiceError &&
      error.code === "CONFLICT" &&
      error.statusCode === 409,
  );

  const pending = service(
    baseQuery((sql) => {
      if (sql.includes("FROM workspace_invitations") && sql.includes("SELECT id")) {
        return [{ id: "inv-1" }];
      }
      return undefined;
    }),
  );
  await assert.rejects(
    () => pending.createInvitations("1000000000000000100", actorId, [{ email: "pending@example.com", roleId }]),
    (error: unknown) =>
      error instanceof WorkspaceMembersServiceError &&
      error.code === "CONFLICT" &&
      error.message.includes("pending"),
  );
});

test("FREE accepts built-in user and admin roles and rejects a custom role", async () => {
  const customRoleId = "1000000000000000099";
  const svc = service(
    baseQuery((sql, params) => {
      if (sql.includes("FROM roles") && params?.[0] === customRoleId) {
        return [{ id: customRoleId, builtin_key: null, name: "Auditors" }];
      }
      return undefined;
    }),
    "FREE",
  );
  const created = await svc.createInvitations("1000000000000000100", actorId, [
    { email: "new@example.com", roleId },
  ]);
  assert.equal(created.length, 1);
  await assert.rejects(
    () =>
      svc.createInvitations("1000000000000000100", actorId, [
        { email: "custom@example.com", roleId: customRoleId },
      ]),
    (error: unknown) =>
      error instanceof WorkspaceMembersServiceError && error.code === "PLAN_FEATURE_REQUIRED",
  );
});
