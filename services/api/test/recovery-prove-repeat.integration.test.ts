import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { recoveryPossessionProofMessage } from "../src/account-recovery/possession-proof.ts";
import type { AccountRecoveryService } from "../src/account-recovery/service.ts";
import { createApiApp } from "../src/app.ts";
import type { DeviceService } from "../src/device/service.ts";
import { SessionService } from "../src/session/service.ts";
import { applySqlMigrations } from "../src/storage/migrate.ts";
import { createIntegrationStorage } from "./integration-env.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import { testEntityId } from "./test-entity-id.ts";

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

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const spki = publicKey.export({ type: "spki", format: "der" });
const publicKeyB64 = Buffer.from(spki.subarray(spki.length - 32)).toString("base64");

const WRAP = {
  crypto_version: 2,
  algorithm: "xchacha20-poly1305",
  payload: Buffer.from("wrap-ciphertext").toString("base64"),
  meta: { entity: "vault_key_recovery_wrap", key_scope: "account" },
};

function signChallenge(input: { userId: string; deviceId: string; challenge: string }): string {
  return sign(null, recoveryPossessionProofMessage(input), privateKey).toString("base64");
}

function claimBody() {
  return {
    device_public_key: Buffer.alloc(32, 3).toString("base64"),
    device_share: Buffer.alloc(32, 4).toString("base64"),
    device_fingerprint: "ab".repeat(32),
    device_name: "Browser",
    metadata: { claim_after_recovery: true },
  };
}

function loggerStub() {
  return { info() {}, warn() {}, error() {} };
}

