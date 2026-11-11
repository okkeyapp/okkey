import test from "node:test";
import assert from "node:assert/strict";
import { MASTER_PASSWORD_POLICY_VERSION } from "@okkey/types";
import type { IncomingMessage, ServerResponse } from "node:http";
import { testEntityId } from "./test-entity-id.ts";
import { createApiApp } from "../src/app.ts";
import { authStateRedisKey, AuthService } from "../src/auth/service.ts";
import { AccountRecoveryService } from "../src/account-recovery/service.ts";
import { loadConfig } from "../src/config.ts";
import { DeviceService } from "../src/device/service.ts";
import { EmailTemplateService } from "../src/email/service.ts";
import { RegistrationService } from "../src/registration/service.ts";
import { SessionService } from "../src/session/service.ts";
import { SESSION_SCOPE_REGISTRATION_RECOVERY } from "../src/session/scopes.ts";
import { VaultService } from "../src/vault/service.ts";
import { createIntegrationStorage } from "./integration-env.ts";
import { hybridDeviceShareB64 } from "./hybrid-share-fixture.ts";
import { applyMigrations, cleanupUserData, createLoggerStub } from "./two-factor-test-helpers.ts";

const MIN_ENCRYPTED_USER_IDENTITY_BYTES = 2473;
const RECOVERY_BLOB = {
  crypto_version: 2,
  algorithm: "xchacha20-poly1305",
  payload: "Y2lwaGVydGV4dA",
  meta: { entity: "vault_key_recovery_wrap", key_scope: "account" },
};

class MockResponse {
  statusCode = 200;
  body = "";

  setHeader(): void {}

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
  }
}

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

async function call(
  handler: Handler,
  method: string,
  url: string,
  token: string | null,
  body?: unknown,
  request?: { ip?: string },
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = new MockResponse();
  const headers: Record<string, string> = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  await handler(
    {
      method,
      url,
      headers,
      socket: { remoteAddress: request?.ip ?? "127.0.0.1" },
      ...(body !== undefined ? { body } : {}),
    } as IncomingMessage,
    res as unknown as ServerResponse,
  );
  const json =
    res.body.length > 0 ? (JSON.parse(res.body) as Record<string, unknown>) : {};
  return { status: res.statusCode, json };
}

async function boot(
  t: import("node:test").TestContext,
  config: ReturnType<typeof loadConfig> = loadConfig(),
) {
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return null;
  }
  await applyMigrations(storage);
  const emailTemplates = new EmailTemplateService(
    { send: async () => {} },
    {
      from: config.emailFrom,
      defaultLocale: config.defaultEmailLocale,
      publicAppBaseUrl: config.publicAppBaseUrl,
    },
  );
  const authService = new AuthService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates,
    config,
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
  });
  const registrationService = new RegistrationService({
    authService,
    users: storage.repositories.users,
    postgres: storage.postgres,
    redis: storage.redis,
    sessionService,
    config,
  });
  const accountRecoveryService = new AccountRecoveryService({
    recovery: storage.repositories.accountRecovery,
    workspaces: storage.repositories.workspaces,
    users: storage.repositories.users,
    devices: storage.repositories.devices,
    config,
  });
  const deviceService = new DeviceService({
    devices: storage.repositories.devices,
    config,
    users: storage.repositories.users,
    emailTemplates,
    log: createLoggerStub(),
  });
  const vaultService = new VaultService({
    vaults: storage.repositories.vaults,
    workspaces: storage.repositories.workspaces,
    config,
  });
  const app = createApiApp(
    config,
    createLoggerStub(),
    {
      authService,
      registrationService,
      sessionService,
      accountRecoveryService,
      deviceService,
      vaultService,
      usersRepository: storage.repositories.users,
    },
    { redis: storage.redis },
  );
  return {
    config,
    storage,
    authService,
    sessionService,
    registrationService,
    handler: app.handler() as Handler,
  };
}

async function seedAuthState(
  storage: { redis: { setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> } },
  authStateId: string,
  email: string,
): Promise<void> {
  await storage.redis.setWithTtl(
    authStateRedisKey(authStateId),
    JSON.stringify({
      id: authStateId,
      email,
      userId: null,
      createdAt: new Date().toISOString(),
    }),
    3600,
  );
}

