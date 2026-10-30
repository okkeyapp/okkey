import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";

import { AccountRecoveryService } from "../src/account-recovery/service.ts";
import type { VaultUnlockBootstrapService } from "../src/account/vault-unlock-bootstrap.ts";
import { createApiApp } from "../src/app.ts";
import type { CapsuleService } from "../src/capsule/service.ts";
import type { ApiConfig } from "../src/config.ts";
import { SyncServiceError, type SyncService } from "../src/sync/service.ts";
import type { VaultService } from "../src/vault/service.ts";
import type { WorkspacePersonalSyncService } from "../src/workspace-personal-sync/service.ts";
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

function createRecoveryService(exported: boolean): AccountRecoveryService {
  return {
    hasExportedRecoveryKey: async () => exported,
  } as unknown as AccountRecoveryService;
}

function createPersonalSyncStub(): WorkspacePersonalSyncService {
  return {
    listEvents: async () => [],
    appendEvent: async () => {
      throw new Error("not used");
    },
  } as unknown as WorkspacePersonalSyncService;
}

function createCapsuleServiceStub(): CapsuleService {
  return {
    listOwnerCapsules: async () => ({ capsules: [], page: 1, pageSize: 30, total: 0 }),
    createCapsule: async () => ({ capsuleId: "c1" }),
    getOwnerCapsule: async () => ({ capsuleId: "c1" }),
    getCapsuleMetadata: async () => ({ capsuleId: "c1" }),
  } as unknown as CapsuleService;
}

async function dispatch(input: {
  method: string;
  url: string;
  exported: boolean;
  includeUnlockBootstrap?: boolean;
  includeCapsules?: boolean;
  headers?: Record<string, string>;
}) {
  const app = createApiApp(config, loggerStub(), {
    vaultService: createVaultServiceStub(),
    syncService: createSyncServiceStub(),
    workspacePersonalSyncService: createPersonalSyncStub(),
    accountRecoveryService: createRecoveryService(input.exported),
    ...(input.includeCapsules
      ? { capsuleService: createCapsuleServiceStub() }
      : {}),
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
    headers: input.headers ?? { "x-user-id": "u1" },
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

test("hasEnrolledRecoveryKey follows the stored wrap", async () => {
  let present = false;
  const service = new AccountRecoveryService({
    recovery: {
      getWrap: async () => (present ? ({ userId: "u1", exportedAt: null } as never) : null),
    },
    workspaces: { listAccessibleByUser: async () => [] },
    users: {
      findById: async () => null,
      findByEmail: async () => null,
      loadVaultUnlockRow: async () => null,
      loadAccountProfile: async () => null,
    },
    devices: { listByUser: async () => [] },
  });
  assert.equal(await service.hasEnrolledRecoveryKey("u1"), false);
  present = true;
  assert.equal(await service.hasEnrolledRecoveryKey("u1"), true);
});

test("hasExportedRecoveryKey requires export acknowledgement", async () => {
  let wrap: { userId: string; exportedAt: string | null } | null = null;
  const service = new AccountRecoveryService({
    recovery: {
      getWrap: async () => wrap as never,
    },
    workspaces: { listAccessibleByUser: async () => [] },
    users: {
      findById: async () => null,
      findByEmail: async () => null,
      loadVaultUnlockRow: async () => null,
      loadAccountProfile: async () => null,
    },
    devices: { listByUser: async () => [] },
  });
  assert.equal(await service.hasExportedRecoveryKey("u1"), false);
  wrap = { userId: "u1", exportedAt: null };
  assert.equal(await service.hasExportedRecoveryKey("u1"), false);
  wrap = { userId: "u1", exportedAt: "2026-01-01T00:00:00.000Z" };
  assert.equal(await service.hasExportedRecoveryKey("u1"), true);
});

test("vault and item routes reject an account without an exported recovery key", async () => {
  const vault = await dispatch({
    method: "GET",
    url: "/vaults/1000000000000000001",
    exported: false,
  });
  assert.equal(vault.statusCode, 403);
  assert.equal(JSON.parse(vault.body).error, "RECOVERY_KEY_REQUIRED");

  const events = await dispatch({
    method: "GET",
    url: "/vaults/1000000000000000001/events",
    exported: false,
  });
  assert.equal(events.statusCode, 403);
  assert.equal(JSON.parse(events.body).error, "RECOVERY_KEY_REQUIRED");

  const list = await dispatch({
    method: "GET",
    url: "/workspaces/1000000000000000002/vaults",
    exported: false,
  });
  assert.equal(list.statusCode, 403);
  assert.equal(JSON.parse(list.body).error, "RECOVERY_KEY_REQUIRED");

  const personal = await dispatch({
    method: "GET",
    url: "/workspaces/1000000000000000002/personal-events",
    exported: false,
  });
  assert.equal(personal.statusCode, 403);
  assert.equal(JSON.parse(personal.body).error, "RECOVERY_KEY_REQUIRED");
});

test("capsule routes reject an account without an exported recovery key", async () => {
  const list = await dispatch({
    method: "GET",
    url: "/workspaces/1000000000000000002/capsules",
    exported: false,
    includeCapsules: true,
  });
  assert.equal(list.statusCode, 403);
  assert.equal(JSON.parse(list.body).error, "RECOVERY_KEY_REQUIRED");

  const owner = await dispatch({
    method: "GET",
    url: "/capsules/1000000000000000003/owner",
    exported: false,
    includeCapsules: true,
  });
  assert.equal(owner.statusCode, 403);
  assert.equal(JSON.parse(owner.body).error, "RECOVERY_KEY_REQUIRED");

  const pending = await dispatch({
    method: "GET",
    url: "/capsule-approval-requests",
    exported: false,
    includeCapsules: true,
  });
  assert.equal(pending.statusCode, 403);
  assert.equal(JSON.parse(pending.body).error, "RECOVERY_KEY_REQUIRED");
});

test("guest capsule metadata stays available without a recovery key", async () => {
  const meta = await dispatch({
    method: "GET",
    url: "/capsules/1000000000000000003",
    exported: false,
    includeCapsules: true,
    headers: {},
  });
  // No user id → recovery gate passes through; route itself has no auth requirement.
  assert.notEqual(JSON.parse(meta.body).error, "RECOVERY_KEY_REQUIRED");
});

test("vault routes proceed after a recovery key is exported", async () => {
  const vault = await dispatch({
    method: "GET",
    url: "/vaults/1000000000000000001",
    exported: true,
  });
  assert.equal(vault.statusCode, 200);
  assert.equal(JSON.parse(vault.body).id, "v1");
});

test("capsule routes proceed after a recovery key is exported", async () => {
  const list = await dispatch({
    method: "GET",
    url: "/workspaces/1000000000000000002/capsules",
    exported: true,
    includeCapsules: true,
  });
  assert.equal(list.statusCode, 200);
});

test("unlock bootstrap stays available without a recovery key", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vault/unlock-bootstrap",
    exported: false,
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
    url: "/vaults/1000000000000000001",
    headers: {},
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  assert.equal(res.statusCode, 401);
  assert.equal(JSON.parse(res.body).error, "AUTH_REQUIRED");
});