async function call(
  app: ReturnType<typeof createApiApp>,
  method: string,
  url: string,
  body?: unknown,
  token?: string,
) {
  const req = {
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return {
    statusCode: res.statusCode,
    json: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {},
  };
}

test("integration: a second recovery-key prove in the same session succeeds", async (t) => {
  const storage = await createIntegrationStorage(t);
  if (!storage) {
    return;
  }

  const config = createTestApiConfig({ allowHeaderUserIdAuth: false });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
  });
  let userId = "";
  t.after(async () => {
    try {
      if (userId) {
        await storage.postgres.query("DELETE FROM sessions WHERE user_id = $1::bigint", [userId]);
        await storage.postgres.query("DELETE FROM devices WHERE user_id = $1::bigint", [userId]);
        await storage.postgres.query("DELETE FROM users WHERE id = $1::bigint", [userId]);
      }
    } finally {
      await storage.close();
    }
  });

  await applySqlMigrations(storage.postgres);

  const user = await storage.repositories.users.create({
    email: `recovery-prove-${testEntityId()}@okkey.local`,
    publicKey: "pk",
    publicPqKey: "pq",
    encryptedPrivateKey: new Uint8Array([1]),
    serverKeyShare: new Uint8Array(32).fill(2),
    passwordKdfSalt: new Uint8Array(16).fill(3),
    passwordKdfParamsVersion: 2,
  });
  userId = user.id;

  const pendingDeviceId = testEntityId();
  const otherDeviceId = testEntityId();
  const share = Buffer.alloc(32, 9);
  for (const device of [
    { id: pendingDeviceId, fingerprint: "cd".repeat(32), status: "pending" },
    { id: otherDeviceId, fingerprint: "ef".repeat(32), status: "pending" },
  ]) {
    await storage.postgres.query(
      `
        INSERT INTO devices (
          id, user_id, device_fingerprint, device_name, device_public_key, device_share,
          platform, os_name, os_version, app_version, client_type, user_agent,
          ip_first, ip_last, status
        ) VALUES (
          $1::bigint, $2::bigint, $3, 'Browser', 'cHVibGljLWtleQ==', $4,
          'web', 'test', '1', 'web', 'web_app', 'test',
          '127.0.0.1', '127.0.0.1', $5
        )
      `,
      [device.id, userId, device.fingerprint, share, device.status],
    );
  }

  const pending = await sessionService.createSession(userId, { deviceId: pendingDeviceId });
  const other = await sessionService.createSession(userId, { deviceId: otherDeviceId });
  const unbound = await sessionService.createSession(userId);

  const accountRecoveryService = {
    getRecoveryPossession: async () => ({ kind: "ready" as const, publicKey: publicKeyB64 }),
    getKeyWrap: async () => ({ encryptedBlob: WRAP }),
  } as unknown as AccountRecoveryService;
  const deviceService = {
    isSessionDeviceTrusted: async () => false,
    registerDevice: async () => ({
      deviceId: pendingDeviceId,
      status: "trusted" as const,
      created: false,
    }),
  } as unknown as DeviceService;

  const app = createApiApp(config, loggerStub(), {
    accountRecoveryService,
    deviceService,
    sessionService,
    usersRepository: storage.repositories.users,
  });

  async function sessionState(token: string) {
    const rows = await storage.postgres.query<{
      device_id: string | null;
      proved: boolean;
      challenge: string | null;
    }>(
      `
        SELECT device_id::text, recovery_proved_at IS NOT NULL AS proved, recovery_challenge AS challenge
        FROM sessions
        WHERE token_hash = $1
      `,
      [sessionService.hashAccessToken(token)],
    );
    return rows[0];
  }

  const claimEarly = await call(app, "POST", "/devices/register", claimBody(), pending.accessToken);
  assert.equal(claimEarly.statusCode, 403);
  assert.equal(claimEarly.json.error, "RECOVERY_PROOF_REQUIRED");
  assert.equal(
    (await call(app, "GET", "/account/recovery/key/wrap", undefined, pending.accessToken)).statusCode,
    401,
  );

  const noDevice = await call(app, "POST", "/account/recovery/key/prove", {}, unbound.accessToken);
  assert.equal(noDevice.statusCode, 403);
  assert.equal(noDevice.json.error, "RECOVERY_PROOF_REQUIRES_DEVICE");
  assert.equal(
    await storage.repositories.sessions.setRecoveryChallenge({
      tokenHash: sessionService.hashAccessToken(unbound.accessToken),
      userId,
      challenge: "unbound-challenge",
      expiresAtIso: new Date(Date.now() + 60_000).toISOString(),
    }),
    false,
  );

  const started = await call(app, "POST", "/account/recovery/key/prove", {}, pending.accessToken);
  assert.equal(started.statusCode, 200);
  assert.equal(started.json.proved, false);
  assert.equal(started.json.deviceId, pendingDeviceId);
  const firstChallenge = started.json.challenge as string;
  const firstSignature = signChallenge({
    userId,
    deviceId: pendingDeviceId,
    challenge: firstChallenge,
  });
  const proved = await call(
    app,
    "POST",
    "/account/recovery/key/prove",
    { challenge: firstChallenge, signature: firstSignature },
    pending.accessToken,
  );
  assert.equal(proved.statusCode, 200);
  assert.equal(proved.json.proved, true);
  assert.equal((await sessionState(pending.accessToken))?.proved, true);
  assert.equal((await sessionState(pending.accessToken))?.device_id, pendingDeviceId);
  assert.equal(
    (await call(app, "GET", "/account/recovery/key/wrap", undefined, pending.accessToken)).statusCode,
    200,
  );

  const claim = await call(app, "POST", "/devices/register", claimBody(), pending.accessToken);
  assert.equal(claim.statusCode, 200);
  assert.equal((await sessionState(pending.accessToken))?.device_id, pendingDeviceId);

  const again = await call(app, "POST", "/account/recovery/key/prove", {}, pending.accessToken);
  assert.equal(again.statusCode, 200, "second challenge in the same session");
  assert.equal(again.json.proved, false);
  assert.equal(again.json.deviceId, pendingDeviceId);
  const secondChallenge = again.json.challenge as string;
  assert.notEqual(secondChallenge, firstChallenge);
  const afterChallenge = await sessionState(pending.accessToken);
  assert.equal(afterChallenge?.proved, true);
  assert.equal(afterChallenge?.device_id, pendingDeviceId);
  assert.equal(afterChallenge?.challenge, secondChallenge);
  assert.equal(
    (await call(app, "GET", "/account/recovery/key/wrap", undefined, pending.accessToken)).statusCode,
    200,
  );
  const claimWhileChallenged = await call(
    app,
    "POST",
    "/devices/register",
    claimBody(),
    pending.accessToken,
  );
  assert.equal(claimWhileChallenged.statusCode, 200);

  const replayed = await call(
    app,
    "POST",
    "/account/recovery/key/prove",
    { challenge: firstChallenge, signature: firstSignature },
    pending.accessToken,
  );
  assert.equal(replayed.statusCode, 400);

  const otherSession = await call(
    app,
    "POST",
    "/account/recovery/key/prove",
    {
      challenge: secondChallenge,
      signature: signChallenge({
        userId,
        deviceId: pendingDeviceId,
        challenge: secondChallenge,
      }),
    },
    other.accessToken,
  );
  assert.notEqual(otherSession.statusCode, 200);
  assert.equal((await sessionState(pending.accessToken))?.challenge, secondChallenge);

  const wrongDevice = await call(
    app,
    "POST",
    "/account/recovery/key/prove",
    {
      challenge: secondChallenge,
      signature: signChallenge({
        userId,
        deviceId: otherDeviceId,
        challenge: secondChallenge,
      }),
    },
    pending.accessToken,
  );
  assert.equal(wrongDevice.statusCode, 403);
  assert.equal(wrongDevice.json.error, "RECOVERY_PROOF_INVALID");
  assert.equal((await sessionState(pending.accessToken))?.proved, true);
  assert.equal((await sessionState(pending.accessToken))?.device_id, pendingDeviceId);
  assert.equal(
    (await call(app, "GET", "/account/recovery/key/wrap", undefined, pending.accessToken)).statusCode,
    200,
  );

  const replaced = await call(app, "POST", "/account/recovery/key/prove", {}, pending.accessToken);
  assert.equal(replaced.statusCode, 200);
  const kept = await call(app, "POST", "/account/recovery/key/prove", {}, pending.accessToken);
  assert.equal(kept.statusCode, 200);
  const retired = await call(
    app,
    "POST",
    "/account/recovery/key/prove",
    {
      challenge: replaced.json.challenge,
      signature: signChallenge({
        userId,
        deviceId: pendingDeviceId,
        challenge: replaced.json.challenge as string,
      }),
    },
    pending.accessToken,
  );
  assert.equal(retired.statusCode, 400);

  const secondProof = await call(
    app,
    "POST",
    "/account/recovery/key/prove",
    {
      challenge: kept.json.challenge,
      signature: signChallenge({
        userId,
        deviceId: pendingDeviceId,
        challenge: kept.json.challenge as string,
      }),
    },
    pending.accessToken,
  );
  assert.equal(secondProof.statusCode, 200);
  assert.equal(secondProof.json.proved, true);
  const reused = await call(
    app,
    "POST",
    "/account/recovery/key/prove",
    {
      challenge: kept.json.challenge,
      signature: signChallenge({
        userId,
        deviceId: pendingDeviceId,
        challenge: kept.json.challenge as string,
      }),
    },
    pending.accessToken,
  );
  assert.equal(reused.statusCode, 400);
  const afterSecondProof = await sessionState(pending.accessToken);
  assert.equal(afterSecondProof?.proved, true);
  assert.equal(afterSecondProof?.device_id, pendingDeviceId);
  assert.equal(afterSecondProof?.challenge, null);

  const otherStarted = await call(app, "POST", "/account/recovery/key/prove", {}, other.accessToken);
  assert.equal(otherStarted.statusCode, 200);
  assert.equal(otherStarted.json.deviceId, otherDeviceId);
  const otherProved = await call(
    app,
    "POST",
    "/account/recovery/key/prove",
    {
      challenge: otherStarted.json.challenge,
      signature: signChallenge({
        userId,
        deviceId: otherDeviceId,
        challenge: otherStarted.json.challenge as string,
      }),
    },
    other.accessToken,
  );
  assert.equal(otherProved.statusCode, 200);
  assert.equal(otherProved.json.proved, true);
});
