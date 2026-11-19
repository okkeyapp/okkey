import assert from "node:assert/strict";
import test from "node:test";
import { hashSetupCode } from "../src/setup/codes.ts";
import { SetupError, SetupService } from "../src/setup/service.ts";
import type { RegistrationMode, ServerInstanceSettingsRow } from "../src/setup/types.ts";

class InMemoryRedis {
  private readonly values = new Map<string, string>();

  async setWithTtl(key: string, value: string, _ttlSeconds: number): Promise<void> {
    this.values.set(key, value);
  }

  async setIfNotExistsWithTtl(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.values.has(key)) {
      return false;
    }
    await this.setWithTtl(key, value, ttlSeconds);
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const next = Number(this.values.get(key) ?? "0") + 1;
    this.values.set(key, String(next));
    return next;
  }

  async expire(_key: string, _seconds: number): Promise<boolean> {
    return true;
  }
}

class MemoryInstanceStore {
  row: ServerInstanceSettingsRow = {
    registrationMode: "open",
    setupCompletedAt: null,
    updatedAt: new Date().toISOString(),
  };

  async read() {
    return this.row;
  }

  async writeRegistrationMode(mode: RegistrationMode) {
    this.row = { ...this.row, registrationMode: mode, updatedAt: new Date().toISOString() };
    return this.row;
  }

  async markSetupCompleted(completedAt: string) {
    this.row = {
      ...this.row,
      setupCompletedAt: this.row.setupCompletedAt ?? completedAt,
      updatedAt: new Date().toISOString(),
    };
    return this.row;
  }
}

type InvitationRow = {
  id: string;
  workspace_id: string;
  email: string;
  role_id: string;
  invited_by_user_id: string;
  token_hash: string;
  status: string;
  expires_at: string;
  delivery_status: string;
  delivery_method: string;
};

class MemoryPostgres {
  recoveryExported = true;
  roles: Array<{ id: string; builtin_key: string }> = [
    { id: "role-admin", builtin_key: "admin" },
    { id: "role-user", builtin_key: "user" },
  ];
  invitations: InvitationRow[] = [];
  workspaceUpdates: Array<{ name: string; tile_color: string; workspace_id: string }> = [];
  setupCompletedAt: string | null = null;
  failOnInviteInsert = false;

  private async handleQuery<T extends Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("from user_vault_recovery_wrap")) {
      return (
        this.recoveryExported
          ? [{ exported_at: new Date().toISOString() }]
          : [{ exported_at: null }]
      ) as T[];
    }

    if (normalized.includes("update workspaces") && normalized.includes("tile_color")) {
      this.workspaceUpdates.push({
        name: String(params[0]),
        tile_color: String(params[1]),
        workspace_id: String(params[2]),
      });
      return [] as T[];
    }

    if (normalized.includes("from roles") && normalized.includes("builtin_key")) {
      return this.roles as unknown as T[];
    }

    if (normalized.includes("insert into workspace_invitations")) {
      if (this.failOnInviteInsert) {
        throw new Error("invite insert failed");
      }
      this.invitations.push({
        id: String(params[0]),
        workspace_id: String(params[1]),
        email: String(params[2]),
        role_id: String(params[3]),
        invited_by_user_id: String(params[4]),
        token_hash: String(params[5]),
        status: "pending",
        expires_at: String(params[6]),
        delivery_status: "pending",
        delivery_method: "email",
      });
      return [] as T[];
    }

    if (normalized.includes("update server_instance_settings") && normalized.includes("setup_completed_at")) {
      this.setupCompletedAt = this.setupCompletedAt ?? String(params[0]);
      return [{ setup_completed_at: this.setupCompletedAt }] as T[];
    }

    if (normalized.includes("insert into workspace_member_item_category_preferences")) {
      return [] as T[];
    }

    return [] as T[];
  }

  async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.handleQuery<T>(sql, params);
  }

  async transaction<T>(
    fn: (tx: {
      query<R extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<R[]>;
    }) => Promise<T>,
  ): Promise<T> {
    const snapshot = {
      invitations: this.invitations.map((row) => ({ ...row })),
      workspaceUpdates: this.workspaceUpdates.map((row) => ({ ...row })),
      setupCompletedAt: this.setupCompletedAt,
    };
    try {
      return await fn({
        query: async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
          this.handleQuery<R>(sql, params),
      });
    } catch (error) {
      this.invitations = snapshot.invitations;
      this.workspaceUpdates = snapshot.workspaceUpdates;
      this.setupCompletedAt = snapshot.setupCompletedAt;
      throw error;
    }
  }
}

