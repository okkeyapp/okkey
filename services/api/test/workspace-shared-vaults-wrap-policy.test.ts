/**
 * Hybrid vault-key wrap policy on enterprise create + grant paths.
 * Mirrors Core vault-sharing assert: scheme, crypto_version, recipient_user_id.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WorkspaceSharedVaultsService,
  WorkspaceSharedVaultsServiceError,
} from "../src/workspace-shared-vaults/service.ts";
import { entitlementConfig } from "./entitlement-config.ts";

const actorId = "1000000000000000001";
const granteeId = "1000000000000000002";
const profileId = "1000000000000000003";
const workspaceId = "1000000000000000004";
const vaultId = "1000000000000000005";

const VALID_PK = Buffer.alloc(32, 1).toString("base64");
const VALID_PQ = Buffer.alloc(1184, 2).toString("base64");

function hybridWrap(recipientUserId: string) {
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: "Yg==",
    meta: {
      entity: "vault_key_wrap",
      key_wrap_scheme: "hybrid_ecc_pq_v1",
      recipient_user_id: recipientUserId,
    },
  };
}

function payloadBlob() {
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: "YQ==",
    meta: { entity: "vault_event_payload" },
  };
}

function paidWorkspace() {
  return {
    id: workspaceId,
    name: "WS",
    ownerId: actorId,
    planTier: "TEAM",
    createdAt: "",
    updatedAt: "",
  };
}

function sharedVault() {
  return {
    id: vaultId,
    workspaceId,
    name: "Shared",
    description: "",
    icon: "",
    isPersonal: false,
    ownerId: actorId,
    cryptoVersion: 2,
    createdAt: "",
    updatedAt: "",
  };
}

function keysDb() {
  return {
    async query(sql: string): Promise<unknown[]> {
      if (sql.includes("SELECT owner_id FROM workspaces")) {
        return [{ owner_id: actorId }];
      }
      if (sql.includes("COUNT") && sql.includes("is_personal")) {
        return [{ count: "0" }];
      }
      if (sql.includes("public_pq_key")) {
        return [{ public_key: VALID_PK, public_pq_key: VALID_PQ }];
      }
      if (sql.includes("FROM profiles")) {
        return [{ id: profileId, builtin_key: "extended" }];
      }
      return [];
    },
    async transaction<T>(fn: (tx: { query: (sql: string) => Promise<unknown[]> }) => Promise<T>) {
      return fn({
        async query(sql: string) {
          if (sql.includes("INSERT INTO vaults")) {
            return [
              {
                id: vaultId,
                workspace_id: workspaceId,
                name: "Shared",
                description: "",
                icon: "",
                is_personal: false,
                owner_id: actorId,
                crypto_version: 2,
                created_at: "",
                updated_at: "",
              },
            ];
          }
          if (sql.includes("SELECT EXISTS")) {
            return [{ ok: true }];
          }
          if (sql.includes("FROM profiles")) {
            return [{ id: profileId, builtin_key: "extended" }];
          }
          if (sql.includes("current_version")) {
            return [{ current_version: 0 }];
          }
          return [];
        },
      });
    },
  };
}

function createService(opts?: { captureKeys?: string[] }) {
  const captured = opts?.captureKeys;
  const db = keysDb();
  const baseQuery = db.query.bind(db);
  db.query = async (sql: string) => {
    if (captured && sql.includes("INSERT INTO vault_keys")) {
      captured.push(sql);
    }
    return baseQuery(sql);
  };
  const baseTx = db.transaction.bind(db);
  db.transaction = async <T>(fn: (tx: { query: (sql: string) => Promise<unknown[]> }) => Promise<T>) =>
    baseTx(async (tx) => {
      const inner = tx.query.bind(tx);
      return fn({
        async query(sql: string, ...rest: unknown[]) {
          if (captured && sql.includes("INSERT INTO vault_keys")) {
            const params = rest[0] as unknown[] | undefined;
            const blobBuf = params?.[3];
            if (Buffer.isBuffer(blobBuf)) {
              captured.push(blobBuf.toString("utf8"));
            } else {
              captured.push(sql);
            }
          }
          return inner(sql);
        },
      });
    });

  return new WorkspaceSharedVaultsService({
    vaults: {
      findById: async () => sharedVault(),
      listAccessibleByWorkspace: async () => [],
      listByWorkspace: async () => [],
      canReadVault: async () => true,
      canManageVaultSettings: async () => true,
      create: async () => {
        throw new Error("not used");
      },
      updateMetadata: async () => null,
      deleteById: async () => false,
    },
    workspaces: {
      findById: async () => paidWorkspace(),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    db,
    vaultSharing: {
      shareVault: async () => {},
      revokeVaultAccess: async () => {},
    },
    config: entitlementConfig(),
  });
}

async function expectWrapReject(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof WorkspaceSharedVaultsServiceError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, 400);
    return true;
  });
}

test("createSharedVault rejects classical key_wrap_scheme", async () => {
  const service = createService();
  await expectWrapReject(
    () =>
      service.createSharedVault(workspaceId, actorId, {
        name: "Shared",
        encryptedPayload: payloadBlob(),
        members: [
          {
            userId: actorId,
            profileId,
            encryptedVaultKey: {
              ...hybridWrap(actorId),
              meta: {
                ...hybridWrap(actorId).meta,
                key_wrap_scheme: "x25519_ecdh_xchacha_v1",
              },
            },
          },
        ],
      }),
    "VAULT_KEY_WRAP_INVALID",
  );
});

test("createSharedVault rejects crypto_version 1", async () => {
  const service = createService();
  await expectWrapReject(
    () =>
      service.createSharedVault(workspaceId, actorId, {
        name: "Shared",
        encryptedPayload: payloadBlob(),
        members: [
          {
            userId: actorId,
            profileId,
            encryptedVaultKey: {
              ...hybridWrap(actorId),
              crypto_version: 1,
            },
          },
        ],
      }),
    "VAULT_KEY_WRAP_INVALID",
  );
});

test("createSharedVault rejects missing key_wrap_scheme (no auto-stamp)", async () => {
  const service = createService();
  const wrap = hybridWrap(actorId);
  const { key_wrap_scheme: _removed, ...metaWithoutScheme } = wrap.meta;
  await expectWrapReject(
    () =>
      service.createSharedVault(workspaceId, actorId, {
        name: "Shared",
        encryptedPayload: payloadBlob(),
        members: [
          {
            userId: actorId,
            profileId,
            encryptedVaultKey: { ...wrap, meta: metaWithoutScheme },
          },
        ],
      }),
    "VAULT_KEY_WRAP_INVALID",
  );
});

test("createSharedVault rejects spoofed recipient_user_id", async () => {
  const service = createService();
  await expectWrapReject(
    () =>
      service.createSharedVault(workspaceId, actorId, {
        name: "Shared",
        encryptedPayload: payloadBlob(),
        members: [
          {
            userId: actorId,
            profileId,
            encryptedVaultKey: hybridWrap(granteeId),
          },
        ],
      }),
    "VAULT_KEY_WRAP_INVALID",
  );
});

test("createSharedVault accepts hybrid wrap and stores client scheme", async () => {
  const captured: string[] = [];
  const service = createService({ captureKeys: captured });
  const created = await service.createSharedVault(workspaceId, actorId, {
    name: "Shared",
    encryptedPayload: payloadBlob(),
    members: [
      {
        userId: actorId,
        profileId,
        encryptedVaultKey: hybridWrap(actorId),
      },
    ],
  });
  assert.equal(created.id, vaultId);
  assert.ok(captured.length >= 1);
  const stored = JSON.parse(captured[0]!) as {
    crypto_version: number;
    meta: Record<string, unknown>;
  };
  assert.equal(stored.crypto_version, 2);
  assert.equal(stored.meta["key_wrap_scheme"], "hybrid_ecc_pq_v1");
  assert.equal(stored.meta["recipient_user_id"], actorId);
});

test("updateVaultAccess grant rejects classical key_wrap_scheme", async () => {
  const service = createService();
  await expectWrapReject(
    () =>
      service.updateVaultAccess(vaultId, actorId, {
        grants: [
          {
            userId: granteeId,
            profileId,
            encryptedVaultKey: {
              ...hybridWrap(granteeId),
              meta: {
                ...hybridWrap(granteeId).meta,
                key_wrap_scheme: "x25519_ecdh_xchacha_v1",
              },
            },
          },
        ],
        profileUpdates: [],
        revokes: [],
        baseVersion: 0,
      }),
    "VAULT_KEY_WRAP_INVALID",
  );
});

test("updateVaultAccess grant rejects crypto_version 1", async () => {
  const service = createService();
  await expectWrapReject(
    () =>
      service.updateVaultAccess(vaultId, actorId, {
        grants: [
          {
            userId: granteeId,
            profileId,
            encryptedVaultKey: { ...hybridWrap(granteeId), crypto_version: 1 },
          },
        ],
        profileUpdates: [],
        revokes: [],
        baseVersion: 0,
      }),
    "VAULT_KEY_WRAP_INVALID",
  );
});

test("updateVaultAccess grant rejects missing key_wrap_scheme", async () => {
  const service = createService();
  const wrap = hybridWrap(granteeId);
  const { key_wrap_scheme: _removed, ...metaWithoutScheme } = wrap.meta;
  await expectWrapReject(
    () =>
      service.updateVaultAccess(vaultId, actorId, {
        grants: [
          {
            userId: granteeId,
            profileId,
            encryptedVaultKey: { ...wrap, meta: metaWithoutScheme },
          },
        ],
        profileUpdates: [],
        revokes: [],
        baseVersion: 0,
      }),
    "VAULT_KEY_WRAP_INVALID",
  );
});

test("updateVaultAccess grant rejects spoofed recipient_user_id", async () => {
  const service = createService();
  await expectWrapReject(
    () =>
      service.updateVaultAccess(vaultId, actorId, {
        grants: [
          {
            userId: granteeId,
            profileId,
            encryptedVaultKey: hybridWrap(actorId),
          },
        ],
        profileUpdates: [],
        revokes: [],
        baseVersion: 0,
      }),
    "VAULT_KEY_WRAP_INVALID",
  );
});

test("updateVaultAccess grant accepts hybrid wrap", async () => {
  const keyWrites: string[] = [];
  const service = createService();
  const db = (service as unknown as { db: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> } }).db;
  const original = db.query.bind(db);
  db.query = async (sql: string, params?: unknown[]) => {
    if (sql.includes("INSERT INTO vault_keys") && params?.[3] && Buffer.isBuffer(params[3])) {
      keyWrites.push(params[3].toString("utf8"));
    }
    return original(sql, params);
  };

  await service.updateVaultAccess(vaultId, actorId, {
    grants: [
      {
        userId: granteeId,
        profileId,
        encryptedVaultKey: hybridWrap(granteeId),
      },
    ],
    profileUpdates: [],
    revokes: [],
    baseVersion: 0,
  });
  assert.equal(keyWrites.length, 1);
  const stored = JSON.parse(keyWrites[0]!) as {
    crypto_version: number;
    meta: Record<string, unknown>;
  };
  assert.equal(stored.crypto_version, 2);
  assert.equal(stored.meta["key_wrap_scheme"], "hybrid_ecc_pq_v1");
  assert.equal(stored.meta["recipient_user_id"], granteeId);
});

test("updateVaultAccess rejects invalid grant before profileUpdates apply", async () => {
  let profileWrites = 0;
  const service = createService();
  const db = (service as unknown as { db: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> } }).db;
  const original = db.query.bind(db);
  db.query = async (sql: string, params?: unknown[]) => {
    if (sql.includes("INSERT INTO vault_profiles")) {
      profileWrites += 1;
    }
    return original(sql, params);
  };

  await expectWrapReject(
    () =>
      service.updateVaultAccess(vaultId, actorId, {
        grants: [
          {
            userId: granteeId,
            profileId,
            encryptedVaultKey: {
              ...hybridWrap(granteeId),
              meta: {
                ...hybridWrap(granteeId).meta,
                key_wrap_scheme: "x25519_ecdh_xchacha_v1",
              },
            },
          },
        ],
        profileUpdates: [{ userId: actorId, profileId }],
        revokes: [],
        baseVersion: 0,
      }),
    "VAULT_KEY_WRAP_INVALID",
  );
  assert.equal(profileWrites, 0);
});
