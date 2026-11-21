/**
 * OKKEYAPP-230: shared-vault quota at the service boundary.
 * Self-hosted without modules and SaaS PREMIUM both allow one shared vault.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WorkspaceSharedVaultsService,
  WorkspaceSharedVaultsServiceError,
} from "../src/workspace-shared-vaults/service.ts";
import { entitlementConfig } from "./entitlement-config.ts";

const actorId = "1000000000000000001";

function serviceFor(input: {
  planTier: string;
  sharedVaultCount: string;
  deploymentMode: "saas" | "self_hosted";
  enterpriseModulesEnabled: boolean;
}) {
  return new WorkspaceSharedVaultsService({
    vaults: {
      findById: async () => null,
      listAccessibleByWorkspace: async () => [],
      listByWorkspace: async () => [],
      canReadVault: async () => false,
      canManageVaultSettings: async () => false,
      create: async () => {
        throw new Error("not used");
      },
      updateMetadata: async () => null,
      deleteById: async () => false,
    },
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "WS",
        ownerId: actorId,
        planTier: input.planTier,
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    db: {
      query: async () => [{ count: input.sharedVaultCount }],
      transaction: async () => {
        throw new Error("quota gate should reject before insert");
      },
    },
    config: entitlementConfig({
      deploymentMode: input.deploymentMode,
      enterpriseModulesEnabled: input.enterpriseModulesEnabled,
    }),
  });
}

async function expectSharedVaultQuota(service: WorkspaceSharedVaultsService): Promise<void> {
  await assert.rejects(
    () =>
      service.createSharedVault("w1", actorId, {
        name: "Second shared vault",
        encryptedPayload: { v: 1, alg: "none", ciphertext: "" },
        members: [
          {
            userId: actorId,
            profileId: "1000000000000000002",
            encryptedVaultKey: { v: 1, alg: "none", ciphertext: "" },
          },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceSharedVaultsServiceError);
      assert.equal(error.code, "PLAN_QUOTA_EXCEEDED");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
}

test("self-hosted without modules rejects a second shared vault", async () => {
  const service = serviceFor({
    planTier: "ENTERPRISE",
    sharedVaultCount: "1",
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: false,
  });
  await expectSharedVaultQuota(service);
});

test("SaaS PREMIUM rejects a second shared vault", async () => {
  const service = serviceFor({
    planTier: "PREMIUM",
    sharedVaultCount: "1",
    deploymentMode: "saas",
    enterpriseModulesEnabled: false,
  });
  await expectSharedVaultQuota(service);
});

const FREE_ACTOR = "1000000000000000001";
const FREE_PROFILE = "1000000000000000002";
const FREE_VAULT = "1000000000000000005";
const FREE_WORKSPACE = "w1";
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

function freeCreateInput(name: string) {
  return {
    name,
    encryptedPayload: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: "YQ==",
      meta: { entity: "vault_event_payload" },
    },
    members: [
      {
        userId: FREE_ACTOR,
        profileId: FREE_PROFILE,
        encryptedVaultKey: hybridWrap(FREE_ACTOR),
      },
    ],
  };
}

/** FREE maxSharedVaults = 1: deleting frees the quota slot for another create. */
test("FREE: delete shared vault frees the quota slot for the next create", async () => {
  let sharedCount = 0;
  let currentVault: {
    id: string;
    workspaceId: string;
    name: string;
    description: string;
    icon: string;
    isPersonal: boolean;
    ownerId: string;
    cryptoVersion: number;
    createdAt: string;
    updatedAt: string;
  } | null = null;

  const service = new WorkspaceSharedVaultsService({
    vaults: {
      findById: async () => currentVault,
      listAccessibleByWorkspace: async () => [],
      listByWorkspace: async () => [],
      canReadVault: async () => true,
      canManageVaultSettings: async () => true,
      create: async () => {
        throw new Error("not used");
      },
      updateMetadata: async () => null,
      deleteById: async (vaultId: string) => {
        if (!currentVault || currentVault.id !== vaultId) {
          return false;
        }
        currentVault = null;
        sharedCount = Math.max(0, sharedCount - 1);
        return true;
      },
    },
    workspaces: {
      findById: async () => ({
        id: FREE_WORKSPACE,
        name: "WS",
        ownerId: FREE_ACTOR,
        planTier: "FREE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    db: {
      query: async (sql: string) => {
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: FREE_ACTOR }];
        }
        if (sql.includes("COUNT") && sql.includes("is_personal")) {
          return [{ count: String(sharedCount) }];
        }
        if (sql.includes("public_pq_key")) {
          return [{ public_key: VALID_PK, public_pq_key: VALID_PQ }];
        }
        return [];
      },
      transaction: async <T>(
        fn: (tx: { query: (sql: string) => Promise<unknown[]> }) => Promise<T>,
      ) =>
        fn({
          query: async (sql: string) => {
            if (sql.includes("INSERT INTO vaults")) {
              sharedCount += 1;
              currentVault = {
                id: FREE_VAULT,
                workspaceId: FREE_WORKSPACE,
                name: "Shared",
                description: "",
                icon: "",
                isPersonal: false,
                ownerId: FREE_ACTOR,
                cryptoVersion: 2,
                createdAt: "",
                updatedAt: "",
              };
              return [
                {
                  id: FREE_VAULT,
                  workspace_id: FREE_WORKSPACE,
                  name: "Shared",
                  description: "",
                  icon: "",
                  is_personal: false,
                  owner_id: FREE_ACTOR,
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
              return [{ id: FREE_PROFILE, builtin_key: "extended" }];
            }
            if (sql.includes("current_version")) {
              return [{ current_version: 0 }];
            }
            return [];
          },
        }),
    },
    config: entitlementConfig(),
  });

  const first = await service.createSharedVault(FREE_WORKSPACE, FREE_ACTOR, freeCreateInput("First"));
  assert.equal(first.id, FREE_VAULT);
  assert.equal(sharedCount, 1);

  await assert.rejects(
    () => service.createSharedVault(FREE_WORKSPACE, FREE_ACTOR, freeCreateInput("Second")),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceSharedVaultsServiceError);
      assert.equal(error.code, "PLAN_QUOTA_EXCEEDED");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );

  await service.deleteVault(FREE_VAULT, FREE_ACTOR);
  assert.equal(sharedCount, 0);
  assert.equal(currentVault, null);

  const again = await service.createSharedVault(FREE_WORKSPACE, FREE_ACTOR, freeCreateInput("Again"));
  assert.equal(again.id, FREE_VAULT);
  assert.equal(sharedCount, 1);
});