function createService(overrides: {
  redis?: InMemoryRedis;
  hasAnyUsers?: boolean;
  setupCodePlaintext?: string;
  postgres?: MemoryPostgres;
} = {}) {
  const redis = overrides.redis ?? new InMemoryRedis();
  const instanceSettings = new MemoryInstanceStore();
  const postgres = overrides.postgres ?? new MemoryPostgres();
  const service = new SetupService({
    redis,
    users: {
      hasAnyUsers: async () => overrides.hasAnyUsers ?? false,
      findByEmail: async () => null,
    },
    instanceSettings,
    mailSettings: {
      getPublicSettings: async () => ({
        smtpHost: "",
        smtpPort: 587,
        smtpTlsMode: "starttls",
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
      claimEmptyCatalogBootstrap: async () => true,
      createRegistrationAuthStateForTrustedEmail: async () => "auth-state-1",
    },
    sessionService: {
      createSession: async () => ({
        accessToken: "full-token",
        expiresAt: new Date().toISOString(),
        scope: null,
      }),
    },
    workspaceSettings: {
      updateSettings: async () => {
        throw new Error("not used");
      },
    },
    workspaceMembers: {
      createInvitations: async () => ({ created: [], deliveryStatus: "pending" as const }),
      hasPendingInvitationForEmail: async () => false,
    },
    postgres,
    config: {
      deploymentMode: "self_hosted",
      nodeEnv: "test",
      registrationAuthStateTtlSeconds: 3600,
      sessionTtlSeconds: 3600,
      setupCodeMaxAttempts: 3,
      setupCodePlaintext: overrides.setupCodePlaintext ?? "aaaa-bbbb-cccc-dddd",
    },
    generateSessionId: () => "setup-session-1",
  });
  return { service, redis, instanceSettings, postgres };
}

async function seedReadyToFinish(overrides: { postgres?: MemoryPostgres } = {}) {
  const seeded = createService({
    setupCodePlaintext: "aaaa-bbbb-cccc-dddd",
    postgres: overrides.postgres,
  });
  await seeded.service.ensureBootstrapCode();
  const verified = await seeded.service.verifyCode("aaaa-bbbb-cccc-dddd");
  const sessionRaw = await seeded.redis.get(`setup:session:${verified.setupToken}`);
  assert.ok(sessionRaw);
  const session = JSON.parse(sessionRaw) as {
    id: string;
    createdAt: string;
    ownerEmail?: string;
    authStateId?: string;
  };
  session.ownerEmail = "owner@example.com";
  session.authStateId = "auth-state-finish";
  await seeded.redis.setWithTtl(`setup:session:${verified.setupToken}`, JSON.stringify(session), 3600);
  await seeded.redis.setWithTtl(
    "registration:result:auth-state-finish",
    JSON.stringify({
      userId: "user-1",
      workspaceId: "ws-1",
      vaultId: "vault-1",
      deviceId: "device-1",
    }),
    3600,
  );
  return {
    ...seeded,
    setupToken: verified.setupToken,
  };
}

test("ensureBootstrapCode mints hash from plaintext env without logging plaintext via hash lookup", async () => {
  const { service, redis } = createService({ setupCodePlaintext: "1111-2222-3333-4444" });
  await service.ensureBootstrapCode();
  const hash = await redis.get("setup:code:hash");
  assert.equal(hash, hashSetupCode("1111-2222-3333-4444"));
});

test("verifyCode is one-time-session gated with attempt limit", async () => {
  const { service } = createService({ setupCodePlaintext: "abcd-ef01-2345-6789" });
  await service.ensureBootstrapCode();

  await assert.rejects(
    () => service.verifyCode("wrong-code"),
    (error: unknown) => error instanceof SetupError && error.code === "SETUP_CODE_INVALID",
  );
  await assert.rejects(
    () => service.verifyCode("wrong-code-2"),
    (error: unknown) => error instanceof SetupError && error.code === "SETUP_CODE_INVALID",
  );
  await assert.rejects(
    () => service.verifyCode("wrong-code-3"),
    (error: unknown) => error instanceof SetupError && error.code === "SETUP_CODE_LOCKED",
  );

  const { service: okService } = createService({ setupCodePlaintext: "abcd-ef01-2345-6789" });
  await okService.ensureBootstrapCode();
  const verified = await okService.verifyCode("abcd-ef01-2345-6789");
  assert.ok(verified.setupToken);
  assert.ok(verified.expiresAt);
});

test("getStatus is required only for empty self-host with a code", async () => {
  const { service } = createService();
  assert.deepEqual(await service.getStatus(), { required: false, deploymentMode: "self_hosted" });
  await service.ensureBootstrapCode();
  assert.deepEqual(await service.getStatus(), { required: true, deploymentMode: "self_hosted" });

  const { service: populated } = createService({ hasAnyUsers: true });
  await populated.ensureBootstrapCode();
  assert.deepEqual(await populated.getStatus(), { required: false, deploymentMode: "self_hosted" });
});

test("requireSession stays valid after owner user exists until setup is marked complete", async () => {
  const empty = createService({ setupCodePlaintext: "aaaa-bbbb-cccc-dddd" });
  await empty.service.ensureBootstrapCode();
  const verified = await empty.service.verifyCode("aaaa-bbbb-cccc-dddd");

  const midWizard = createService({
    redis: empty.redis,
    hasAnyUsers: true,
    setupCodePlaintext: "aaaa-bbbb-cccc-dddd",
  });
  const session = await midWizard.service.requireSession(verified.setupToken);
  assert.equal(session.id, verified.setupToken);

  await midWizard.instanceSettings.markSetupCompleted(new Date().toISOString());
  await assert.rejects(
    () => midWizard.service.requireSession(verified.setupToken),
    (error: unknown) => error instanceof SetupError && error.code === "SETUP_NOT_REQUIRED",
  );
});

test("finish with invites creates pending invitations for the requested builtin roles", async () => {
  const fixture = await seedReadyToFinish();
  const result = await fixture.service.finish(fixture.setupToken, {
    workspaceName: "Acme",
    tileColor: "#112233",
    invitations: [
      { email: "admin@example.com", roleBuiltinId: "admin" },
      { email: "member@example.com", roleBuiltinId: "user" },
    ],
  });

  assert.equal(result.accessToken, "full-token");
  assert.equal(result.workspaceId, "ws-1");
  assert.equal(fixture.postgres.workspaceUpdates.length, 1);
  assert.equal(fixture.postgres.workspaceUpdates[0]?.name, "Acme");
  assert.equal(fixture.postgres.invitations.length, 2);
  assert.equal(fixture.postgres.invitations[0]?.email, "admin@example.com");
  assert.equal(fixture.postgres.invitations[0]?.role_id, "role-admin");
  assert.equal(fixture.postgres.invitations[1]?.email, "member@example.com");
  assert.equal(fixture.postgres.invitations[1]?.role_id, "role-user");
  assert.ok(fixture.instanceSettings.row.setupCompletedAt);
  // Unit fixture keeps hasAnyUsers=false; after consume the setup code hash is gone.
  assert.deepEqual(await fixture.service.getStatus(), {
    required: false,
    deploymentMode: "self_hosted",
  });
});

test("finish rolls back when invitation insert fails and leaves setup still required", async () => {
  const postgres = new MemoryPostgres();
  postgres.failOnInviteInsert = true;
  const fixture = await seedReadyToFinish({ postgres });

  await assert.rejects(
    () =>
      fixture.service.finish(fixture.setupToken, {
        workspaceName: "Acme",
        invitations: [{ email: "member@example.com", roleBuiltinId: "user" }],
      }),
    (error: unknown) => error instanceof Error && /invite insert failed/.test(error.message),
  );

  assert.equal(fixture.postgres.invitations.length, 0);
  assert.equal(fixture.postgres.workspaceUpdates.length, 0);
  assert.equal(fixture.postgres.setupCompletedAt, null);
  assert.equal(fixture.instanceSettings.row.setupCompletedAt, null);
  assert.deepEqual(await fixture.service.getStatus(), {
    required: true,
    deploymentMode: "self_hosted",
  });
  // Setup session must still be usable for a retry.
  const session = await fixture.service.requireSession(fixture.setupToken);
  assert.equal(session.id, fixture.setupToken);
});
