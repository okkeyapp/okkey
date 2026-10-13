import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";

import { AccountRecoveryService } from "../src/account-recovery/service.ts";
import type { VaultUnlockBootstrapService } from "../src/account/vault-unlock-bootstrap.ts";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import type { SyncService } from "../src/sync/service.ts";
import type { VaultService } from "../src/vault/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";

  setHeader(_name: string, _value: string): void {}

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

function loggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

const config: ApiConfig = createTestApiConfig();

function createVaultServiceStub(): VaultService {
  return {
    getVault: async () => ({
      id: "v1",
      workspaceId: "w1",
      name: "Personal",
      description: "",
      icon: "🏠",
      isPersonal: true,
      ownerId: "u1",
      cryptoVersion: 2,
      createdAt: "",
      updatedAt: "",
    }),
    listWorkspaceVaults: async () => [],
  } as unknown as VaultService;
}

function createSyncServiceStub(): SyncService {
  return {
    listEvents: async () => [],
    appendEvent: async () => {
      throw new SyncServiceError("SYNC_BAD_REQUEST", 400, "not used");
    },
  } as unknown as SyncService;
}

function createRecoveryService(enrolled: boolean): AccountRecoveryService {
  return {
    hasEnrolledRecoveryKey: async () => enrolled,
  } as unknown as AccountRecoveryService;
}

async function dispatch(input: {
  method: string;
  url: string;
  enrolled: boolean;
  includeUnlockBootstrap?: boolean;
}) {
  const app = createApiApp(config, loggerStub(), {
    vaultService: createVaultServiceStub(),
    syncService: createSyncServiceStub(),
    accountRecoveryService: createRecoveryService(input.enrolled),
    ...(input.includeUnlockBootstrap
      ? {
          vaultUnlockBootstrapService: {
            getForUser: async () => ({
              server_key_share: "aa",
              device_share: "bb",
              password_kdf_salt: "cc",
              password_kdf_params_version: 1,
              encrypted_private_key: {
                crypto_version: 2,
                algorithm: "opaque",
                payload: "dd",
                meta: {},
              },
            }),
          } as unknown as VaultUnlockBootstrapService,
        }
      : {}),
  });
  const req = {
    method: input.method,
    url: input.url,
    headers: { "x-user-id": "u1" },
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

test("hasEnrolledRecoveryKey follows the stored wrap", async () => {
  let present = false;
  const service = new AccountRecoveryService({
    recovery: {
      getWrap: async () => (present ? ({ userId: "u1" } as never) : null),
    },
    workspaces: { listAccessibleByUser: async () => [] },
    users: {
      findById: async () => null,
      findByEmail: async () => null,
      loadVaultUnlockRow: async () => null,
      loadAccountProfile: async () => null,
    },
  });
  assert.equal(await service.hasEnrolledRecoveryKey("u1"), false);
  present = true;
  assert.equal(await service.hasEnrolledRecoveryKey("u1"), true);
});

test("vault and item routes reject an account with no recovery key", async () => {
  const vault = await dispatch({ method: "GET", url: "/vaults/v1", enrolled: false });
  assert.equal(vault.statusCode, 403);
  assert.equal(JSON.parse(vault.body).error, "RECOVERY_KEY_REQUIRED");

  const events = await dispatch({ method: "GET", url: "/vaults/v1/events", enrolled: false });
  assert.equal(events.statusCode, 403);
  assert.equal(JSON.parse(events.body).error, "RECOVERY_KEY_REQUIRED");

  const list = await dispatch({
    method: "GET",
    url: "/workspaces/w1/vaults",
    enrolled: false,
  });
  assert.equal(list.statusCode, 403);
  assert.equal(JSON.parse(list.body).error, "RECOVERY_KEY_REQUIRED");
});

test("vault routes proceed after a recovery key is saved", async () => {
  const vault = await dispatch({ method: "GET", url: "/vaults/v1", enrolled: true });
  assert.equal(vault.statusCode, 200);
  assert.equal(JSON.parse(vault.body).id, "v1");
});

test("unlock bootstrap stays available without a recovery key", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vault/unlock-bootstrap",
    enrolled: false,
    includeUnlockBootstrap: true,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).server_key_share, "aa");
});

test("missing user id is not reported as a missing recovery key", async () => {
  const app = createApiApp(config, loggerStub(), {
    vaultService: createVaultServiceStub(),
    accountRecoveryService: createRecoveryService(false),
  });
  const req = {
    method: "GET",
    url: "/vaults/v1",
    headers: {},
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  assert.equal(res.statusCode, 401);
  assert.equal(JSON.parse(res.body).error, "AUTH_REQUIRED");
});
