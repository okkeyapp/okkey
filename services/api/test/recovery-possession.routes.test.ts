import test from "node:test";
import assert from "node:assert/strict";
import { MASTER_PASSWORD_POLICY_VERSION } from "@okkey/types";
import { generateKeyPairSync, sign } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import { recoveryPossessionProofMessage } from "../src/account-recovery/possession-proof.ts";
import {
  RECOVERY_PROOF_SESSION_MAX_FAILURES,
} from "../src/account-recovery/recovery-proof-attempts.ts";
import type { AccountRecoveryService } from "../src/account-recovery/service.ts";
import type { DeviceService } from "../src/device/service.ts";
import type { SessionService } from "../src/session/service.ts";
import type { VaultService } from "../src/vault/service.ts";
import type { VaultSharingService } from "../src/vault-sharing/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

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

function loggerStub() {
  return { info() {}, warn() {}, error() {} };
}

const WRAP = {
  crypto_version: 2,
  algorithm: "xchacha20-poly1305",
  payload: Buffer.from("wrap-ciphertext").toString("base64"),
  meta: { entity: "vault_key_recovery_wrap", key_scope: "account" },
};
const IDENTITY = {
  crypto_version: 2,
  algorithm: "xchacha20-poly1305",
  payload: Buffer.from("identity-ciphertext").toString("base64"),
  meta: { entity: "user_private_key_bundle" },
};

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const spki = publicKey.export({ type: "spki", format: "der" });
const publicKeyB64 = Buffer.from(spki.subarray(spki.length - 32)).toString("base64");

function signChallenge(input: { userId: string; deviceId: string; challenge: string }): string {
  return sign(null, recoveryPossessionProofMessage(input), privateKey).toString("base64");
}

type SessionRow = {
  userId: string;
  deviceId: string | null;
  tokenHash: string;
  proved: boolean;
  challenge: string | null;
  challengeExpiresAt: string | null;
};

