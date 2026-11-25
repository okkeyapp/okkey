import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import type { AuthService } from "../src/auth/service.ts";
import type { PostgresDatabase, QueryExecutor } from "../src/storage/postgres.ts";
import { RegistrationError, RegistrationService } from "../src/registration/service.ts";
import {
  WorkspaceMembersService,
  WorkspaceMembersServiceError,
} from "../src/workspace-members/service.ts";
import { hybridDeviceShareBytes } from "./hybrid-share-fixture.ts";
import { entitlementConfig } from "./entitlement-config.ts";
import { createMockSessionService, createTestApiConfig } from "./test-api-config.ts";

const WORKSPACE_ID = "1000000000000000100";
const ROLE_ID = "1000000000000000002";
const INVITE_ID = "1000000000000000300";
const OWNER_ID = "1000000000000000001";
const TOKEN = "invite-registration-token";
const TOKEN_HASH = createHash("sha256").update(TOKEN, "utf8").digest("hex");

function pendingInviteRow(overrides?: Partial<{
  status: string;
  email: string | null;
  delivery_method: string;
  expires_at: string;
  accepted_user_id: string | null;
}>) {
  return {
    id: INVITE_ID,
    workspace_id: WORKSPACE_ID,
    email: null as string | null,
    delivery_method: "link",
    token_hash: TOKEN_HASH,
    role_id: ROLE_ID,
    invited_by_user_id: OWNER_ID,
    status: "pending",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    accepted_user_id: null as string | null,
    ...overrides,
  };
}

