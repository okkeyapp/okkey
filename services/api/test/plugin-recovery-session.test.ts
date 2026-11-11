import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MASTER_PASSWORD_POLICY_VERSION } from "@okkey/types";

import { createApiApp } from "../src/app.ts";
import type { AccountRecoveryService } from "../src/account-recovery/service.ts";
import type { DeviceService } from "../src/device/service.ts";
import type { ApiEnterprisePluginContext } from "../src/plugins/types.ts";
import { markCallerSessionRecoveryProved } from "../src/plugins/recovery-session.ts";
import { SessionService } from "../src/session/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const IDENTITY = {
  crypto_version: 2,
  algorithm: "xchacha20-poly1305",
  payload: Buffer.from("identity-ciphertext").toString("base64"),
  meta: { entity: "user_private_key_bundle" },
};

const EXPIRES_A = "2026-06-01T01:00:00.000Z";
const EXPIRES_B = "2026-06-01T02:00:00.000Z";

class MockResponse {
  statusCode = 200;
  body = "";
  writableEnded = false;
  setHeader(): void {}
  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

type SessionRow = {
  userId: string;
  deviceId: string | null;
  tokenHash: string;
  scope: string | null;
  expiresAt: string;
  recoveryProvedAt: string | null;
  recoveryChallenge: string | null;
  recoveryChallengeExpiresAt: string | null;
};

function request(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as IncomingMessage;
}

function bearer(token: string): IncomingMessage {
  return request({ authorization: `Bearer ${token}` });
}

test("markCallerSessionRecoveryProved updates only the resolved full session", async () => {
  const marked: Array<{ token: string; userId: string }> = [];
  const markedMethods: string[] = [];
  const resolveSession = async (req: IncomingMessage) => {
    const token = req.headers.authorization?.toString().replace(/^Bearer /i, "") ?? "";
    if (token === "none") {
      return null;
    }
    if (token === "bootstrap") {
      return { userId: "u1", scope: "registration_recovery", tokenHash: "hash-bootstrap" };
    }
    if (token === "header") {
      return { userId: "u1", scope: null, tokenHash: "" };
    }
    if (token === "expired-mark") {
      return { userId: "u1", scope: null, tokenHash: "hash-a" };
    }
    if (token === "ok") {
      return { userId: "u1", scope: null, tokenHash: "hash-a" };
    }
    return null;
  };
  const deps = {
    resolveSession,
    markRecoveryProved: async (token: string, userId: string) => {
      marked.push({ token, userId });
      return token !== "expired-mark";
    },
    onMarked: (method: string) => {
      markedMethods.push(method);
    },
  };

  assert.equal(
    await markCallerSessionRecoveryProved(request(), { method: "trusted_device" }, deps),
    false,
  );
  assert.equal(
    await markCallerSessionRecoveryProved(bearer("none"), { method: "trusted_device" }, deps),
    false,
  );
  assert.equal(
    await markCallerSessionRecoveryProved(bearer("ok"), { method: "   " }, deps),
    false,
  );
  assert.equal(
    await markCallerSessionRecoveryProved(bearer("bootstrap"), { method: "trusted_device" }, deps),
    false,
  );
  assert.equal(
    await markCallerSessionRecoveryProved(bearer("header"), { method: "trusted_device" }, deps),
    false,
  );
  assert.equal(
    await markCallerSessionRecoveryProved(bearer("expired-mark"), { method: "trusted_device" }, deps),
    false,
  );
  assert.equal(
    await markCallerSessionRecoveryProved(bearer("ok"), { method: " trusted_device " }, deps),
    true,
  );

  assert.deepEqual(marked, [
    { token: "expired-mark", userId: "u1" },
    { token: "ok", userId: "u1" },
  ]);
  assert.deepEqual(markedMethods, ["trusted_device"]);
});

test("plugin recovery helpers prove only the caller session and open restore routes", async () => {
  let clock = Date.parse("2026-06-01T00:00:00.000Z");
  const rows: SessionRow[] = [];
  const markedHashes: string[] = [];
  const logs: Array<{ message: string; extra?: Record<string, unknown> }> = [];
  let claims = 0;

  const sessions = {
    async findValidByTokenHash(tokenHash: string, nowIso: string) {
      const row = rows.find((item) => item.tokenHash === tokenHash);
      if (!row || Date.parse(row.expiresAt) <= Date.parse(nowIso)) {
        return null;
      }
      return {
        id: row.tokenHash,
        userId: row.userId,
        deviceId: row.deviceId,
        scope: row.scope,
        expiresAt: row.expiresAt,
        recoveryProvedAt: row.recoveryProvedAt,
        recoveryChallenge: row.recoveryChallenge,
        recoveryChallengeExpiresAt: row.recoveryChallengeExpiresAt,
      };
    },
    async markRecoveryProved(input: { tokenHash: string; userId: string }) {
      markedHashes.push(input.tokenHash);
      const row = rows.find(
        (item) => item.tokenHash === input.tokenHash && item.userId === input.userId,
      );
      if (!row || Date.parse(row.expiresAt) <= clock) {
        return false;
      }
      row.recoveryProvedAt = new Date(clock).toISOString();
      row.recoveryChallenge = null;
      row.recoveryChallengeExpiresAt = null;
      return true;
    },
    async bindDevice(input: {
      tokenHash: string;
      userId: string;
      deviceId: string;
      replaceExistingDevice?: boolean;
    }) {
      const row = rows.find(
        (item) => item.tokenHash === input.tokenHash && item.userId === input.userId,
      );
      if (!row || Date.parse(row.expiresAt) <= clock) {
        return false;
      }
      const sameDevice = row.deviceId === input.deviceId;
      if (!input.replaceExistingDevice && row.deviceId && !sameDevice) {
        return false;
      }
      row.deviceId = input.deviceId;
      return true;
    },
    async createSession() {
      return { id: "unused" };
    },
    async deleteByDeviceId() {
      return 0;
    },
    async deleteByTokenHash() {
      return false;
    },
    async setRecoveryChallenge() {
      return false;
    },
    async consumeRecoveryChallenge() {
      return false;
    },
  };

  const sessionService = new SessionService({
    sessions,
    config: { sessionTtlSeconds: 3600 },
    now: () => new Date(clock),
  });

  const tokenA = "token-a";
  const tokenB = "token-b";
  const tokenC = "token-c";
  const tokenD = "token-d";
  const tokenR = "token-r";
  rows.push(
    {
      userId: "u1",
      deviceId: "d-pending",
      tokenHash: sessionService.hashAccessToken(tokenA),
      scope: null,
      expiresAt: EXPIRES_A,
      recoveryProvedAt: null,
      recoveryChallenge: "nonce-a",
      recoveryChallengeExpiresAt: EXPIRES_A,
    },
    {
      userId: "u1",
      deviceId: "d-other",
      tokenHash: sessionService.hashAccessToken(tokenB),
      scope: null,
      expiresAt: EXPIRES_B,
      recoveryProvedAt: null,
      recoveryChallenge: "nonce-b",
      recoveryChallengeExpiresAt: EXPIRES_B,
    },
    {
      userId: "u2",
      deviceId: "d-u2",
      tokenHash: sessionService.hashAccessToken(tokenC),
      scope: null,
      expiresAt: EXPIRES_B,
      recoveryProvedAt: null,
      recoveryChallenge: "nonce-c",
      recoveryChallengeExpiresAt: EXPIRES_B,
    },
    {
      userId: "u1",
      deviceId: null,
      tokenHash: sessionService.hashAccessToken(tokenD),
      scope: null,
      expiresAt: EXPIRES_A,
      recoveryProvedAt: null,
      recoveryChallenge: null,
      recoveryChallengeExpiresAt: null,
    },
    {
      userId: "u1",
      deviceId: "d-bootstrap",
      tokenHash: sessionService.hashAccessToken(tokenR),
      scope: "registration_recovery",
      expiresAt: EXPIRES_B,
      recoveryProvedAt: null,
      recoveryChallenge: null,
      recoveryChallengeExpiresAt: null,
    },
  );

  let ctx: ApiEnterprisePluginContext | null = null;
  let provedDeviceOnClaim: string | undefined;
  const deviceService = {
    isSessionDeviceTrusted: async () => false,
    registerDevice: async (
      _userId: string,
      _requestIp: string,
      input: {
        recoveryPending?: boolean;
        claimAfterRecovery?: boolean;
        provedDeviceId?: string;
      },
    ) => {
      claims += 1;
      if (input.recoveryPending && !input.claimAfterRecovery) {
        return { deviceId: "d-fresh", status: "pending_approval" as const, created: true };
      }
      if (input.claimAfterRecovery) {
        provedDeviceOnClaim = input.provedDeviceId;
        return {
          deviceId: input.provedDeviceId ?? "d-pending",
          status: "trusted" as const,
          created: true,
        };
      }
      return { deviceId: "d-pending", status: "trusted" as const, created: true };
    },
  } as unknown as DeviceService;
  const accountRecoveryService = {
    getIdentityEncryptedKey: async () => ({ encryptedPrivateKey: IDENTITY }),
  } as unknown as AccountRecoveryService;

  const app = createApiApp(
    createTestApiConfig(),
    {
      info(message, extra) {
        logs.push({ message, extra });
      },
      warn() {},
      error() {},
    },
    {
      sessionService,
      deviceService,
      accountRecoveryService,
      usersRepository: {
        updateMasterPasswordShares: async () => "2026-06-01T00:10:00.000Z",
        loadAccountProfile: async () => {
          throw new Error("trusted resolver must not reach the profile");
        },
        findById: async () => {
          throw new Error("trusted resolver must not reach the profile");
        },
      } as never,
    },
    {
      postgres: {} as never,
      workspacesRepository: {} as never,
      enterprisePlugins: [
        {
          id: "recovery-session-test",
          register(pluginCtx) {
            ctx = pluginCtx;
          },
        },
      ],
    },
  );
  await app.pluginsReady;
  assert.ok(ctx);
  const pluginCtx = ctx as ApiEnterprisePluginContext;

  async function call(method: string, url: string, token: string, body?: unknown) {
    const req = {
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      body,
    } as IncomingMessage;
    const res = new MockResponse();
    await app.handler()(req, res as unknown as ServerResponse);
    return {
      statusCode: res.statusCode,
      json: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {},
    };
  }

  const passwordBody = {
    server_key_share: Buffer.alloc(32, 1).toString("base64"),
    password_kdf_salt: Buffer.alloc(16, 2).toString("base64"),
    password_kdf_params_version: 2,
    master_password_policy_version: MASTER_PASSWORD_POLICY_VERSION,
  };
  const claimBody = {
    device_public_key: Buffer.alloc(32, 3).toString("base64"),
    device_share: Buffer.alloc(32, 4).toString("base64"),
    device_fingerprint: "ab".repeat(16),
    device_name: "Browser",
    metadata: { claim_after_recovery: true },
  };

  assert.equal(await pluginCtx.resolveUserId(bearer(tokenA)), null);
  assert.equal(await pluginCtx.resolveUserIdAllowUnboundDevice(bearer(tokenA)), "u1");
  assert.equal(await pluginCtx.resolveUserId(bearer(tokenD)), null);
  assert.equal(await pluginCtx.resolveUserIdAllowUnboundDevice(bearer(tokenD)), "u1");
  assert.equal(await pluginCtx.resolveUserIdAllowUnboundDevice(bearer(tokenR)), null);
  assert.equal(await pluginCtx.resolveUserIdAllowUnboundDevice(request()), null);
  assert.equal(
    await pluginCtx.resolveUserIdAllowUnboundDevice(request({ "x-user-id": "header-user" })),
    "header-user",
  );

  assert.equal(await pluginCtx.markSessionRecoveryProved(request(), { method: "trusted_device" }), false);
  assert.equal(
    await pluginCtx.markSessionRecoveryProved(request({ "x-user-id": "header-user" }), {
      method: "trusted_device",
    }),
    false,
  );
  assert.equal(await pluginCtx.markSessionRecoveryProved(bearer(tokenA), { method: " " }), false);
  assert.equal(await pluginCtx.markSessionRecoveryProved(bearer(tokenR), { method: "trusted_device" }), false);
  assert.deepEqual(markedHashes, []);
  assert.equal(rows[0]?.recoveryProvedAt, null);
  assert.equal(rows[0]?.recoveryChallenge, "nonce-a");

  const blockedPassword = await call("POST", "/account/master-password/change", tokenA, passwordBody);
  assert.equal(blockedPassword.statusCode, 401);
  assert.equal(blockedPassword.json.error, "AUTH_REQUIRED");
  const blockedIdentity = await call("GET", "/account/recovery/identity-encrypted-key", tokenA);
  assert.equal(blockedIdentity.statusCode, 401);
  const blockedClaim = await call("POST", "/devices/register", tokenA, claimBody);
  assert.equal(blockedClaim.statusCode, 403);
  assert.equal(blockedClaim.json.error, "RECOVERY_PROOF_REQUIRED");
  assert.equal(claims, 0);

  const proved = await pluginCtx.markSessionRecoveryProved(bearer(tokenA), {
    method: "trusted_device",
  });
  assert.equal(proved, true);
  assert.deepEqual(markedHashes, [sessionService.hashAccessToken(tokenA)]);
  assert.equal(rows[0]?.recoveryProvedAt, "2026-06-01T00:00:00.000Z");
  assert.equal(rows[0]?.expiresAt, EXPIRES_A);
  assert.equal(rows[0]?.recoveryChallenge, null);
  assert.equal(rows[1]?.recoveryProvedAt, null);
  assert.equal(rows[1]?.recoveryChallenge, "nonce-b");
  assert.equal(rows[2]?.recoveryProvedAt, null);
  assert.equal(rows[3]?.recoveryProvedAt, null);
  assert.equal(logs.some((entry) => entry.message === "session recovery proved" && entry.extra?.method === "trusted_device"), true);

  assert.equal((await call("POST", "/account/master-password/change", tokenA, passwordBody)).statusCode, 200);
  assert.equal((await call("GET", "/account/recovery/identity-encrypted-key", tokenA)).statusCode, 200);
  const claim = await call("POST", "/devices/register", tokenA, claimBody);
  assert.equal(claim.statusCode, 200);
  assert.equal(claim.json.status, "trusted");
  assert.equal(claims, 1);

  assert.equal((await call("POST", "/account/master-password/change", tokenB, passwordBody)).statusCode, 401);
  assert.equal((await call("GET", "/account/recovery/identity-encrypted-key", tokenB)).statusCode, 401);
  const otherClaim = await call("POST", "/devices/register", tokenB, claimBody);
  assert.equal(otherClaim.statusCode, 403);
  assert.equal(otherClaim.json.error, "RECOVERY_PROOF_REQUIRED");
  assert.equal(claims, 1);
  assert.equal((await call("GET", "/account/profile", tokenA)).statusCode, 401);

  const unbound = await pluginCtx.markSessionRecoveryProved(bearer(tokenD), {
    method: "trusted_contacts",
  });
  assert.equal(unbound, true);
  assert.equal(rows[3]?.recoveryProvedAt, "2026-06-01T00:00:00.000Z");
  assert.equal(rows[1]?.recoveryProvedAt, null);
  assert.equal((await call("GET", "/account/recovery/identity-encrypted-key", tokenD)).statusCode, 200);
  const unboundClaim = await call("POST", "/devices/register", tokenD, claimBody);
  assert.equal(unboundClaim.statusCode, 403);
  assert.equal(unboundClaim.json.error, "RECOVERY_CLAIM_REQUIRES_PROVED_DEVICE");
  assert.equal(rows[3]?.deviceId, null);
  assert.equal(claims, 1);

  const pending = await call("POST", "/devices/register", tokenD, {
    ...claimBody,
    metadata: { recovery_pending: true },
  });
  assert.equal(pending.statusCode, 200);
  assert.equal(pending.json.device_id, "d-fresh");
  assert.equal(pending.json.status, "pending_approval");
  assert.equal(rows[3]?.deviceId, "d-fresh");
  assert.equal(rows[3]?.recoveryProvedAt, "2026-06-01T00:00:00.000Z");
  assert.equal(rows[0]?.deviceId, "d-pending");
  assert.equal(rows[1]?.deviceId, "d-other");
  const bound = await sessionService.resolveAccessToken(tokenD);
  assert.equal(bound?.deviceId, "d-fresh");
  assert.ok(bound?.recoveryProvedAt);

  const claimedAfterBind = await call("POST", "/devices/register", tokenD, claimBody);
  assert.equal(claimedAfterBind.statusCode, 200);
  assert.equal(claimedAfterBind.json.status, "trusted");
  assert.equal(claimedAfterBind.json.device_id, "d-fresh");
  assert.equal(provedDeviceOnClaim, "d-fresh");
  assert.equal(rows[3]?.deviceId, "d-fresh");
  assert.equal(claims, 3);

  clock = Date.parse(EXPIRES_A);
  assert.equal(await pluginCtx.markSessionRecoveryProved(bearer(tokenA), { method: "trusted_device" }), false);
  assert.equal(rows[0]?.expiresAt, EXPIRES_A);
  assert.equal(rows[0]?.recoveryProvedAt, "2026-06-01T00:00:00.000Z");
  assert.equal((await call("POST", "/account/master-password/change", tokenA, passwordBody)).statusCode, 401);
  assert.equal((await call("GET", "/account/recovery/identity-encrypted-key", tokenA)).statusCode, 401);
  const expiredClaim = await call("POST", "/devices/register", tokenA, claimBody);
  assert.equal(expiredClaim.statusCode, 401);
  assert.equal((await call("GET", "/account/recovery/identity-encrypted-key", tokenB)).statusCode, 401);
  assert.equal(rows[1]?.recoveryProvedAt, null);
  assert.equal(rows[1]?.expiresAt, EXPIRES_B);
});