function createHarness(options?: { publicKey?: string | null; now?: () => number }) {
  const possessionPublicKey = options?.publicKey === undefined ? publicKeyB64 : options.publicKey;
  let trusted = false;
  let claimed = false;
  let clock = Date.parse("2026-06-01T00:00:00.000Z");
  const sessions = new Map<string, SessionRow>();
  sessions.set("hash-a", {
    userId: "u1",
    deviceId: "d-pending",
    tokenHash: "hash-a",
    proved: false,
    challenge: null,
    challengeExpiresAt: null,
  });
  sessions.set("hash-b", {
    userId: "u1",
    deviceId: "d-other",
    tokenHash: "hash-b",
    proved: false,
    challenge: null,
    challengeExpiresAt: null,
  });
  let activeHash = "hash-a";

  const sessionService = {
    resolveAccessToken: async (token: string) => {
      const hash = token.startsWith("tok-") ? `hash-${token.slice("tok-".length)}` : "hash-a";
      activeHash = hash;
      const row = sessions.get(hash);
      if (!row) {
        return null;
      }
      return {
        userId: row.userId,
        deviceId: row.deviceId,
        scope: null,
        tokenHash: row.tokenHash,
        expiresAt: "2099-01-01T00:00:00.000Z",
        recoveryProvedAt: row.proved ? "2099-01-01T00:00:00.000Z" : null,
        recoveryChallenge: row.challenge,
        recoveryChallengeExpiresAt: row.challengeExpiresAt,
      };
    },
    hashAccessToken: (token: string) =>
      token.startsWith("tok-") ? `hash-${token.slice("tok-".length)}` : "hash-a",
    markRecoveryProved: async (token: string) => {
      const row = sessions.get(sessionService.hashAccessToken(token));
      if (!row) {
        return false;
      }
      row.proved = true;
      row.challenge = null;
      row.challengeExpiresAt = null;
      return true;
    },
    setRecoveryChallenge: async (
      token: string,
      _userId: string,
      challenge: string,
      expiresAtIso: string,
    ) => {
      const row = sessions.get(sessionService.hashAccessToken(token));
      // Same rule as SessionsRepository.setRecoveryChallenge: a proved session
      // may take another single-use nonce. Do not reject when row.proved.
      if (!row?.deviceId) {
        return false;
      }
      row.challenge = challenge;
      row.challengeExpiresAt = expiresAtIso;
      return true;
    },
    consumeRecoveryChallenge: async (token: string, _userId: string, challenge: string) => {
      const row = sessions.get(sessionService.hashAccessToken(token));
      if (!row?.deviceId || row.challenge !== challenge) {
        return false;
      }
      row.challenge = null;
      row.challengeExpiresAt = null;
      return true;
    },
    bindAccessTokenDevice: async () => {
      trusted = true;
      return true;
    },
  } as unknown as SessionService;

  const deviceService = {
    isSessionDeviceTrusted: async () => trusted,
    registerDevice: async () => {
      claimed = true;
      return { deviceId: "d-new", status: "trusted" as const, created: true };
    },
  } as unknown as DeviceService;

  const accountRecoveryService = {
    hasExportedRecoveryKey: async () => true,
    getStatus: async () => ({
      entitlements: { recoveryKey: true as const, trustedDevices: false, trustedContacts: true },
      settings: { keyEnabled: true, devicesEnabled: false, contactsEnabled: true },
      key: {
        enrolled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        rotatedAt: null,
        exportedAt: "2026-01-02T00:00:00.000Z",
      },
      contacts: [
        {
          id: "c1",
          email: "hidden@example.com",
          status: "confirmed" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
          confirmedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      confirmedContactCount: 1,
      minConfirmedContacts: 3,
      pendingInvites: [],
      servingAsContact: [],
    }),
    getRecoveryPossession: async () =>
      possessionPublicKey
        ? { kind: "ready" as const, publicKey: possessionPublicKey }
        : { kind: "legacy" as const },
    getKeyWrap: async () => ({ encryptedBlob: WRAP }),
    getIdentityEncryptedKey: async () => ({ encryptedPrivateKey: IDENTITY }),
  } as unknown as AccountRecoveryService;

  const app = createApiApp(createTestApiConfig(), loggerStub(), {
    deviceService,
    sessionService,
    accountRecoveryService,
    usersRepository: {
      findById: async () => ({ publicKey: "identity-public" }),
      loadAccountProfile: async () => ({
        email: "a@b.c",
        firstName: "A",
        lastName: "B",
        locale: "en",
        billingRegion: null,
        vaultIdleLockSeconds: 900,
        masterPasswordChangedAt: "2026-01-01T00:00:00.000Z",
      }),
      updateAccountProfile: async () => {
        throw new Error("profile patch must not run");
      },
      recordVaultUnlock: async () => true,
      updateMasterPasswordShares: async () => "2026-01-03T00:00:00.000Z",
    } as never,
    vaultService: {
      listAccessibleWorkspaces: async () => [{ id: "w1", name: "Personal" }],
    } as unknown as VaultService,
    vaultSharingService: {
      getUserVaultKey: async () => ({ vaultId: "v1", encryptedVaultKey: WRAP }),
    } as unknown as VaultSharingService,
  }, { recoveryProofNow: options?.now });

  return {
    app,
    sessions,
    get trusted() {
      return trusted;
    },
    get claimed() {
      return claimed;
    },
    setClock(ms: number) {
      clock = ms;
    },
    advance(ms: number) {
      clock += ms;
    },
    now: () => clock,
  };
}

async function call(
  app: ReturnType<typeof createApiApp>,
  method: string,
  url: string,
  body?: unknown,
  token = "tok-a",
) {
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
    raw: res.body,
  };
}

test("pending session proves with a device-bound challenge and does not receive ciphertext early", async () => {
  const harness = createHarness();
  const app = harness.app;

  const methods = await call(app, "GET", "/account/recovery");
  assert.equal(methods.statusCode, 200);
  assert.deepEqual(methods.json.contacts, []);
  assert.equal(methods.raw.includes("hidden@example.com"), false);

  for (const url of [
    "/account/recovery/key/wrap",
    "/account/recovery/identity-encrypted-key",
    "/workspaces",
    "/account/profile",
    "/vaults/1000000000000000002/key",
  ]) {
    const blocked = await call(app, "GET", url);
    assert.equal(blocked.statusCode, 401, url);
  }

  const claimEarly = await call(app, "POST", "/devices/register", {
    device_public_key: Buffer.alloc(32, 3).toString("base64"),
    device_share: Buffer.alloc(32, 4).toString("base64"),
    device_fingerprint: "ab".repeat(16),
    device_name: "Browser",
    metadata: { claim_after_recovery: true },
  });
  assert.equal(claimEarly.statusCode, 403);
  assert.equal(claimEarly.json.error, "RECOVERY_PROOF_REQUIRED");
  assert.equal(harness.claimed, false);

  const started = await call(app, "POST", "/account/recovery/key/prove", {});
  assert.equal(started.statusCode, 200);
  assert.equal(started.json.proved, false);
  assert.equal(typeof started.json.challenge, "string");
  assert.equal(started.json.deviceId, "d-pending");
  assert.equal(started.raw.includes("encryptedBlob"), false);
  assert.equal(started.raw.includes("encryptedPrivateKey"), false);
  assert.equal(started.raw.includes(WRAP.payload), false);

  const wrong = await call(app, "POST", "/account/recovery/key/prove", {
    challenge: started.json.challenge,
    signature: Buffer.alloc(64, 9).toString("base64"),
  });
  assert.equal(wrong.statusCode, 403);
  assert.equal(wrong.json.error, "RECOVERY_PROOF_INVALID");
  assert.equal((await call(app, "GET", "/account/recovery/key/wrap")).statusCode, 401);

  const replayedWrong = await call(app, "POST", "/account/recovery/key/prove", {
    challenge: started.json.challenge,
    signature: Buffer.alloc(64, 9).toString("base64"),
  });
  assert.equal(replayedWrong.statusCode, 400);

  const again = await call(app, "POST", "/account/recovery/key/prove", {});
  const signature = signChallenge({
    userId: "u1",
    deviceId: "d-pending",
    challenge: again.json.challenge as string,
  });
  const otherSession = await call(
    app,
    "POST",
    "/account/recovery/key/prove",
    { challenge: again.json.challenge, signature },
    "tok-b",
  );
  assert.notEqual(otherSession.statusCode, 200);
  assert.equal(otherSession.raw.includes(WRAP.payload), false);

  const proved = await call(app, "POST", "/account/recovery/key/prove", {
    challenge: again.json.challenge,
    signature,
  });
  assert.equal(proved.statusCode, 200);
  assert.equal(proved.json.proved, true);
  assert.equal(proved.raw.includes("encryptedBlob"), false);

  const reused = await call(app, "POST", "/account/recovery/key/prove", {
    challenge: again.json.challenge,
    signature,
  });
  assert.equal(reused.statusCode, 400);

  assert.equal((await call(app, "GET", "/account/recovery/key/wrap")).statusCode, 200);
  assert.equal((await call(app, "GET", "/account/recovery/identity-encrypted-key")).statusCode, 200);
  assert.equal((await call(app, "GET", "/workspaces")).statusCode, 200);
  assert.equal(
    (
      await call(app, "POST", "/account/master-password/change", {
        server_key_share: Buffer.alloc(32, 1).toString("base64"),
        password_kdf_salt: Buffer.alloc(16, 2).toString("base64"),
        password_kdf_params_version: 2,
        master_password_policy_version: MASTER_PASSWORD_POLICY_VERSION,
      })
    ).statusCode,
    200,
  );
  assert.equal((await call(app, "GET", "/account/profile")).statusCode, 401);
  assert.equal((await call(app, "GET", "/vaults/1000000000000000002/key")).statusCode, 401);

  const claim = await call(app, "POST", "/devices/register", {
    device_public_key: Buffer.alloc(32, 3).toString("base64"),
    device_share: Buffer.alloc(32, 4).toString("base64"),
    device_fingerprint: "ab".repeat(16),
    device_name: "Browser",
    metadata: { claim_after_recovery: true },
  });
  assert.equal(claim.statusCode, 200);
  assert.equal(claim.json.status, "trusted");
  assert.equal((await call(app, "GET", "/vaults/1000000000000000002/key")).statusCode, 200);
});

test("legacy wrap and a session with no device do not receive ciphertext", async () => {
  const harness = createHarness({ publicKey: null });
  harness.sessions.set("hash-unbound", {
    userId: "u1",
    deviceId: null,
    tokenHash: "hash-unbound",
    proved: false,
    challenge: null,
    challengeExpiresAt: null,
  });

  const legacy = await call(harness.app, "POST", "/account/recovery/key/prove", {});
  assert.equal(legacy.statusCode, 409);
  assert.equal(legacy.json.error, "RECOVERY_PROOF_UNAVAILABLE");
  assert.equal(legacy.raw.includes("encryptedBlob"), false);
  assert.equal(legacy.raw.includes("encryptedPrivateKey"), false);
  assert.equal(legacy.raw.includes(WRAP.payload), false);
  assert.equal(legacy.raw.includes(IDENTITY.payload), false);
  assert.equal((await call(harness.app, "GET", "/account/recovery/key/wrap")).statusCode, 401);

  const randomVerifier = await call(harness.app, "POST", "/account/recovery/key/prove", {
    possessionVerifier: Buffer.alloc(32, 1).toString("base64"),
  });
  assert.equal(randomVerifier.statusCode, 409);
  assert.equal(randomVerifier.json.error, "RECOVERY_PROOF_UNAVAILABLE");
  assert.equal(randomVerifier.raw.includes(WRAP.payload), false);

  const unbound = await call(harness.app, "POST", "/account/recovery/key/prove", {}, "tok-unbound");
  assert.equal(unbound.statusCode, 403);
  assert.equal(unbound.json.error, "RECOVERY_PROOF_REQUIRES_DEVICE");
  assert.equal(unbound.raw.includes("encryptedBlob"), false);

  const nullBody = await call(harness.app, "POST", "/account/recovery/key/prove", null);
  assert.equal(nullBody.statusCode, 400);
  assert.equal(nullBody.json.error, "RECOVERY_BAD_REQUEST");
});

test("failed proofs lock the session and a correct signature stays rejected until the window passes", async () => {
  let clock = Date.parse("2026-06-01T00:00:00.000Z");
  const harness = createHarness({ now: () => clock });
  try {
    const app = harness.app;
    for (let attempt = 0; attempt < RECOVERY_PROOF_SESSION_MAX_FAILURES; attempt += 1) {
      const started = await call(app, "POST", "/account/recovery/key/prove", {});
      assert.equal(started.statusCode, 200, `challenge ${attempt}`);
      const failed = await call(app, "POST", "/account/recovery/key/prove", {
        challenge: started.json.challenge,
        signature: Buffer.alloc(64, attempt + 1).toString("base64"),
      });
      assert.equal(failed.statusCode, 403, `failure ${attempt}`);
    }
    const started = await call(app, "POST", "/account/recovery/key/prove", {});
    assert.equal(started.statusCode, 429);
    assert.equal(started.json.error, "RECOVERY_PROOF_LIMITED");
    const signature = signChallenge({
      userId: "u1",
      deviceId: "d-pending",
      challenge: "ignored",
    });
    const locked = await call(app, "POST", "/account/recovery/key/prove", {
      challenge: "ignored",
      signature,
    });
    assert.equal(locked.statusCode, 429);
    assert.equal((await call(app, "GET", "/account/recovery/key/wrap")).statusCode, 401);

    clock += 15 * 60 * 1000 + 1;
    const fresh = await call(app, "POST", "/account/recovery/key/prove", {});
    assert.equal(fresh.statusCode, 200);
    const ok = await call(app, "POST", "/account/recovery/key/prove", {
      challenge: fresh.json.challenge,
      signature: signChallenge({
        userId: "u1",
        deviceId: "d-pending",
        challenge: fresh.json.challenge as string,
      }),
    });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json.proved, true);
  } finally {
    // clock is local; nothing global to restore
  }
});

