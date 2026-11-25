import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";

import type { AuthService } from "../src/auth/service.ts";
import { AuthError, AuthService as AuthServiceClass } from "../src/auth/service.ts";
import { RegistrationError, RegistrationService } from "../src/registration/service.ts";
import {
  assertSelfHostedInstanceAccess,
  blockAccountAndRevokeAccess,
  hasSelfHostedInstanceAccess,
  InstanceAccessError,
  readInstanceSettings,
} from "../src/setup/instance-access.ts";
import { ensureSelfHostedInstanceWorkspace } from "../src/setup/ensure-instance-workspace.ts";
import { SetupError, SetupService } from "../src/setup/service.ts";
import type { RegistrationMode, ServerInstanceSettingsRow } from "../src/setup/types.ts";
import { applySqlMigrations } from "../src/storage/migrate.ts";
import type { PostgresDatabase, QueryExecutor } from "../src/storage/postgres.ts";
import { createResolveAuthenticatedSession } from "../src/routes/auth-context.ts";
import { SessionService, SessionServiceError } from "../src/session/service.ts";
import { WorkspaceMembersService } from "../src/workspace-members/service.ts";
import { hybridDeviceShareBytes } from "./hybrid-share-fixture.ts";
import { entitlementConfig } from "./entitlement-config.ts";
import { createMockSessionService, createTestApiConfig } from "./test-api-config.ts";
import { initEntityIdGenerator } from "../src/entity-id.ts";
import { IncomingMessage } from "node:http";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const databaseUrl = process.env.DATABASE_URL ?? "postgres://okkey:okkey@127.0.0.1:5432/okkey";

const INSTANCE_WS = "1000000000000000100";
const OTHER_WS = "1000000000000000101";
const OWNER_ID = "1000000000000000001";
const MEMBER_ID = "1000000000000000003";
const TOKEN = "invite-instance-token";
const TOKEN_HASH = createHash("sha256").update(TOKEN, "utf8").digest("hex");

function registerInput(authStateId: string) {
  return {
    authStateId,
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
    deviceFingerprint: "a".repeat(64),
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
  };
}

function memoryRedis() {
  const values = new Map<string, string>();
  return {
    setWithTtl: async (k: string, v: string) => {
      values.set(k, v);
    },
    setIfNotExistsWithTtl: async (k: string, v: string) => {
      if (values.has(k)) return false;
      values.set(k, v);
      return true;
    },
    get: async (k: string) => values.get(k) ?? null,
    del: async (k: string) => (values.delete(k) ? 1 : 0),
    incr: async (k: string) => {
      const next = Number(values.get(k) ?? "0") + 1;
      values.set(k, String(next));
      return next;
    },
    expire: async () => true,
  };
}

test("self-hosted registration without invite is rejected when users already exist", async () => {
  const service = new RegistrationService({
    authService: {
      readAuthState: async () => ({
        id: "s1",
        email: "new@example.com",
        userId: null,
        createdAt: new Date().toISOString(),
      }),
      removeAuthState: async () => {},
    } as unknown as AuthService,
    users: {
      findByEmail: async () => null,
      hasAnyUsers: async () => true,
    },
    postgres: {
      transaction: async () => {
        throw new Error("must not open transaction");
      },
    } as unknown as PostgresDatabase,
    redis: memoryRedis(),
    sessionService: createMockSessionService(),
    config: createTestApiConfig({ deploymentMode: "self_hosted" }),
  });

  await assert.rejects(
    () => service.completeRegistration(registerInput("s1")),
    (error: unknown) =>
      error instanceof RegistrationError && error.code === "REGISTRATION_INVITE_REQUIRED",
  );
});

test("saas registration without invite is not gated by REGISTRATION_INVITE_REQUIRED", async () => {
  let createdPersonalWorkspace = false;
  const service = new RegistrationService({
    authService: {
      readAuthState: async () => ({
        id: "s-saas",
        email: "saas@example.com",
        userId: null,
        createdAt: new Date().toISOString(),
      }),
      removeAuthState: async () => {},
    } as unknown as AuthService,
    users: {
      findByEmail: async () => null,
      hasAnyUsers: async () => true,
    },
    postgres: {
      transaction: async (fn) =>
        fn({
          query: async (sql: string) => {
            if (sql.includes("INSERT INTO users")) return [{ id: "u-saas" }];
            if (sql.includes("INSERT INTO devices")) return [{ id: "d-saas" }];
            if (sql.includes("INSERT INTO workspaces")) {
              createdPersonalWorkspace = true;
              return [{ id: "w-saas" }];
            }
            if (sql.includes("INSERT INTO vaults")) return [{ id: "v-saas" }];
            if (sql.includes("FROM roles") && sql.includes("builtin_key")) return [];
            if (sql.includes("INSERT INTO roles")) return [{ id: `role-${randomBytes(2).toString("hex")}` }];
            if (sql.includes("INSERT INTO workspace_members")) return [{ id: "wm-1" }];
            if (sql.includes("FROM profiles") && sql.includes("builtin_key")) return [];
            if (sql.includes("INSERT INTO profiles")) return [{ id: `prof-${randomBytes(2).toString("hex")}` }];
            return [];
          },
        } as never),
    } as unknown as PostgresDatabase,
    redis: memoryRedis(),
    sessionService: createMockSessionService(),
    config: createTestApiConfig({ deploymentMode: "saas" }),
  });

  const result = await service.completeRegistration(registerInput("s-saas"));
  assert.equal(result.workspaceId, "w-saas");
  assert.equal(result.vaultId, "v-saas");
  assert.equal(createdPersonalWorkspace, true);
});

