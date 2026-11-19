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

function createService(overrides: {
  redis?: InMemoryRedis;
  hasAnyUsers?: boolean;
  setupCodePlaintext?: string;
} = {}) {
  const redis = overrides.redis ?? new InMemoryRedis();
  const instanceSettings = new MemoryInstanceStore();
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
    postgres: {
      query: async () => [],
    },
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
  return { service, redis, instanceSettings };
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