test("account lockout applies to a second session after the account budget is spent", async () => {
  let clock = Date.parse("2026-07-01T00:00:00.000Z");
  try {
    const harness = createHarness({ now: () => clock });
    harness.sessions.set("hash-b", {
      userId: "u1",
      deviceId: "d-other",
      tokenHash: "hash-b",
      proved: false,
      challenge: null,
      challengeExpiresAt: null,
    });
    const app = harness.app;
    for (let sessionRound = 0; sessionRound < 2; sessionRound += 1) {
      const token = sessionRound === 0 ? "tok-a" : "tok-b";
      for (let attempt = 0; attempt < RECOVERY_PROOF_SESSION_MAX_FAILURES; attempt += 1) {
        clock += 1;
        const started = await call(app, "POST", "/account/recovery/key/prove", {}, token);
        assert.equal(started.statusCode, 200, `${token} challenge ${attempt}`);
        const failed = await call(
          app,
          "POST",
          "/account/recovery/key/prove",
          {
            challenge: started.json.challenge,
            signature: Buffer.alloc(64, 3).toString("base64"),
          },
          token,
        );
        assert.equal(failed.statusCode, 403, `${token} failure ${attempt}`);
      }
    }
    harness.sessions.set("hash-c", {
      userId: "u1",
      deviceId: "d-third",
      tokenHash: "hash-c",
      proved: false,
      challenge: null,
      challengeExpiresAt: null,
    });
    const third = await call(app, "POST", "/account/recovery/key/prove", {}, "tok-c");
    assert.equal(third.statusCode, 429);
    assert.equal(third.json.error, "RECOVERY_PROOF_LIMITED");
  } finally {
    // injected clock; nothing global to restore
  }
});

