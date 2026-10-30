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

test("vault routes reject pending, revoked, and blocked devices and keep device list open", async () => {
  let deviceStatus = "trusted";
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
      deviceId: "d1",
      scope: null,
      tokenHash: "hash",
      expiresAt: "2099-01-01T00:00:00.000Z",
    }),
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
        return {
          deviceShare: Uint8Array.from({ length: 32 }, (_, i) => i + 1),
          deviceFingerprint: SESSION_FP,
        };
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
      getKeyWrap: async () => ({ ok: true }),
    } as unknown as AccountRecoveryService,
  });

  const paths: Array<{ method: string; url: string; body?: unknown }> = [
    { method: "GET", url: "/workspaces" },
    { method: "GET", url: "/workspaces/w1/vaults" },
    { method: "GET", url: "/vaults/v1" },
    { method: "GET", url: "/vaults/v1/key" },
    { method: "GET", url: "/vaults/v1/events" },
    {
      method: "POST",
      url: "/vaults/v1/events",
      body: { eventType: "ITEM_UPDATE", encryptedBlob: { payload: "aa" }, baseVersion: 0 },
    },
    { method: "GET", url: "/account/recovery/key/wrap" },
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
    return res.statusCode;
  }

  for (const status of ["pending", "revoked", "blocked"]) {
    deviceStatus = status;
    for (const path of paths) {
      const code = await call(path.method, path.url, path.body);
      assert.equal(code, 401, `${status} ${path.method} ${path.url} -> ${code}`);
    }
    const devices = await call("GET", "/devices");
    assert.equal(devices, 200, `${status} GET /devices`);
  }

  deviceStatus = "trusted";
  for (const path of paths.filter((path) => !path.url.includes("unlock-bootstrap"))) {
    const code = await call(path.method, path.url, path.body);
    assert.notEqual(code, 401, `trusted ${path.method} ${path.url}`);
  }

  const foreign = await call(
    "GET",
    `/vault/unlock-bootstrap?device_fingerprint=${OTHER_FP}`,
  );
  assert.equal(foreign, 404);

  const own = await call(
    "GET",
    `/vault/unlock-bootstrap?device_fingerprint=${SESSION_FP}`,
  );
  assert.equal(own, 200);
});