function registerBody(authStateId: string) {
  return {
    auth_state_id: authStateId,
    user_public_key: Buffer.alloc(32, 5).toString("base64"),
    user_public_pq_key: Buffer.alloc(1184, 6).toString("base64"),
    user_public_mldsa_key: Buffer.alloc(1952, 4).toString("base64"),
    encrypted_private_key: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.from(new Uint8Array(MIN_ENCRYPTED_USER_IDENTITY_BYTES).fill(33)).toString(
        "base64",
      ),
      meta: {},
    },
    server_key_share: Buffer.alloc(32, 11).toString("base64"),
    password_kdf_salt: Buffer.alloc(16, 22).toString("base64"),
    password_kdf_params_version: 2,
    master_password_policy_version: MASTER_PASSWORD_POLICY_VERSION,
    device_public_key: Buffer.from("bootstrap-device-pk").toString("base64"),
    device_share: hybridDeviceShareB64(11),
    device_fingerprint: "ab".repeat(32),
    device_name: "First device",
    platform: "desktop",
    os_name: "linux",
    os_version: "6",
    app_version: "1.0.0-beta.2",
    client_type: "web",
  };
}

test("integration: register/complete mints a device-bound recovery bootstrap and replay omits it", async (t) => {
  const env = await boot(t);
  if (!env) {
    return;
  }
  const { storage, handler, config } = env;
  const email = `reg-bootstrap-${testEntityId()}@okkey.local`;
  const authStateId = testEntityId();
  assert.match(authStateId, /^\d{10,20}$/);
  t.after(async () => {
    try {
      await storage.redis.del(authStateRedisKey(authStateId));
      await storage.redis.del(`registration:result:${authStateId}`);
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  await storage.redis.setWithTtl(
    authStateRedisKey(authStateId),
    JSON.stringify({
      id: authStateId,
      email,
      userId: null,
      createdAt: new Date().toISOString(),
    }),
    3600,
  );

  const body = registerBody(authStateId);
  const started = Date.now();
  const first = await call(handler, "POST", "/auth/register/complete", null, body);
  assert.equal(first.status, 201);
  assert.equal(first.json.device_status, "trusted");
  assert.equal(first.json.scope, SESSION_SCOPE_REGISTRATION_RECOVERY);
  assert.equal(first.json.token_type, "Bearer");
  assert.equal(typeof first.json.access_token, "string");
  assert.equal(typeof first.json.expires_at, "string");
  const token = first.json.access_token as string;
  assert.ok(token.length > 16);
  const raw = JSON.stringify(first.json);
  assert.equal(raw.includes("server_key_share"), false);
  assert.equal(raw.includes("device_share"), false);
  assert.equal(raw.includes("password_kdf"), false);
  assert.equal(raw.includes(body.server_key_share), false);

  assert.equal(config.registrationBootstrapSessionTtlSeconds, 900);
  const expiresMs = Date.parse(first.json.expires_at as string);
  const ttlMs = expiresMs - started;
  assert.ok(ttlMs > 890_000 && ttlMs < 910_000, `bootstrap ttl ms ${ttlMs}`);

  const names = await storage.postgres.query<{ name: string }>(
    "SELECT name FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email = $1)",
    [email],
  );
  assert.equal(names[0]?.name, "Personal");

  const sessions = await storage.postgres.query<{
    scope: string | null;
    device_id: string | null;
  }>(
    "SELECT scope, device_id::text AS device_id FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
    [email],
  );
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.scope, SESSION_SCOPE_REGISTRATION_RECOVERY);
  assert.equal(sessions[0]?.device_id, first.json.device_id);

  const cachedRaw = await storage.redis.get(`registration:result:${authStateId}`);
  assert.ok(cachedRaw);
  assert.equal(cachedRaw.includes(token), false);
  const cached = JSON.parse(cachedRaw) as Record<string, unknown>;
  assert.equal(cached.userId, first.json.user_id);
  assert.equal("accessToken" in cached, false);
  assert.equal("access_token" in cached, false);

  const again = await call(handler, "POST", "/auth/register/complete", null, body);
  assert.equal(again.status, 201);
  assert.equal(again.json.user_id, first.json.user_id);
  assert.equal(again.json.device_id, first.json.device_id);
  assert.equal("access_token" in again.json, false);
  assert.equal("expires_at" in again.json, false);
  assert.equal("token_type" in again.json, false);
  assert.equal("scope" in again.json, false);
  const sessionsAfter = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
    [email],
  );
  assert.equal(sessionsAfter.length, 1);
});

test("integration: registration bootstrap cannot open vault, devices, or profile", async (t) => {
  const env = await boot(t);
  if (!env) {
    return;
  }
  const { storage, handler } = env;
  const email = `reg-bootstrap-deny-${testEntityId()}@okkey.local`;
  const authStateId = testEntityId();
  t.after(async () => {
    try {
      await storage.redis.del(authStateRedisKey(authStateId));
      await storage.redis.del(`registration:result:${authStateId}`);
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });
  await storage.redis.setWithTtl(
    authStateRedisKey(authStateId),
    JSON.stringify({
      id: authStateId,
      email,
      userId: null,
      createdAt: new Date().toISOString(),
    }),
    3600,
  );
  const created = await call(
    handler,
    "POST",
    "/auth/register/complete",
    null,
    registerBody(authStateId),
  );
  assert.equal(created.status, 201);
  const token = created.json.access_token as string;

  const denied: Array<{ method: string; url: string }> = [
    { method: "GET", url: "/account/recovery" },
    { method: "PATCH", url: "/account/recovery/settings" },
    { method: "POST", url: "/account/recovery/key/rotate" },
    { method: "GET", url: "/account/recovery/key/wrap" },
    { method: "GET", url: "/devices" },
    { method: "GET", url: "/workspaces" },
    { method: "GET", url: "/account/profile" },
    { method: "POST", url: "/account/vault-unlock" },
    { method: "GET", url: "/account/vault-unlock/status" },
    { method: "POST", url: "/account/master-password/change" },
  ];
  for (const route of denied) {
    const res = await call(handler, route.method, route.url, token, {});
    assert.equal(res.status, 401, `${route.method} ${route.url}`);
    assert.equal(res.json.error, "AUTH_REQUIRED", `${route.method} ${route.url}`);
  }
});

test("integration: registration bootstrap enrolls a recovery key once and ack revokes the token", async (t) => {
  const env = await boot(t);
  if (!env) {
    return;
  }
  const { storage, handler } = env;
  const email = `reg-bootstrap-ack-${testEntityId()}@okkey.local`;
  const authStateId = testEntityId();
  t.after(async () => {
    try {
      await storage.redis.del(authStateRedisKey(authStateId));
      await storage.redis.del(`registration:result:${authStateId}`);
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });
  await storage.redis.setWithTtl(
    authStateRedisKey(authStateId),
    JSON.stringify({
      id: authStateId,
      email,
      userId: null,
      createdAt: new Date().toISOString(),
    }),
    3600,
  );
  const created = await call(
    handler,
    "POST",
    "/auth/register/complete",
    null,
    registerBody(authStateId),
  );
  assert.equal(created.status, 201);
  const token = created.json.access_token as string;

  const enrolled = await call(handler, "POST", "/account/recovery/key/enroll", token, {
    encryptedBlob: RECOVERY_BLOB,
  });
  assert.equal(enrolled.status, 200);
  const key = enrolled.json.key as { enrolled?: boolean; exportedAt?: string | null };
  assert.equal(key.enrolled, true);
  assert.equal(key.exportedAt ?? null, null);
  assert.equal(JSON.stringify(enrolled.json).includes("recoverySecret"), false);

  const rotate = await call(handler, "POST", "/account/recovery/key/enroll", token, {
    encryptedBlob: { ...RECOVERY_BLOB, payload: "cm90YXRlZA" },
  });
  assert.equal(rotate.status, 403);
  assert.equal(rotate.json.error, "RECOVERY_ROTATE_FORBIDDEN");

  const ack = await call(handler, "POST", "/account/recovery/key/ack-export", token, {});
  assert.equal(ack.status, 200);
  const ackKey = ack.json.key as { exportedAt?: string | null };
  assert.equal(typeof ackKey.exportedAt, "string");

  const again = await call(handler, "POST", "/account/recovery/key/ack-export", token, {});
  assert.equal(again.status, 401);
  assert.equal(again.json.error, "AUTH_REQUIRED");

  const sessions = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
    [email],
  );
  assert.equal(sessions.length, 0);
});

test("integration: registration_recovery without a device id is rejected", async (t) => {
  const env = await boot(t);
  if (!env) {
    return;
  }
  const { storage, handler, sessionService } = env;
  const email = `reg-bootstrap-unbound-${testEntityId()}@okkey.local`;
  const authStateId = testEntityId();
  t.after(async () => {
    try {
      await storage.redis.del(authStateRedisKey(authStateId));
      await storage.redis.del(`registration:result:${authStateId}`);
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });
  await storage.redis.setWithTtl(
    authStateRedisKey(authStateId),
    JSON.stringify({
      id: authStateId,
      email,
      userId: null,
      createdAt: new Date().toISOString(),
    }),
    3600,
  );
  const created = await call(
    handler,
    "POST",
    "/auth/register/complete",
    null,
    registerBody(authStateId),
  );
  assert.equal(created.status, 201);
  const unbound = await sessionService.createSession(created.json.user_id as string, {
    scope: SESSION_SCOPE_REGISTRATION_RECOVERY,
    ttlSeconds: 900,
  });
  const res = await call(handler, "POST", "/account/recovery/key/enroll", unbound.accessToken, {
    encryptedBlob: RECOVERY_BLOB,
  });
  assert.equal(res.status, 401);
  assert.equal(res.json.error, "AUTH_REQUIRED");
});

// Recovery wrap meta.key_scope must be "account"; any other scope is RECOVERY_BAD_REQUEST.
test(
  "integration: recovery enroll rejects a wrap whose key_scope is not account",
  async (t) => {
    const env = await boot(t);
    if (!env) {
      return;
    }
    const { storage, handler } = env;
    const email = `reg-bootstrap-scope-${testEntityId()}@okkey.local`;
    const authStateId = testEntityId();
    t.after(async () => {
      try {
        await storage.redis.del(authStateRedisKey(authStateId));
        await storage.redis.del(`registration:result:${authStateId}`);
        await cleanupUserData(storage, email);
      } finally {
        await storage.close();
      }
    });
    await storage.redis.setWithTtl(
      authStateRedisKey(authStateId),
      JSON.stringify({
        id: authStateId,
        email,
        userId: null,
        createdAt: new Date().toISOString(),
      }),
      3600,
    );
    const created = await call(
      handler,
      "POST",
      "/auth/register/complete",
      null,
      registerBody(authStateId),
    );
    assert.equal(created.status, 201);
    const token = created.json.access_token as string;
    const res = await call(handler, "POST", "/account/recovery/key/enroll", token, {
      encryptedBlob: {
        ...RECOVERY_BLOB,
        meta: { entity: "vault_key_recovery_wrap", key_scope: "vault" },
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, "RECOVERY_BAD_REQUEST");
  },
);

test("integration: expired registration bootstrap is rejected on enroll and ack-export", async (t) => {
  const env = await boot(t);
  if (!env) {
    return;
  }
  const { storage, handler } = env;
  const email = `reg-bootstrap-ttl-${testEntityId()}@okkey.local`;
  const authStateId = testEntityId();
  t.after(async () => {
    try {
      await storage.redis.del(authStateRedisKey(authStateId));
      await storage.redis.del(`registration:result:${authStateId}`);
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });
  await seedAuthState(storage, authStateId, email);
  const created = await call(
    handler,
    "POST",
    "/auth/register/complete",
    null,
    registerBody(authStateId),
  );
  assert.equal(created.status, 201);
  const token = created.json.access_token as string;
  await storage.postgres.query(
    `UPDATE sessions
     SET expires_at = now() - interval '1 minute'
     WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
    [email],
  );
  const enroll = await call(handler, "POST", "/account/recovery/key/enroll", token, {
    encryptedBlob: RECOVERY_BLOB,
  });
  assert.equal(enroll.status, 401);
  assert.equal(enroll.json.error, "AUTH_REQUIRED");
  const ack = await call(handler, "POST", "/account/recovery/key/ack-export", token, {});
  assert.equal(ack.status, 401);
  assert.equal(ack.json.error, "AUTH_REQUIRED");
});

test("integration: full-session re-ack overwrites exported_at and keeps the session", async (t) => {
  const env = await boot(t);
  if (!env) {
    return;
  }
  const { storage, handler, sessionService } = env;
  const email = `reg-bootstrap-reack-${testEntityId()}@okkey.local`;
  const authStateId = testEntityId();
  t.after(async () => {
    try {
      await storage.redis.del(authStateRedisKey(authStateId));
      await storage.redis.del(`registration:result:${authStateId}`);
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });
  await seedAuthState(storage, authStateId, email);
  const created = await call(
    handler,
    "POST",
    "/auth/register/complete",
    null,
    registerBody(authStateId),
  );
  assert.equal(created.status, 201);
  const enrolled = await call(
    handler,
    "POST",
    "/account/recovery/key/enroll",
    created.json.access_token as string,
    { encryptedBlob: RECOVERY_BLOB },
  );
  assert.equal(enrolled.status, 200);

  const full = await sessionService.createSession(created.json.user_id as string, {
    deviceId: created.json.device_id as string,
  });
  assert.equal(full.scope, null);
  const first = await call(
    handler,
    "POST",
    "/account/recovery/key/ack-export",
    full.accessToken,
    {},
  );
  assert.equal(first.status, 200);
  const firstAt = (first.json.key as { exportedAt?: string }).exportedAt;
  assert.equal(typeof firstAt, "string");

  await storage.postgres.query(
    `UPDATE user_vault_recovery_wrap
     SET exported_at = '2020-01-01T00:00:00.000Z'
     WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
    [email],
  );
  const second = await call(
    handler,
    "POST",
    "/account/recovery/key/ack-export",
    full.accessToken,
    {},
  );
  assert.equal(second.status, 200);
  const secondAt = (second.json.key as { exportedAt?: string }).exportedAt;
  assert.equal(typeof secondAt, "string");
  assert.notEqual(secondAt, firstAt);
  assert.equal(String(secondAt).startsWith("2020-"), false);

  const stillThere = await call(
    handler,
    "POST",
    "/account/recovery/key/ack-export",
    full.accessToken,
    {},
  );
  assert.equal(stillThere.status, 200);
});

test("integration: register/complete returns 429 when the per-IP bootstrap budget is spent", async (t) => {
  const ip = "203.0.113.20";
  const config = {
    ...loadConfig(),
    authRateLimitRegisterCompletePerIp: 1,
    authRateLimitRegisterCompletePerEmail: 100_000,
  };
  const env = await boot(t, config);
  if (!env) {
    return;
  }
  const { storage, handler } = env;
  const emailA = `reg-bootstrap-ip-a-${testEntityId()}@okkey.local`;
  const emailB = `reg-bootstrap-ip-b-${testEntityId()}@okkey.local`;
  const authA = testEntityId();
  const authB = testEntityId();
  t.after(async () => {
    try {
      await storage.redis.del(authStateRedisKey(authA));
      await storage.redis.del(authStateRedisKey(authB));
      await storage.redis.del(`registration:result:${authA}`);
      await storage.redis.del(`registration:result:${authB}`);
      await storage.redis.del(`auth:rate:register-complete:ip:${ip}`);
      await storage.redis.del(`auth:rate:register-complete:email:${emailA}`);
      await storage.redis.del(`auth:rate:register-complete:email:${emailB}`);
      await cleanupUserData(storage, emailA);
      await cleanupUserData(storage, emailB);
    } finally {
      await storage.close();
    }
  });
  await seedAuthState(storage, authA, emailA);
  await seedAuthState(storage, authB, emailB);
  const first = await call(
    handler,
    "POST",
    "/auth/register/complete",
    null,
    registerBody(authA),
    { ip },
  );
  assert.equal(first.status, 201);
  assert.equal(typeof first.json.access_token, "string");
  const second = await call(
    handler,
    "POST",
    "/auth/register/complete",
    null,
    registerBody(authB),
    { ip },
  );
  assert.equal(second.status, 429);
  assert.equal(second.json.error, "AUTH_RATE_LIMITED");
});

test("integration: register/complete returns 429 when the per-email bootstrap budget is spent", async (t) => {
  const email = `reg-bootstrap-email-${testEntityId()}@okkey.local`;
  const ipA = "203.0.113.21";
  const ipB = "203.0.113.22";
  const config = {
    ...loadConfig(),
    authRateLimitRegisterCompletePerIp: 100_000,
    authRateLimitRegisterCompletePerEmail: 1,
  };
  const env = await boot(t, config);
  if (!env) {
    return;
  }
  const { storage, handler } = env;
  const authA = testEntityId();
  const authB = testEntityId();
  t.after(async () => {
    try {
      await storage.redis.del(authStateRedisKey(authA));
      await storage.redis.del(authStateRedisKey(authB));
      await storage.redis.del(`registration:result:${authA}`);
      await storage.redis.del(`registration:result:${authB}`);
      await storage.redis.del(`auth:rate:register-complete:ip:${ipA}`);
      await storage.redis.del(`auth:rate:register-complete:ip:${ipB}`);
      await storage.redis.del(`auth:rate:register-complete:email:${email}`);
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });
  await seedAuthState(storage, authA, email);
  await seedAuthState(storage, authB, email);
  const first = await call(
    handler,
    "POST",
    "/auth/register/complete",
    null,
    registerBody(authA),
    { ip: ipA },
  );
  assert.equal(first.status, 201);
  const second = await call(
    handler,
    "POST",
    "/auth/register/complete",
    null,
    registerBody(authB),
    { ip: ipB },
  );
  assert.equal(second.status, 429);
  assert.equal(second.json.error, "AUTH_RATE_LIMITED");
});

test("integration: register/complete replay does not consume the bootstrap rate limit", async (t) => {
  const ip = "203.0.113.23";
  const config = {
    ...loadConfig(),
    authRateLimitRegisterCompletePerIp: 1,
    authRateLimitRegisterCompletePerEmail: 1,
  };
  const env = await boot(t, config);
  if (!env) {
    return;
  }
  const { storage, handler } = env;
  const email = `reg-bootstrap-replay-limit-${testEntityId()}@okkey.local`;
  const otherEmail = `reg-bootstrap-replay-other-${testEntityId()}@okkey.local`;
  const authStateId = testEntityId();
  const otherAuth = testEntityId();
  t.after(async () => {
    try {
      await storage.redis.del(authStateRedisKey(authStateId));
      await storage.redis.del(authStateRedisKey(otherAuth));
      await storage.redis.del(`registration:result:${authStateId}`);
      await storage.redis.del(`registration:result:${otherAuth}`);
      await storage.redis.del(`auth:rate:register-complete:ip:${ip}`);
      await storage.redis.del(`auth:rate:register-complete:email:${email}`);
      await storage.redis.del(`auth:rate:register-complete:email:${otherEmail}`);
      await cleanupUserData(storage, email);
      await cleanupUserData(storage, otherEmail);
    } finally {
      await storage.close();
    }
  });
  await seedAuthState(storage, authStateId, email);
  await seedAuthState(storage, otherAuth, otherEmail);
  const body = registerBody(authStateId);
  const first = await call(handler, "POST", "/auth/register/complete", null, body, { ip });
  assert.equal(first.status, 201);
  assert.equal(typeof first.json.access_token, "string");

  const replay = await call(handler, "POST", "/auth/register/complete", null, body, { ip });
  assert.equal(replay.status, 201);
  assert.equal(replay.json.user_id, first.json.user_id);
  assert.equal("access_token" in replay.json, false);

  const blocked = await call(
    handler,
    "POST",
    "/auth/register/complete",
    null,
    registerBody(otherAuth),
    { ip },
  );
  assert.equal(blocked.status, 429);
  assert.equal(blocked.json.error, "AUTH_RATE_LIMITED");
});