test("a proved session can prove again without dropping the grant or the device", async () => {
  const harness = createHarness();
  const app = harness.app;

  const first = await call(app, "POST", "/account/recovery/key/prove", {});
  assert.equal(first.statusCode, 200);
  const firstChallenge = first.json.challenge as string;
  const firstSignature = signChallenge({
    userId: "u1",
    deviceId: "d-pending",
    challenge: firstChallenge,
  });
  const proved = await call(app, "POST", "/account/recovery/key/prove", {
    challenge: firstChallenge,
    signature: firstSignature,
  });
  assert.equal(proved.statusCode, 200);
  assert.equal(proved.json.proved, true);
  assert.equal(harness.sessions.get("hash-a")?.proved, true);
  assert.equal((await call(app, "GET", "/account/recovery/key/wrap")).statusCode, 200);

  const second = await call(app, "POST", "/account/recovery/key/prove", {});
  assert.equal(second.statusCode, 200);
  assert.equal(second.json.proved, false);
  assert.equal(second.json.deviceId, "d-pending");
  const secondChallenge = second.json.challenge as string;
  assert.notEqual(secondChallenge, firstChallenge);
  assert.equal(harness.sessions.get("hash-a")?.proved, true);
  assert.equal(harness.sessions.get("hash-a")?.deviceId, "d-pending");
  assert.equal((await call(app, "GET", "/account/recovery/key/wrap")).statusCode, 200);

  const replayed = await call(app, "POST", "/account/recovery/key/prove", {
    challenge: firstChallenge,
    signature: firstSignature,
  });
  assert.equal(replayed.statusCode, 400);

  const otherSession = await call(
    app,
    "POST",
    "/account/recovery/key/prove",
    {
      challenge: secondChallenge,
      signature: signChallenge({
        userId: "u1",
        deviceId: "d-pending",
        challenge: secondChallenge,
      }),
    },
    "tok-b",
  );
  assert.notEqual(otherSession.statusCode, 200);
  assert.equal(harness.sessions.get("hash-a")?.challenge, secondChallenge);

  const wrongDevice = await call(app, "POST", "/account/recovery/key/prove", {
    challenge: secondChallenge,
    signature: signChallenge({
      userId: "u1",
      deviceId: "d-other",
      challenge: secondChallenge,
    }),
  });
  assert.equal(wrongDevice.statusCode, 403);
  assert.equal(wrongDevice.json.error, "RECOVERY_PROOF_INVALID");
  assert.equal(harness.sessions.get("hash-a")?.proved, true);
  assert.equal(harness.sessions.get("hash-a")?.deviceId, "d-pending");
  assert.equal((await call(app, "GET", "/account/recovery/key/wrap")).statusCode, 200);

  const replaced = await call(app, "POST", "/account/recovery/key/prove", {});
  assert.equal(replaced.statusCode, 200);
  const kept = await call(app, "POST", "/account/recovery/key/prove", {});
  assert.equal(kept.statusCode, 200);
  const retired = await call(app, "POST", "/account/recovery/key/prove", {
    challenge: replaced.json.challenge,
    signature: signChallenge({
      userId: "u1",
      deviceId: "d-pending",
      challenge: replaced.json.challenge as string,
    }),
  });
  assert.equal(retired.statusCode, 400);

  const again = await call(app, "POST", "/account/recovery/key/prove", {
    challenge: kept.json.challenge,
    signature: signChallenge({
      userId: "u1",
      deviceId: "d-pending",
      challenge: kept.json.challenge as string,
    }),
  });
  assert.equal(again.statusCode, 200);
  assert.equal(again.json.proved, true);
  const reused = await call(app, "POST", "/account/recovery/key/prove", {
    challenge: kept.json.challenge,
    signature: signChallenge({
      userId: "u1",
      deviceId: "d-pending",
      challenge: kept.json.challenge as string,
    }),
  });
  assert.equal(reused.statusCode, 400);
  assert.equal(harness.sessions.get("hash-a")?.proved, true);
  assert.equal(harness.sessions.get("hash-a")?.deviceId, "d-pending");
});
