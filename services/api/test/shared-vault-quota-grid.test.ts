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