test("self-hosted invite to a non-instance workspace is rejected", async () => {
  const service = new RegistrationService({
    authService: {
      readAuthState: async () => ({
        id: "s-bad-invite",
        email: "invitee@example.com",
        userId: null,
        createdAt: new Date().toISOString(),
        inviteTokenHash: TOKEN_HASH,
      }),
      removeAuthState: async () => {},
    } as unknown as AuthService,
    users: {
      findByEmail: async () => null,
      hasAnyUsers: async () => true,
    },
    postgres: {
      transaction: async (fn) =>
        fn({
          query: async (sql: string) => {
            if (sql.includes("FROM server_instance_settings")) {
              return [
                {
                  workspace_id: INSTANCE_WS,
                  setup_completed_at: new Date().toISOString(),
                  registration_mode: "invite_only",
                },
              ];
            }
            if (sql.includes("FROM workspace_invitations") && sql.includes("token_hash")) {
              return [{ workspace_id: OTHER_WS }];
            }
            return [];
          },
        } as never),
    } as unknown as PostgresDatabase,
    redis: memoryRedis(),
    sessionService: createMockSessionService(),
    config: createTestApiConfig({ deploymentMode: "self_hosted" }),
    consumeInviteDuringRegistration: async () => {
      throw new Error("must not consume non-instance invite");
    },
  });

  await assert.rejects(
    () => service.completeRegistration(registerInput("s-bad-invite")),
    (error: unknown) =>
      error instanceof RegistrationError && error.code === "INVITE_WORKSPACE_NOT_INSTANCE",
  );
});

test("self-hosted invite registration joins instance workspace without a personal workspace", async () => {
  let createdPersonalWorkspace = false;
  const service = new RegistrationService({
    authService: {
      readAuthState: async () => ({
        id: "s-ok-invite",
        email: "invitee@example.com",
        userId: null,
        createdAt: new Date().toISOString(),
        inviteTokenHash: TOKEN_HASH,
      }),
      removeAuthState: async () => {},
    } as unknown as AuthService,
    users: {
      findByEmail: async () => null,
      hasAnyUsers: async () => true,
    },
    postgres: {
      transaction: async (fn) =>
        fn({
          query: async (sql: string) => {
            if (sql.includes("FROM server_instance_settings")) {
              return [
                {
                  workspace_id: INSTANCE_WS,
                  setup_completed_at: new Date().toISOString(),
                  registration_mode: "invite_only",
                },
              ];
            }
            if (
              sql.includes("FROM workspace_invitations") &&
              sql.includes("token_hash") &&
              !sql.includes("FOR UPDATE")
            ) {
              return [{ workspace_id: INSTANCE_WS }];
            }
            if (sql.includes("INSERT INTO users")) return [{ id: "u-invitee" }];
            if (sql.includes("INSERT INTO devices")) return [{ id: "d-invitee" }];
            if (sql.includes("INSERT INTO workspaces")) {
              createdPersonalWorkspace = true;
              throw new Error("must not create personal workspace");
            }
            if (sql.includes("INSERT INTO vaults")) {
              throw new Error("must not create personal vault outside invite accept");
            }
            return [];
          },
        } as never),
    } as unknown as PostgresDatabase,
    redis: memoryRedis(),
    sessionService: createMockSessionService(),
    config: createTestApiConfig({ deploymentMode: "self_hosted" }),
    consumeInviteDuringRegistration: async () => ({
      workspaceId: INSTANCE_WS,
      vaultId: "v-invitee",
    }),
  });

  const result = await service.completeRegistration(registerInput("s-ok-invite"));
  assert.equal(result.workspaceId, INSTANCE_WS);
  assert.equal(result.vaultId, "v-invitee");
  assert.equal(result.acceptedWorkspaceId, INSTANCE_WS);
  assert.equal(createdPersonalWorkspace, false);
});

test("updateInstance rejects open registration mode on self-hosted", async () => {
  class MemoryStore {
    row: ServerInstanceSettingsRow = {
      registrationMode: "invite_only",
      setupCompletedAt: null,
      workspaceId: null,
      updatedAt: new Date().toISOString(),
    };
    async read() {
      return this.row;
    }
    async writeRegistrationMode(mode: RegistrationMode) {
      if (mode === "open") throw new Error("open blocked");
      this.row = { ...this.row, registrationMode: mode };
      return this.row;
    }
    async markSetupCompleted(completedAt: string) {
      this.row = { ...this.row, setupCompletedAt: completedAt };
      return this.row;
    }
    async markSetupCompletedWithWorkspace(completedAt: string, workspaceId: string) {
      this.row = {
        ...this.row,
        setupCompletedAt: completedAt,
        workspaceId,
        registrationMode: "invite_only",
      };
      return this.row;
    }
  }

  const store = new MemoryStore();
  const service = new SetupService({
    redis: memoryRedis(),
    users: { hasAnyUsers: async () => false, findByEmail: async () => null },
    instanceSettings: store,
    mailSettings: {
      getPublicSettings: async () =>
        ({
          publicAppUrl: "https://vault.example.com",
          smtpActive: false,
        }) as never,
      updateForSetup: async () => {
        throw new Error("unused");
      },
      sendTestEmailForSetup: async () => {
        throw new Error("unused");
      },
      skipMailForSetup: async () => {
        throw new Error("unused");
      },
      updatePublicAppUrlPreservingVerification: async () => {},
    },
    authService: {
      claimEmptyCatalogBootstrap: async () => true,
      createRegistrationAuthStateForTrustedEmail: async () => "auth",
    },
    sessionService: { createSession: async () => ({ accessToken: "t", expiresAt: "", scope: null }) },
    workspaceSettings: { updateSettings: async () => ({}) as never },
    workspaceMembers: {
      createInvitations: async () => [],
      hasPendingInvitationForEmail: async () => false,
      deliverPendingInvitationEmails: async () => ({ delivered: 0 }),
    },
    postgres: {
      query: async () => [],
      transaction: async (fn) => fn({ query: async () => [] }),
    },
    config: {
      deploymentMode: "self_hosted",
      nodeEnv: "test",
      registrationAuthStateTtlSeconds: 3600,
      sessionTtlSeconds: 3600,
      setupCodePlaintext: "aaaa-bbbb-cccc-dddd",
    },
  });

  await service.ensureBootstrapCode();
  const verified = await service.verifyCode("aaaa-bbbb-cccc-dddd");
  await assert.rejects(
    () =>
      service.updateInstance(verified.setupToken, {
        registrationMode: "open",
      }),
    (error: unknown) => error instanceof SetupError && error.code === "REGISTRATION_MODE_LOCKED",
  );
  const instance = await service.getInstance(verified.setupToken);
  assert.equal(instance.registrationMode, "invite_only");
  assert.equal(await service.getRegistrationMode(), "invite_only");
});

