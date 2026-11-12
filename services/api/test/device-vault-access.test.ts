import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import { DeviceService } from "../src/device/service.ts";
import { VaultUnlockBootstrapService } from "../src/account/vault-unlock-bootstrap.ts";
import type { SessionService } from "../src/session/service.ts";
import type { VaultService } from "../src/vault/service.ts";
import type { SyncService } from "../src/sync/service.ts";
import type { VaultSharingService } from "../src/vault-sharing/service.ts";
import type { AccountRecoveryService } from "../src/account-recovery/service.ts";
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

const SESSION_FP = "web_app-chrome-macos-14.5";
const OTHER_FP = "web_app-firefox-linux-6.1";
const WORKSPACE_ID = "1000000000000000001";
const VAULT_ID = "1000000000000000002";

test("vault routes reject pending, revoked, and blocked devices and keep device list open", async () => {
  let deviceStatus = "trusted";
  let sessionDeviceId: string | null = "d1";
  const deviceService = new DeviceService({
    devices: {
      isTrustedDevice: async () => deviceStatus === "trusted",
      listByUser: async () => [],
      clearExpiredBlocks: async () => {},
    } as never,
    config: { deviceApprovalTtlSeconds: 60, publicAppBaseUrl: "https://app.test" },
  });
  const sessionService = {
    resolveAccessToken: async () => ({
      userId: "u1",
      deviceId: sessionDeviceId,
      scope: null,
      tokenHash: "hash",
      expiresAt: "2099-01-01T00:00:00.000Z",
      recoveryProvedAt: null,
      recoveryChallenge: null,
      recoveryChallengeExpiresAt: null,
    }),
    hashAccessToken: () => "hash",
    setRecoveryChallenge: async () => sessionDeviceId != null,
    consumeRecoveryChallenge: async () => false,
    markRecoveryProved: async () => false,
  } as unknown as SessionService;
  const identityBlob = Buffer.from(
    JSON.stringify({
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.alloc(8).toString("base64"),
      meta: {},
    }),
  );
  const bootstrap = new VaultUnlockBootstrapService({
    users: {
      loadVaultUnlockRow: async () => ({
        serverKeyShare: Buffer.alloc(32, 1),
        passwordKdfSalt: Buffer.alloc(16, 2),
        passwordKdfParamsVersion: 2,
        encryptedPrivateKey: identityBlob,
      }),
    },
    devices: {
      findTrustedDeviceShareById: async (_userId, deviceId) => {
        if (deviceId !== "d1" || deviceStatus !== "trusted") {
          return null;
        }
        return { share: Uint8Array.from({ length: 32 }, (_, i) => i + 1) };
      },
    },
  });
  const app = createApiApp(createTestApiConfig(), loggerStub(), {
    deviceService,
    sessionService,
    vaultUnlockBootstrapService: bootstrap,
    vaultService: {
      listAccessibleWorkspaces: async () => [],
      listWorkspaceVaults: async () => [],
      getVault: async () => ({ id: "v1" }),
    } as unknown as VaultService,
    syncService: {
      listEvents: async () => [],
      appendEvent: async () => ({ version: 1 }),
    } as unknown as SyncService,
    vaultSharingService: {
      getUserVaultKey: async () => ({ vaultId: "v1" }),
    } as unknown as VaultSharingService,
    accountRecoveryService: {
      hasExportedRecoveryKey: async () => true,
      getKeyWrap: async () => ({ encryptedBlob: { payload: "wrap-secret" } }),
      getIdentityEncryptedKey: async () => ({
        encrypted_private_key: { payload: "identity-secret" },
      }),
      getRecoveryPossession: async () => ({ kind: "ready" as const, publicKey: "cHVibGlj" }),
      getStatus: async () => ({
        entitlements: { recoveryKey: true, trustedDevices: false, trustedContacts: true },
        settings: { keyEnabled: true, devicesEnabled: false, contactsEnabled: true },
        key: {
          enrolled: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          rotatedAt: null,
          exportedAt: "2026-01-02T00:00:00.000Z",
        },
        contacts: [{ id: "c1", email: "hidden@example.com", status: "confirmed" }],
        confirmedContactCount: 1,
        minConfirmedContacts: 3,
        pendingInvites: [],
        servingAsContact: [],
      }),
    } as unknown as AccountRecoveryService,
    usersRepository: {
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
        throw new Error("profile patch must not run before the device is trusted");
      },
    } as never,
  });

  const paths: Array<{ method: string; url: string; body?: unknown }> = [
    { method: "GET", url: "/workspaces" },
    { method: "GET", url: `/workspaces/${WORKSPACE_ID}/vaults` },
    { method: "GET", url: `/vaults/${VAULT_ID}` },
    { method: "GET", url: `/vaults/${VAULT_ID}/key` },
    { method: "GET", url: `/vaults/${VAULT_ID}/events` },
    {
      method: "POST",
      url: `/vaults/${VAULT_ID}/events`,
      body: { eventType: "ITEM_UPDATE", encryptedBlob: { payload: "aa" }, baseVersion: 0 },
    },
    { method: "GET", url: "/account/recovery/key/wrap" },
    { method: "GET", url: "/account/recovery/identity-encrypted-key" },
    { method: "GET", url: "/account/profile" },
    { method: "GET", url: "/account/vault-unlock/status" },
    {
      method: "GET",
      url: `/vault/unlock-bootstrap?device_fingerprint=${OTHER_FP}`,
    },
  ];

  async function call(method: string, url: string, body?: unknown) {
    const req = {
      method,
      url,
      headers: { authorization: "Bearer tok" },
      body,
    } as IncomingMessage;
    const res = new MockResponse();
    await app.handler()(req, res as unknown as ServerResponse);
    return { statusCode: res.statusCode, body: res.body };
  }

  async function assertRecoveryMethodsOpen(label: string) {
    const methods = await call("GET", "/account/recovery");
    assert.equal(methods.statusCode, 200, `${label} GET /account/recovery`);
    assert.equal(methods.body.includes("hidden@example.com"), false, `${label} contact directory`);
    assert.equal(methods.body.includes("wrap-secret"), false, `${label} wrap material`);
    const started = await call("POST", "/account/recovery/key/prove", {});
    if (sessionDeviceId) {
      assert.equal(started.statusCode, 200, `${label} recovery challenge`);
      assert.equal(started.body.includes("wrap-secret"), false);
      assert.equal(started.body.includes("identity-secret"), false);
    } else {
      assert.equal(started.statusCode, 403, `${label} recovery challenge without a device`);
      assert.equal(started.body.includes("RECOVERY_PROOF_REQUIRES_DEVICE"), true);
      assert.equal(started.body.includes("wrap-secret"), false);
    }
  }

  for (const status of ["pending", "revoked", "blocked"]) {
    deviceStatus = status;
    sessionDeviceId = "d1";
    for (const path of paths) {
      const code = (await call(path.method, path.url, path.body)).statusCode;
      assert.equal(code, 401, `${status} ${path.method} ${path.url} -> ${code}`);
    }
    const devices = (await call("GET", "/devices")).statusCode;
    assert.equal(devices, 200, `${status} GET /devices`);
    await assertRecoveryMethodsOpen(status);
  }

  sessionDeviceId = null;
  deviceStatus = "pending";
  for (const path of paths) {
    const code = (await call(path.method, path.url, path.body)).statusCode;
    assert.equal(code, 401, `unbound ${path.method} ${path.url} -> ${code}`);
  }
  assert.equal((await call("GET", "/devices")).statusCode, 200);
  await assertRecoveryMethodsOpen("unbound");

  deviceStatus = "trusted";
  sessionDeviceId = "d1";
  for (const path of paths.filter((path) => !path.url.includes("unlock-bootstrap"))) {
    const code = (await call(path.method, path.url, path.body)).statusCode;
    assert.notEqual(code, 401, `trusted ${path.method} ${path.url}`);
  }
  const trustedMethods = await call("GET", "/account/recovery");
  assert.equal(trustedMethods.statusCode, 200);
  assert.equal(trustedMethods.body.includes("hidden@example.com"), true);

  const foreign = (
    await call("GET", `/vault/unlock-bootstrap?device_fingerprint=${OTHER_FP}`)
  ).statusCode;
  assert.equal(foreign, 200);

  const own = (
    await call("GET", `/vault/unlock-bootstrap?device_fingerprint=${SESSION_FP}`)
  ).statusCode;
  assert.equal(own, 200);
});
