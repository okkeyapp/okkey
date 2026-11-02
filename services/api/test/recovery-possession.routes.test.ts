import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import { recoveryPossessionAttestationMessage } from "../src/account-recovery/possession-proof.ts";
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

const VERIFIER = Buffer.alloc(32, 7).toString("base64");
const OTHER = Buffer.alloc(32, 9).toString("base64");
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

function attestation(challenge: string, userId = "u1") {
  const recordedAt = new Date().toISOString();
  const message = recoveryPossessionAttestationMessage({
    userId,
    recordedAt,
    challenge,
  });
  const signature = sign(null, message, privateKey).toString("base64");
  return {
    purpose: "account.recovery_possession" as const,
    user_id: userId,
    recorded_at: recordedAt,
    challenge,
    signature,
  };
}

test("pending session loads recovery methods, proves the key, and still cannot read vault secrets early", async () => {
  let trusted = false;
  let proved = false;
  let challenge: string | null = null;
  let storedVerifier: string | null = VERIFIER;
  let claimed = false;

  const deviceService = {
    isSessionDeviceTrusted: async () => trusted,
    registerDevice: async () => {
      claimed = true;
      return { deviceId: "d-new", status: "trusted" as const, created: true };
    },
  } as unknown as DeviceService;

  const sessionService = {
    resolveAccessToken: async () => ({
      userId: "u1",
      deviceId: "d-pending",
      scope: null,
      tokenHash: "hash",
      expiresAt: "2099-01-01T00:00:00.000Z",
      recoveryProvedAt: proved ? "2099-01-01T00:00:00.000Z" : null,
      recoveryChallenge: challenge,
    }),
    markRecoveryProved: async () => {
      proved = true;
      challenge = null;
      return true;
    },
    setRecoveryChallenge: async (_token: string, _userId: string, value: string) => {
      challenge = value;
      return true;
    },
    hashAccessToken: () => "hash",
    bindAccessTokenDevice: async () => {
      trusted = true;
      return true;
    },
  } as unknown as SessionService;

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
      pendingInvites: [
        {
          id: "i1",
          ownerEmail: "owner@example.com",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      servingAsContact: [],
    }),
    checkRecoveryPossession: async (_userId: string, verifier: string) => {
      if (!storedVerifier) {
        return { kind: "legacy" as const, encryptedBlob: WRAP, encryptedPrivateKey: IDENTITY };
      }
      if (verifier !== storedVerifier) {
        return { kind: "mismatch" as const };
      }
      return { kind: "match" as const };
    },
    storePossessionVerifierIfAbsent: async (_userId: string, verifier: string) => {
      storedVerifier = verifier;
      return true;
    },
    getKeyWrap: async () => ({ encryptedBlob: WRAP }),
    getIdentityEncryptedKey: async () => ({ encryptedPrivateKey: IDENTITY }),
  } as unknown as AccountRecoveryService;

  const app = createApiApp(createTestApiConfig(), loggerStub(), {
    deviceService,
    sessionService,
    accountRecoveryService,
    usersRepository: {
      findById: async () => ({
        id: "u1",
        email: "a@b.c",
        publicKey: publicKeyB64,
        publicPqKey: null,
        locale: "en",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
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
  });

  async function call(method: string, url: string, body?: unknown) {
    const req = {
      method,
      url,
      headers: { authorization: "Bearer tok" },
      body,
    } as IncomingMessage;
    const res = new MockResponse();
    await app.handler()(req, res as unknown as ServerResponse);
    return {
      statusCode: res.statusCode,
      json: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {},
    };
  }

  const methods = await call("GET", "/account/recovery");
  assert.equal(methods.statusCode, 200);
  assert.equal((methods.json.settings as { keyEnabled: boolean }).keyEnabled, true);
  assert.equal((methods.json.key as { enrolled: boolean }).enrolled, true);
  assert.deepEqual(methods.json.contacts, []);
  assert.deepEqual(methods.json.pendingInvites, []);
  assert.equal(JSON.stringify(methods.json).includes("hidden@example.com"), false);
  assert.equal(methods.json.encryptedBlob, undefined);

  const blocked = [
    ["GET", "/account/recovery/key/wrap"],
    ["GET", "/account/recovery/identity-encrypted-key"],
    ["GET", "/workspaces"],
    ["GET", "/account/profile"],
    ["GET", "/vaults/v1/key"],
  ] as const;
  for (const [method, url] of blocked) {
    const res = await call(method, url);
    assert.equal(res.statusCode, 401, `${method} ${url}`);
    assert.equal(res.json.error, "AUTH_REQUIRED");
  }

  const claimEarly = await call("POST", "/devices/register", {
    device_public_key: Buffer.alloc(32, 3).toString("base64"),
    device_share: Buffer.alloc(32, 4).toString("base64"),
    device_fingerprint: "ab".repeat(16),
    device_name: "Browser",
    metadata: { claim_after_recovery: true },
  });
  assert.equal(claimEarly.statusCode, 403);
  assert.equal(claimEarly.json.error, "RECOVERY_PROOF_REQUIRED");
  assert.equal(claimed, false);

  const wrong = await call("POST", "/account/recovery/key/prove", { possessionVerifier: OTHER });
  assert.equal(wrong.statusCode, 403);
  assert.equal(wrong.json.error, "RECOVERY_PROOF_INVALID");
  assert.equal((await call("GET", "/account/recovery/key/wrap")).statusCode, 401);
  assert.equal(proved, false);

  const provedRes = await call("POST", "/account/recovery/key/prove", { possessionVerifier: VERIFIER });
  assert.equal(provedRes.statusCode, 200);
  assert.equal(provedRes.json.proved, true);
  assert.equal(provedRes.json.encryptedBlob, undefined);

  const wrap = await call("GET", "/account/recovery/key/wrap");
  assert.equal(wrap.statusCode, 200);
  assert.equal((wrap.json.encryptedBlob as { payload: string }).payload, WRAP.payload);

  const identity = await call("GET", "/account/recovery/identity-encrypted-key");
  assert.equal(identity.statusCode, 200);

  const workspaces = await call("GET", "/workspaces");
  assert.equal(workspaces.statusCode, 200);

  const password = await call("POST", "/account/master-password/change", {
    server_key_share: Buffer.alloc(32, 1).toString("base64"),
    password_kdf_salt: Buffer.alloc(16, 2).toString("base64"),
    password_kdf_params_version: 2,
  });
  assert.equal(password.statusCode, 200);

  assert.equal((await call("GET", "/account/profile")).statusCode, 401);
  assert.equal((await call("GET", "/vaults/v1/key")).statusCode, 401);

  const claim = await call("POST", "/devices/register", {
    device_public_key: Buffer.alloc(32, 3).toString("base64"),
    device_share: Buffer.alloc(32, 4).toString("base64"),
    device_fingerprint: "ab".repeat(16),
    device_name: "Browser",
    metadata: { claim_after_recovery: true },
  });
  assert.equal(claim.statusCode, 200);
  assert.equal(claim.json.status, "trusted");
  assert.equal(claimed, true);
  assert.equal(trusted, true);
  assert.equal((await call("GET", "/vaults/v1/key")).statusCode, 200);

  trusted = true;
  const directory = await call("GET", "/account/recovery");
  assert.equal(directory.statusCode, 200);
  assert.equal((directory.json.contacts as unknown[]).length, 1);
});

test("legacy wrap returns ciphertext only inside the proof ceremony and grants the session after attestation", async () => {
  let proved = false;
  let challenge: string | null = null;
  let storedVerifier: string | null = null;

  const sessionService = {
    resolveAccessToken: async () => ({
      userId: "u1",
      deviceId: "d-pending",
      scope: null,
      tokenHash: "hash",
      expiresAt: "2099-01-01T00:00:00.000Z",
      recoveryProvedAt: proved ? "2099-01-01T00:00:00.000Z" : null,
      recoveryChallenge: challenge,
    }),
    markRecoveryProved: async () => {
      proved = true;
      challenge = null;
      return true;
    },
    setRecoveryChallenge: async (_token: string, _userId: string, value: string) => {
      challenge = value;
      return true;
    },
    hashAccessToken: () => "hash",
    bindAccessTokenDevice: async () => true,
  } as unknown as SessionService;

  const accountRecoveryService = {
    hasExportedRecoveryKey: async () => true,
    getStatus: async () => ({
      entitlements: { recoveryKey: true as const, trustedDevices: false, trustedContacts: false },
      settings: { keyEnabled: true, devicesEnabled: false, contactsEnabled: false },
      key: { enrolled: true, createdAt: null, rotatedAt: null, exportedAt: null },
      contacts: [],
      confirmedContactCount: 0,
      minConfirmedContacts: 3,
      pendingInvites: [],
      servingAsContact: [],
    }),
    checkRecoveryPossession: async () =>
      storedVerifier
        ? { kind: "match" as const }
        : { kind: "legacy" as const, encryptedBlob: WRAP, encryptedPrivateKey: IDENTITY },
    storePossessionVerifierIfAbsent: async (_userId: string, verifier: string) => {
      storedVerifier = verifier;
      return true;
    },
    getKeyWrap: async () => ({ encryptedBlob: WRAP }),
    getIdentityEncryptedKey: async () => ({ encryptedPrivateKey: IDENTITY }),
  } as unknown as AccountRecoveryService;

  const app = createApiApp(createTestApiConfig(), loggerStub(), {
    deviceService: {
      isSessionDeviceTrusted: async () => false,
    } as unknown as DeviceService,
    sessionService,
    accountRecoveryService,
    usersRepository: {
      findById: async () => ({ publicKey: publicKeyB64 }),
      loadAccountProfile: async () => {
        throw new Error("profile must stay closed");
      },
      updateAccountProfile: async () => {
        throw new Error("profile patch must not run");
      },
      recordVaultUnlock: async () => false,
    } as never,
    vaultService: {
      listAccessibleWorkspaces: async () => [],
    } as unknown as VaultService,
  });

  async function call(method: string, url: string, body?: unknown) {
    const req = {
      method,
      url,
      headers: { authorization: "Bearer tok" },
      body,
    } as IncomingMessage;
    const res = new MockResponse();
    await app.handler()(req, res as unknown as ServerResponse);
    return {
      statusCode: res.statusCode,
      json: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {},
    };
  }

  assert.equal((await call("GET", "/account/recovery/key/wrap")).statusCode, 401);
  assert.equal((await call("GET", "/workspaces")).statusCode, 401);

  const started = await call("POST", "/account/recovery/key/prove", { possessionVerifier: VERIFIER });
  assert.equal(started.statusCode, 200);
  assert.equal(started.json.proved, false);
  assert.equal(started.json.status, "attestation_required");
  assert.equal(typeof started.json.challenge, "string");
  assert.equal(proved, false);
  assert.equal((await call("GET", "/account/recovery/key/wrap")).statusCode, 401);
  assert.equal((await call("GET", "/workspaces")).statusCode, 401);

  const forged = attestation(started.json.challenge as string);
  forged.signature = Buffer.alloc(64, 1).toString("base64");
  const rejected = await call("POST", "/account/recovery/key/prove", {
    possessionVerifier: VERIFIER,
    attestation: forged,
  });
  assert.equal(rejected.statusCode, 403);
  assert.equal(proved, false);

  const accepted = await call("POST", "/account/recovery/key/prove", {
    possessionVerifier: VERIFIER,
    attestation: attestation(started.json.challenge as string),
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.json.proved, true);
  assert.equal(storedVerifier, VERIFIER);
  assert.equal((await call("GET", "/account/recovery/key/wrap")).statusCode, 200);
  assert.equal((await call("GET", "/account/profile")).statusCode, 401);
});