function membersQueryForWorkspace(workspaceId: string, blockOps: string[]): QueryExecutor["query"] {
  return async (sql, params = []) => {
    const normalized = sql.replace(/\s+/g, " ");
    if (normalized.includes("FROM workspaces") && normalized.includes("WHERE id")) {
      return [
        {
          id: workspaceId,
          name: "Acme",
          owner_id: OWNER_ID,
          plan_tier: "ENTERPRISE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ] as never;
    }
    if (normalized.includes("FROM workspace_members") && normalized.includes("user_id")) {
      return [{ id: "wm-1", invited_by_user_id: OWNER_ID }] as never;
    }
    if (normalized.includes("permissions_json") || normalized.includes("FROM roles")) {
      return [
        {
          permissions_json: {
            members: { get: 1, post: 1, put: 1, delete: 1 },
            settings: { get: 1, post: 1, put: 1, delete: 1 },
            vaults: { get: 1, post: 1, put: 1, delete: 1 },
            roles: { get: 1, post: 1, put: 1, delete: 1 },
            profiles: { get: 1, post: 1, put: 1, delete: 1 },
            billing: { get: 1, post: 1, put: 1, delete: 1 },
            settings_mail: { get: 1, post: 0, put: 1, delete: 0 },
            settings_items: { get: 1, post: 0, put: 1, delete: 0 },
            settings_capsules: { get: 1, post: 0, put: 1, delete: 0 },
          },
        },
      ] as never;
    }
    if (normalized.includes("FROM server_instance_settings")) {
      return [
        {
          workspace_id: INSTANCE_WS,
          setup_completed_at: new Date().toISOString(),
          registration_mode: "invite_only",
        },
      ] as never;
    }
    if (normalized.includes("UPDATE users") && normalized.includes("blocked_at")) {
      blockOps.push(`block:${params[0]}`);
      return [] as never;
    }
    if (normalized.includes("UPDATE devices") && normalized.includes("revoked")) {
      blockOps.push("revoke-devices");
      return [] as never;
    }
    if (normalized.includes("DELETE FROM sessions")) {
      blockOps.push("revoke-sessions");
      return [] as never;
    }
    if (normalized.includes("DELETE FROM")) {
      blockOps.push("delete");
      return [] as never;
    }
    return [] as never;
  };
}

test("removeMember on instance workspace blocks account and revokes sessions", async () => {
  const ops: string[] = [];
  const query = membersQueryForWorkspace(INSTANCE_WS, ops);
  const service = new WorkspaceMembersService({
    db: { query, transaction: async (fn) => fn({ query }) },
    workspaces: {
      findById: async () => ({
        id: INSTANCE_WS,
        name: "Acme",
        ownerId: OWNER_ID,
        planTier: "ENTERPRISE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
    },
    publicAppBaseUrl: "http://localhost:5173",
    config: entitlementConfig(),
    deploymentMode: "self_hosted",
  });

  await service.removeMember(INSTANCE_WS, OWNER_ID, MEMBER_ID);
  assert.ok(ops.includes("delete"));
  assert.ok(ops.includes(`block:${MEMBER_ID}`));
  assert.ok(ops.includes("revoke-devices"));
  assert.ok(ops.includes("revoke-sessions"));
});

test("saas removeMember never blocks the account", async () => {
  const ops: string[] = [];
  const query = membersQueryForWorkspace(INSTANCE_WS, ops);
  const service = new WorkspaceMembersService({
    db: { query, transaction: async (fn) => fn({ query }) },
    workspaces: {
      findById: async () => ({
        id: INSTANCE_WS,
        name: "Acme",
        ownerId: OWNER_ID,
        planTier: "ENTERPRISE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
    },
    publicAppBaseUrl: "http://localhost:5173",
    config: entitlementConfig(),
    deploymentMode: "saas",
  });

  await service.removeMember(INSTANCE_WS, OWNER_ID, MEMBER_ID);
  assert.ok(ops.includes("delete"));
  assert.equal(ops.some((op) => op.startsWith("block:")), false);
});

test("instance access guard denies blocked users and non-members", async () => {
  const blockedDb: QueryExecutor = {
    query: async (sql) => {
      if (sql.includes("SELECT blocked_at")) {
        return [{ blocked_at: new Date().toISOString() }];
      }
      return [];
    },
  };
  await assert.rejects(
    () =>
      assertSelfHostedInstanceAccess(blockedDb, {
        deploymentMode: "self_hosted",
        userId: MEMBER_ID,
      }),
    (error: unknown) => error instanceof InstanceAccessError && error.code === "ACCOUNT_BLOCKED",
  );

  const memberDb: QueryExecutor = {
    query: async (sql) => {
      if (sql.includes("SELECT blocked_at")) {
        return [{ blocked_at: null }];
      }
      if (sql.includes("FROM server_instance_settings")) {
        return [
          {
            workspace_id: INSTANCE_WS,
            setup_completed_at: new Date().toISOString(),
            registration_mode: "invite_only",
          },
        ];
      }
      if (sql.includes("EXISTS")) {
        return [{ ok: false }];
      }
      return [];
    },
  };
  assert.equal(
    await hasSelfHostedInstanceAccess(memberDb, {
      deploymentMode: "self_hosted",
      userId: MEMBER_ID,
    }),
    false,
  );
  assert.equal(
    await hasSelfHostedInstanceAccess(memberDb, {
      deploymentMode: "saas",
      userId: MEMBER_ID,
    }),
    true,
  );
});

test("login denies blocked accounts via AuthService", async () => {
  const auth = new AuthServiceClass({
    redis: memoryRedis(),
    users: {
      findByEmail: async () =>
        ({
          id: MEMBER_ID,
          email: "blocked@example.com",
          publicKey: "pk",
          publicPqKey: null,
          locale: null,
          createdAt: "",
          updatedAt: "",
        }) as never,
      hasAnyUsers: async () => true,
      isTwoFactorEnabled: async () => false,
    },
    emailTemplates: { sendAuthEmailCode: async () => {} },
    config: createTestApiConfig({ deploymentMode: "self_hosted" }),
    resolveEmailDeliverable: async () => true,
    resolveInstanceLoginAllowed: async () => false,
  });

  await assert.rejects(
    () =>
      auth.startEmailLogin({
        email: "blocked@example.com",
        requestIp: "127.0.0.1",
      }),
    (error: unknown) => error instanceof AuthError && error.code === "ACCOUNT_BLOCKED",
  );
});

test("blockAccountAndRevokeAccess clears sessions and devices in one tx", async () => {
  const ops: string[] = [];
  const tx: QueryExecutor = {
    query: async (sql, params = []) => {
      if (sql.includes("UPDATE users")) ops.push(`users:${params[0]}`);
      if (sql.includes("UPDATE devices")) ops.push("devices");
      if (sql.includes("DELETE FROM sessions")) ops.push("sessions");
      return [];
    },
  };
  await blockAccountAndRevokeAccess(tx, MEMBER_ID, new Date().toISOString());
  assert.deepEqual(ops, [`users:${MEMBER_ID}`, "devices", "sessions"]);
});

async function skipIfPostgresDown(t: TestContext): Promise<boolean> {
  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 1500 });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    t.skip(`Postgres unavailable (${message})`);
    return true;
  }
}

type SqlQuery = <T>(sql: string, params?: unknown[]) => Promise<T[]>;

async function withSchema(
  run: (ctx: { db: PostgresDatabase; query: SqlQuery }) => Promise<void>,
): Promise<void> {
  const { Client } = (await import("pg")) as {
    Client: new (opts: { connectionString: string }) => {
      connect(): Promise<void>;
      query(
        sql: string,
        params?: unknown[],
      ): Promise<{ rows: unknown[]; rowCount: number | null }>;
      end(): Promise<void>;
    };
  };
  const schema = `mig_sh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const query: SqlQuery = async <T>(sql: string, params: unknown[] = []) => {
    const result = await client.query(sql, params);
    return result.rows as T[];
  };
  const db = {
    async query<T extends Record<string, unknown>>(sql: string, params?: unknown[]) {
      return query<T>(sql, params);
    },
    async transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
      await client.query("BEGIN");
      try {
        const value = await fn({ query });
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    },
  } as PostgresDatabase;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await run({ db, query });
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
}

async function seedBeta3UpgradeFixture(query: SqlQuery): Promise<{
  ownerId: string;
  otherOwnerId: string;
  memberId: string;
  instanceWs: string;
}> {
  // Simulate v1.0.0-beta.3 → apply through 0059, seed users, then 0062+0063 DDL.
  // Do not hand-set setup_completed_at: upgrades from beta.3 leave it NULL.
  const files = readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b));
  const through59 = files.filter((name) => name.localeCompare("0059_") < 0 || name.startsWith("0059_"));
  for (const name of through59) {
    await query(readFileSync(path.join(migrationsDir, name), "utf8"));
  }

  const ownerId = "1100000000000000001";
  const otherOwnerId = "1100000000000000002";
  const memberId = "1100000000000000003";
  const instanceWs = "1200000000000000001";
  const extraWs = "1200000000000000002";
  const memberPersonalWs = "1200000000000000003";

  await query(
    `
      INSERT INTO users (id, email, public_key, encrypted_private_key, server_key_share, created_at)
      VALUES
        ($1, 'owner@example.com', 'pk', decode('00', 'hex'), decode('00', 'hex'), '2024-01-01T00:00:00Z'),
        ($2, 'other@example.com', 'pk', decode('00', 'hex'), decode('00', 'hex'), '2024-01-02T00:00:00Z'),
        ($3, 'member@example.com', 'pk', decode('00', 'hex'), decode('00', 'hex'), '2024-01-03T00:00:00Z')
    `,
    [ownerId, otherOwnerId, memberId],
  );
  await query(
    `
      INSERT INTO workspaces (id, name, owner_id, plan_tier, created_at)
      VALUES
        ($1, 'Acme', $4, 'FREE', '2024-01-01T00:00:00Z'),
        ($2, 'Personal', $5, 'FREE', '2024-01-02T00:00:00Z'),
        ($3, 'Personal', $6, 'FREE', '2024-01-03T00:00:00Z')
    `,
    [instanceWs, extraWs, memberPersonalWs, ownerId, otherOwnerId, memberId],
  );
  const roleId = "1300000000000000001";
  await query(
    `
      INSERT INTO roles (id, workspace_id, name, permissions_json, is_system, builtin_key)
      VALUES ($1, $2, 'User', '{}'::jsonb, true, 'user')
    `,
    [roleId, instanceWs],
  );
  await query(
    `
      INSERT INTO workspace_members (id, workspace_id, user_id, role_id)
      VALUES ($1, $2, $3, $4)
    `,
    ["1400000000000000001", instanceWs, memberId, roleId],
  );
  await query(
    `
      INSERT INTO vaults (id, workspace_id, name, is_personal, owner_id, crypto_version)
      VALUES
        ('1500000000000000001', $1, 'Personal vault', true, $2, 2),
        ('1500000000000000002', $3, 'Extra vault', true, $4, 2),
        ('1500000000000000003', $5, 'Member personal', true, $6, 2)
    `,
    [instanceWs, ownerId, extraWs, otherOwnerId, memberPersonalWs, memberId],
  );
  await query(
    `
      INSERT INTO items (id, vault_id, encrypted_data)
      VALUES ('1600000000000000001', '1500000000000000002', decode('00', 'hex'))
    `,
  );

  const from60 = files.filter((name) => name.localeCompare("0060_") >= 0);
  for (const name of from60) {
    await query(readFileSync(path.join(migrationsDir, name), "utf8"));
  }

  const settings = await query<{
    setup_completed_at: string | Date | null;
    workspace_id: string | null;
    registration_mode: string;
    legacy_upgrade_pending: boolean;
  }>(
    `
      SELECT setup_completed_at, workspace_id, registration_mode, legacy_upgrade_pending
      FROM server_instance_settings
      WHERE id = TRUE
    `,
  );
  assert.equal(settings[0]?.setup_completed_at ?? null, null);
  assert.equal(settings[0]?.workspace_id ?? null, null);
  assert.equal(settings[0]?.registration_mode, "invite_only");
  // Users existed before 0063 → one-shot legacy upgrade flag.
  assert.equal(settings[0]?.legacy_upgrade_pending, true);

  return { ownerId, otherOwnerId, memberId, instanceWs };
}

test("self-hosted startup cleanup backfills instance workspace after beta.3 upgrade", async (t) => {
  if (await skipIfPostgresDown(t)) {
    return;
  }
  initEntityIdGenerator(1);

  await withSchema(async ({ db, query }) => {
    const seeded = await seedBeta3UpgradeFixture(query);

    const first = await ensureSelfHostedInstanceWorkspace({
      db,
      deploymentMode: "self_hosted",
    });
    assert.equal(first.ran, true);
    assert.equal(first.workspaceId, seeded.instanceWs);

    const settings = await readInstanceSettings(db);
    assert.equal(settings.workspaceId, seeded.instanceWs);
    assert.ok(settings.setupCompletedAt);
    const flag = await query<{ legacy_upgrade_pending: boolean }>(
      `SELECT legacy_upgrade_pending FROM server_instance_settings WHERE id = TRUE`,
    );
    assert.equal(flag[0]?.legacy_upgrade_pending, false);

    const workspaces = await query<{ id: string }>(`SELECT id FROM workspaces ORDER BY id`);
    assert.deepEqual(
      workspaces.map((w) => w.id),
      [seeded.instanceWs],
    );

    const memberVaults = await query<{ id: string }>(
      `
        SELECT id FROM vaults
        WHERE workspace_id = $1 AND is_personal = TRUE AND owner_id = $2
      `,
      [seeded.instanceWs, seeded.memberId],
    );
    assert.equal(memberVaults.length, 1);

    const other = await query<{ blocked_at: string | Date | null }>(
      `SELECT blocked_at FROM users WHERE id = $1`,
      [seeded.otherOwnerId],
    );
    assert.ok(other[0]?.blocked_at);

    const member = await query<{ blocked_at: string | Date | null }>(
      `SELECT blocked_at FROM users WHERE id = $1`,
      [seeded.memberId],
    );
    assert.equal(member[0]?.blocked_at ?? null, null);

    const second = await ensureSelfHostedInstanceWorkspace({
      db,
      deploymentMode: "self_hosted",
    });
    assert.equal(second.ran, false);
    assert.equal(second.workspaceId, seeded.instanceWs);
    const again = await query<{ id: string }>(`SELECT id FROM workspaces`);
    assert.equal(again.length, 1);
  });
});

test("mid-wizard restart does not complete setup when legacy_upgrade_pending is false", async (t) => {
  if (await skipIfPostgresDown(t)) {
    return;
  }
  await withSchema(async ({ db, query }) => {
    await applySqlMigrations(db, {
      migrationsDir,
      logger: { info() {}, warn() {}, error() {} },
    });

    const flagBeforeUsers = await query<{ legacy_upgrade_pending: boolean }>(
      `SELECT legacy_upgrade_pending FROM server_instance_settings WHERE id = TRUE`,
    );
    assert.equal(flagBeforeUsers[0]?.legacy_upgrade_pending, false);

    const ownerId = "4100000000000000001";
    const workspaceId = "4200000000000000001";
    const vaultId = "4300000000000000001";
    const deviceId = "4400000000000000001";
    const ownerEmail = "wizard-owner@example.com";

    await query(
      `
        INSERT INTO users (id, email, public_key, encrypted_private_key, server_key_share)
        VALUES ($1, $2, 'pk', decode('00', 'hex'), decode('00', 'hex'))
      `,
      [ownerId, ownerEmail],
    );
    await query(
      `
        INSERT INTO workspaces (id, name, owner_id, plan_tier)
        VALUES ($1, 'Pending Wizard', $2, 'FREE')
      `,
      [workspaceId, ownerId],
    );
    await query(
      `
        INSERT INTO vaults (id, workspace_id, name, is_personal, owner_id, crypto_version)
        VALUES ($1, $2, 'Personal vault', true, $3, 2)
      `,
      [vaultId, workspaceId, ownerId],
    );
    await query(
      `
        INSERT INTO devices (
          id, user_id, device_fingerprint, device_name, device_public_key, device_share,
          platform, os_name, os_version, app_version, client_type, user_agent,
          ip_first, ip_last, status
        )
        VALUES (
          $1, $2, 'fp', 'Owner device', 'dpk', decode('00', 'hex'),
          'web', 'linux', '1', '1', 'web', 'ua',
          '127.0.0.1', '127.0.0.1', 'trusted'
        )
      `,
      [deviceId, ownerId],
    );
    await query(
      `
        INSERT INTO user_vault_recovery_wrap (user_id, encrypted_blob, exported_at)
        VALUES ($1, '{}'::jsonb, now())
      `,
      [ownerId],
    );

    // Owner registered, finish not called — fresh install flag stays FALSE.
    await query(
      `
        UPDATE server_instance_settings
        SET setup_completed_at = NULL, workspace_id = NULL, legacy_upgrade_pending = FALSE
        WHERE id = TRUE
      `,
    );

    const result = await ensureSelfHostedInstanceWorkspace({
      db,
      deploymentMode: "self_hosted",
    });
    assert.equal(result.ran, false);
    assert.equal(result.workspaceId, null);

    const settings = await query<{
      setup_completed_at: string | Date | null;
      workspace_id: string | null;
      legacy_upgrade_pending: boolean;
    }>(
      `
        SELECT setup_completed_at, workspace_id, legacy_upgrade_pending
        FROM server_instance_settings
        WHERE id = TRUE
      `,
    );
    assert.equal(settings[0]?.setup_completed_at ?? null, null);
    assert.equal(settings[0]?.workspace_id ?? null, null);
    assert.equal(settings[0]?.legacy_upgrade_pending, false);

    const { PostgresServerInstanceSettingsStore } = await import("../src/setup/store.ts");
    const redis = memoryRedis();
    const setupService = new SetupService({
      redis,
      users: {
        hasAnyUsers: async () => true,
        findByEmail: async (email) =>
          email === ownerEmail
            ? ({ id: ownerId, email: ownerEmail } as never)
            : null,
      },
      instanceSettings: new PostgresServerInstanceSettingsStore(db),
      mailSettings: {
        getPublicSettings: async () => ({
          smtpHost: "",
          smtpPort: 587,
          smtpTlsMode: "starttls" as const,
          smtpUsername: "",
          emailFrom: "",
          publicAppUrl: "https://app.example",
          passwordSet: false,
          passwordUnreadable: false,
          smtpActive: false,
          smtpVerifiedAt: null,
        }),
        updateForSetup: async () => {
          throw new Error("not used");
        },
        sendTestEmailForSetup: async () => {
          throw new Error("not used");
        },
        skipMailForSetup: async () => {
          throw new Error("not used");
        },
        updatePublicAppUrlPreservingVerification: async () => {
          throw new Error("not used");
        },
      },
      authService: {
        claimEmptyCatalogBootstrap: async () => false,
        createRegistrationAuthStateForTrustedEmail: async () => "unused",
      },
      sessionService: createMockSessionService(),
      workspaceSettings: {
        updateSettings: async () => {
          throw new Error("not used");
        },
      },
      workspaceMembers: {
        createInvitations: async () => {
          throw new Error("not used");
        },
        hasPendingInvitationForEmail: async () => false,
        deliverPendingInvitationEmails: async () => ({ delivered: 0 }),
      },
      postgres: db,
      config: {
        deploymentMode: "self_hosted",
        nodeEnv: "test",
        registrationAuthStateTtlSeconds: 3600,
        sessionTtlSeconds: 3600,
        setupCodePlaintext: "aaaa-bbbb-cccc-dddd",
      },
    });

    await setupService.ensureBootstrapCode();
    const verified = await setupService.verifyCode("aaaa-bbbb-cccc-dddd");
    const begun = await setupService.beginRegistration(verified.setupToken, ownerEmail);
    assert.equal(begun.alreadyRegistered, true);
    assert.equal(begun.authStateId, undefined);

    // Resume finish still works after the no-op cleanup.
    const finished = await setupService.finish(verified.setupToken, {
      workspaceName: "Resumed Wizard",
      tileColor: "#112233",
      invitations: [],
    });
    assert.equal(finished.workspaceId, workspaceId);
    assert.equal(finished.signInRequired, true);
    const after = await readInstanceSettings(db);
    assert.equal(after.workspaceId, workspaceId);
    assert.ok(after.setupCompletedAt);
  });
});

test("completed wizard without workspace_id still gets cleanup", async (t) => {
  if (await skipIfPostgresDown(t)) {
    return;
  }
  initEntityIdGenerator(1);
  await withSchema(async ({ db, query }) => {
    await applySqlMigrations(db, {
      migrationsDir,
      logger: { info() {}, warn() {}, error() {} },
    });

    const ownerId = "5100000000000000001";
    const workspaceId = "5200000000000000001";
    await query(
      `
        INSERT INTO users (id, email, public_key, encrypted_private_key, server_key_share)
        VALUES ($1, 'finished@example.com', 'pk', decode('00', 'hex'), decode('00', 'hex'))
      `,
      [ownerId],
    );
    await query(
      `
        INSERT INTO workspaces (id, name, owner_id, plan_tier)
        VALUES ($1, 'Finished', $2, 'FREE')
      `,
      [workspaceId, ownerId],
    );
    // Finished before this PR: setup_completed_at set, workspace_id still null.
    await query(
      `
        UPDATE server_instance_settings
        SET setup_completed_at = now(),
            workspace_id = NULL,
            legacy_upgrade_pending = FALSE
        WHERE id = TRUE
      `,
    );

    const result = await ensureSelfHostedInstanceWorkspace({
      db,
      deploymentMode: "self_hosted",
    });
    assert.equal(result.ran, true);
    assert.equal(result.workspaceId, workspaceId);
    const settings = await readInstanceSettings(db);
    assert.equal(settings.workspaceId, workspaceId);
    assert.ok(settings.setupCompletedAt);
  });
});

test("saas startup leaves workspaces untouched even when setup_completed_at is set", async (t) => {
  if (await skipIfPostgresDown(t)) {
    return;
  }
  await withSchema(async ({ db, query }) => {
    await applySqlMigrations(db, {
      migrationsDir,
      logger: { info() {}, warn() {}, error() {} },
    });

    const ownerId = "2100000000000000001";
    const ws1 = "2200000000000000001";
    const ws2 = "2200000000000000002";
    await query(
      `
        INSERT INTO users (id, email, public_key, encrypted_private_key, server_key_share)
        VALUES ($1, 'saas@example.com', 'pk', decode('00', 'hex'), decode('00', 'hex'))
      `,
      [ownerId],
    );
    await query(
      `
        INSERT INTO workspaces (id, name, owner_id, plan_tier)
        VALUES ($1, 'A', $3, 'FREE'), ($2, 'B', $3, 'FREE')
      `,
      [ws1, ws2, ownerId],
    );
    // SaaS DB may have setup_completed_at set from shared schema; cleanup must still no-op.
    await query(
      `
        UPDATE server_instance_settings
        SET setup_completed_at = now(),
            workspace_id = NULL,
            legacy_upgrade_pending = TRUE
        WHERE id = TRUE
      `,
    );

    const result = await ensureSelfHostedInstanceWorkspace({
      db,
      deploymentMode: "saas",
    });
    assert.equal(result.ran, false);

    const workspaces = await query<{ id: string }>(`SELECT id FROM workspaces ORDER BY id`);
    assert.equal(workspaces.length, 2);
    const settings = await readInstanceSettings(db);
    assert.equal(settings.workspaceId, null);
    const flag = await query<{ legacy_upgrade_pending: boolean }>(
      `SELECT legacy_upgrade_pending FROM server_instance_settings WHERE id = TRUE`,
    );
    assert.equal(flag[0]?.legacy_upgrade_pending, true);
  });
});

test("migration 0063 is DDL-only and does not delete workspaces", async (t) => {
  if (await skipIfPostgresDown(t)) {
    return;
  }
  await withSchema(async ({ db, query }) => {
    await applySqlMigrations(db, {
      migrationsDir,
      logger: { info() {}, warn() {}, error() {} },
    });
    const ownerId = "3100000000000000001";
    const ws1 = "3200000000000000001";
    const ws2 = "3200000000000000002";
    await query(
      `
        INSERT INTO users (id, email, public_key, encrypted_private_key, server_key_share)
        VALUES ($1, 'ddl@example.com', 'pk', decode('00', 'hex'), decode('00', 'hex'))
      `,
      [ownerId],
    );
    await query(
      `
        INSERT INTO workspaces (id, name, owner_id, plan_tier)
        VALUES ($1, 'A', $3, 'FREE'), ($2, 'B', $3, 'FREE')
      `,
      [ws1, ws2, ownerId],
    );
    await query(
      `
        UPDATE server_instance_settings
        SET setup_completed_at = now(),
            workspace_id = NULL,
            registration_mode = 'open',
            legacy_upgrade_pending = FALSE
        WHERE id = TRUE
      `,
    );

    const mig63 = readdirSync(migrationsDir).find((n) => n.startsWith("0063_"))!;
    await query(readFileSync(path.join(migrationsDir, mig63), "utf8"));

    const workspaces = await query<{ id: string }>(`SELECT id FROM workspaces`);
    assert.equal(workspaces.length, 2);
    const settings = await readInstanceSettings(db);
    assert.equal(settings.workspaceId, null);
    assert.equal(settings.registrationMode, "invite_only");
    const flag = await query<{ legacy_upgrade_pending: boolean }>(
      `SELECT legacy_upgrade_pending FROM server_instance_settings WHERE id = TRUE`,
    );
    // setup_completed_at already set → migration does not force the legacy flag.
    assert.equal(flag[0]?.legacy_upgrade_pending, false);
  });
});

test("createAuthStateForExistingUser denies blocked accounts (passkey path)", async () => {
  const auth = new AuthServiceClass({
    redis: memoryRedis(),
    users: {
      findByEmail: async () => null,
      hasAnyUsers: async () => true,
      isTwoFactorEnabled: async () => false,
    },
    emailTemplates: { sendAuthEmailCode: async () => {} },
    config: createTestApiConfig({ deploymentMode: "self_hosted" }),
    resolveEmailDeliverable: async () => true,
    resolveInstanceLoginAllowed: async () => false,
  });

  await assert.rejects(
    () =>
      auth.createAuthStateForExistingUser({
        email: "blocked@example.com",
        userId: MEMBER_ID,
        pendingTwoFactor: false,
      }),
    (error: unknown) => error instanceof AuthError && error.code === "ACCOUNT_BLOCKED",
  );
});

test("SessionService.createSession refuses users without instance access", async () => {
  const created: string[] = [];
  const sessions = {
    createSession: async (input: { userId: string }) => {
      created.push(input.userId);
    },
    findValidByTokenHash: async () => null,
    bindDevice: async () => false,
    deleteByDeviceId: async () => 0,
    deleteByTokenHash: async () => false,
    markRecoveryProved: async () => false,
    setRecoveryChallenge: async () => false,
    consumeRecoveryChallenge: async () => false,
  };
  const service = new SessionService({
    sessions: sessions as never,
    config: { sessionTtlSeconds: 3600 },
    assertInstanceAccess: async (userId) => userId !== MEMBER_ID,
  });

  await assert.rejects(
    () => service.createSession(MEMBER_ID),
    (error: unknown) =>
      error instanceof SessionServiceError && error.code === "ACCOUNT_BLOCKED",
  );
  assert.deepEqual(created, []);

  const ok = await service.createSession(OWNER_ID);
  assert.ok(ok.accessToken);
  assert.deepEqual(created, [OWNER_ID]);
});

test("auth resolvers deny blocked and non-member users including unbound sessions", async () => {
  const denied = new Set([MEMBER_ID, "9990000000000000001"]);
  const sessionService = {
    resolveAccessToken: async (token: string) => {
      if (token === "blocked-token") {
        return {
          userId: MEMBER_ID,
          deviceId: null,
          scope: null,
          tokenHash: "h1",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
      }
      if (token === "nonmember-token") {
        return {
          userId: "9990000000000000001",
          deviceId: "d1",
          scope: null,
          tokenHash: "h2",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
      }
      if (token === "ok-token") {
        return {
          userId: OWNER_ID,
          deviceId: "d2",
          scope: null,
          tokenHash: "h3",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
      }
      return null;
    },
  } as unknown as SessionService;

  const resolve = createResolveAuthenticatedSession(
    { allowHeaderUserIdAuth: true },
    sessionService,
    undefined,
    {
      allowUnboundDevice: true,
      assertUserInstanceAccess: async (userId) => !denied.has(userId),
    },
  );

  const blockedReq = {
    headers: { authorization: "Bearer blocked-token" },
  } as unknown as IncomingMessage;
  const nonMemberReq = {
    headers: { authorization: "Bearer nonmember-token" },
  } as unknown as IncomingMessage;
  const okReq = {
    headers: { authorization: "Bearer ok-token" },
  } as unknown as IncomingMessage;
  const headerBlocked = {
    headers: { "x-user-id": MEMBER_ID },
  } as unknown as IncomingMessage;

  assert.equal(await resolve(blockedReq), null);
  assert.equal(await resolve(nonMemberReq), null);
  assert.equal((await resolve(okReq))?.userId, OWNER_ID);
  assert.equal(await resolve(headerBlocked), null);
});

test("OTP verify attaches instance invite token hash for email invitations", async () => {
  const redis = memoryRedis();
  const challengeId = "challenge-email-invite";
  const code = "123456";
  const codeHash = createHash("sha256").update(`${challengeId}:${code}`, "utf8").digest("hex");
  const now = new Date();
  await redis.setWithTtl(
    `auth:challenge:${challengeId}`,
    JSON.stringify({
      id: challengeId,
      email: "invitee@example.com",
      codeHash,
      attemptsLeft: 5,
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      resendAvailableAt: new Date(now.getTime() + 30_000).toISOString(),
      createdAt: now.toISOString(),
    }),
    60,
  );

  const auth = new AuthServiceClass({
    redis,
    users: {
      findByEmail: async () => null,
      hasAnyUsers: async () => true,
      isTwoFactorEnabled: async () => false,
    },
    emailTemplates: { sendAuthEmailCode: async () => {} },
    config: createTestApiConfig({ deploymentMode: "self_hosted" }),
    resolveEmailDeliverable: async () => true,
    resolvePendingInstanceInviteTokenHash: async (email) =>
      email === "invitee@example.com" ? TOKEN_HASH : null,
  });

  const confirmed = await auth.confirmEmailCode({
    challengeId,
    code,
    requestIp: "127.0.0.1",
  });
  assert.equal(confirmed.userExists, false);
  assert.equal(confirmed.nextStep, "registration");
  const stateRaw = await redis.get(`auth:state:${confirmed.authStateId}`);
  assert.ok(stateRaw);
  const state = JSON.parse(stateRaw) as { inviteTokenHash?: string };
  assert.equal(state.inviteTokenHash, TOKEN_HASH);
});

test("OTP verify rejects registration without a single instance invite", async () => {
  const redis = memoryRedis();
  const challengeId = "challenge-no-invite";
  const code = "654321";
  const codeHash = createHash("sha256").update(`${challengeId}:${code}`, "utf8").digest("hex");
  const now = new Date();
  await redis.setWithTtl(
    `auth:challenge:${challengeId}`,
    JSON.stringify({
      id: challengeId,
      email: "stranger@example.com",
      codeHash,
      attemptsLeft: 5,
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      resendAvailableAt: new Date(now.getTime() + 30_000).toISOString(),
      createdAt: now.toISOString(),
    }),
    60,
  );

  const auth = new AuthServiceClass({
    redis,
    users: {
      findByEmail: async () => null,
      hasAnyUsers: async () => true,
      isTwoFactorEnabled: async () => false,
    },
    emailTemplates: { sendAuthEmailCode: async () => {} },
    config: createTestApiConfig({ deploymentMode: "self_hosted" }),
    resolveEmailDeliverable: async () => true,
    resolvePendingInstanceInviteTokenHash: async () => null,
  });

  await assert.rejects(
    () =>
      auth.confirmEmailCode({
        challengeId,
        code,
        requestIp: "127.0.0.1",
      }),
    (error: unknown) =>
      error instanceof AuthError && error.code === "REGISTRATION_INVITE_REQUIRED",
  );
});