function membersService(query: QueryExecutor["query"]): WorkspaceMembersService {
  return new WorkspaceMembersService({
    db: { query } as never,
    workspaces: {
      findById: async () => ({
        id: WORKSPACE_ID,
        name: "WS",
        ownerId: OWNER_ID,
        planTier: "ENTERPRISE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
    },
    publicAppBaseUrl: "http://localhost:5173",
    config: entitlementConfig(),
  });
}

test("resolveInviteForRegistration accepts pending link invites for any email", async () => {
  const service = membersService(async (sql) => {
    if (sql.includes("FROM workspace_invitations")) {
      return [
        {
          workspace_id: WORKSPACE_ID,
          email: null,
          delivery_method: "link",
          token_hash: TOKEN_HASH,
          status: "pending",
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      ];
    }
    return [];
  });

  const resolved = await service.resolveInviteForRegistration(TOKEN, "anyone@example.com");
  assert.deepEqual(resolved, {
    outcome: "valid",
    tokenHash: TOKEN_HASH,
    workspaceId: WORKSPACE_ID,
  });
});

test("resolveInviteForRegistration enforces email match on email invites", async () => {
  const service = membersService(async () => [
    {
      workspace_id: WORKSPACE_ID,
      email: "bound@example.com",
      delivery_method: "email",
      token_hash: TOKEN_HASH,
      status: "pending",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
  ]);

  assert.equal(
    (await service.resolveInviteForRegistration(TOKEN, "other@example.com")).outcome,
    "email_mismatch",
  );
  assert.equal(
    (await service.resolveInviteForRegistration(TOKEN, "Bound@example.com")).outcome,
    "valid",
  );
});

test("resolveInviteForRegistration maps expired / used / revoked / unknown", async () => {
  for (const [status, expected] of [
    ["expired", "expired"],
    ["accepted", "used"],
    ["revoked", "revoked"],
  ] as const) {
    const service = membersService(async () => [
      {
        workspace_id: WORKSPACE_ID,
        email: null,
        delivery_method: "link",
        token_hash: TOKEN_HASH,
        status,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
    ]);
    assert.equal(
      (await service.resolveInviteForRegistration(TOKEN, "a@example.com")).outcome,
      expected,
    );
  }

  const missing = membersService(async () => []);
  assert.equal(
    (await missing.resolveInviteForRegistration("unknown", "a@example.com")).outcome,
    "not_found",
  );
});

test("acceptInvitationForRegistrationInTx consumes pending invite once", async () => {
  const updates: string[] = [];
  const query: QueryExecutor["query"] = async (sql) => {
    if (sql.includes("FOR UPDATE")) {
      return [pendingInviteRow()];
    }
    if (sql.includes("SELECT EXISTS")) {
      return [{ ok: false }];
    }
    if (sql.includes("INSERT INTO workspace_members")) {
      return [];
    }
    if (sql.includes("FROM vaults") && sql.includes("is_personal")) {
      return [];
    }
    if (sql.includes("INSERT INTO vaults")) {
      return [];
    }
    if (sql.includes("UPDATE workspace_invitations") && sql.includes("RETURNING id")) {
      updates.push("accepted");
      return [{ id: INVITE_ID }];
    }
    if (sql.includes("COUNT(*)")) {
      return [{ count: "0" }];
    }
    return [];
  };
  const service = membersService(query);

  const result = await service.acceptInvitationForRegistrationInTx(
    { query },
    {
      tokenHash: TOKEN_HASH,
      userId: "1000000000000000999",
      email: "winner@example.com",
    },
  );

  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.equal(updates.length, 1);
});

test("acceptInvitationForRegistrationInTx rejects already-used invite", async () => {
  const query: QueryExecutor["query"] = async (sql) => {
    if (sql.includes("FOR UPDATE")) {
      return [
        pendingInviteRow({
          status: "accepted",
          accepted_user_id: "1000000000000000777",
        }),
      ];
    }
    return [];
  };
  const service = membersService(query);

  await assert.rejects(
    () =>
      service.acceptInvitationForRegistrationInTx(
        { query },
        {
          tokenHash: TOKEN_HASH,
          userId: "1000000000000000999",
          email: "loser@example.com",
        },
      ),
    (error: unknown) =>
      error instanceof WorkspaceMembersServiceError && error.code === "INVITE_USED",
  );
});

test("completeRegistration maps invite consume failures and requires consumer when hash present", async () => {
  const config = createTestApiConfig();

  const missingConsumer = new RegistrationService({
    authService: {
      readAuthState: async () => ({
        id: "s-invite",
        email: "invitee@okkey.local",
        userId: null,
        createdAt: new Date().toISOString(),
        inviteTokenHash: TOKEN_HASH,
      }),
      removeAuthState: async () => {},
    } as unknown as AuthService,
    users: { findByEmail: async () => null },
    postgres: {
      transaction: async () => {
        throw new Error("should not reach postgres");
      },
    } as unknown as PostgresDatabase,
    redis: {
      get: async () => null,
      setWithTtl: async () => {},
      del: async () => 0,
      setIfNotExistsWithTtl: async () => true,
      incr: async () => 1,
      ttl: async () => 60,
      expire: async () => true,
    },
    sessionService: createMockSessionService(),
    config,
  });

  await assert.rejects(
    () =>
      missingConsumer.completeRegistration({
        authStateId: "s-invite",
        userPublicKey: Buffer.alloc(32, 9).toString("base64"),
        userPublicPqKey: Buffer.alloc(1184, 7).toString("base64"),
        userPublicMldsaKey: Buffer.alloc(1952, 4).toString("base64"),
        encryptedPrivateKey: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: Buffer.from(new Uint8Array(2473).fill(1)).toString("base64"),
          meta: {},
        },
        serverKeyShare: new Uint8Array(32).fill(2),
        passwordKdfSalt: new Uint8Array(16).fill(3),
        passwordKdfParamsVersion: 2,
        deviceFingerprint: "b".repeat(64),
        deviceName: "d",
        devicePublicKey: Buffer.from("pk").toString("base64"),
        deviceShare: hybridDeviceShareBytes(),
        platform: "p",
        osName: "o",
        osVersion: "v",
        appVersion: "1",
        clientType: "c",
        userAgent: "ua",
        requestIp: "127.0.0.1",
      }),
    (error: unknown) =>
      error instanceof RegistrationError && error.code === "INVITE_ACCEPT_UNAVAILABLE",
  );

  const mapped = missingConsumer["mapInviteRegistrationError"](
    new WorkspaceMembersServiceError("INVITE_EXPIRED", 410, "invitation expired"),
  );
  assert.ok(mapped instanceof RegistrationError);
  assert.equal(mapped.code, "INVITE_EXPIRED");
  assert.equal(mapped.statusCode, 410);
});
