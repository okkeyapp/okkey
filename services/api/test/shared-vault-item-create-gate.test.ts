import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSharedVaultItemCreateGate } from "../src/sync/shared-vault-item-create-gate.ts";

const workspace = {
  id: "w1",
  name: "Workspace",
  ownerId: "u1",
  planTier: "FREE",
  planCustomOverride: false,
  planFeatureOverrides: {},
  createdAt: "",
  updatedAt: "",
};

const sharedVault = {
  id: "v-shared",
  workspaceId: "w1",
  name: "Shared",
  description: "",
  icon: "💜",
  isPersonal: false,
  ownerId: "u1",
  cryptoVersion: 2,
  createdAt: "",
  updatedAt: "",
};

const personalVault = { ...sharedVault, id: "v1", isPersonal: true, name: "Personal" };

test("allows ITEM_CREATE in personal vault on FREE", () => {
  const result = evaluateSharedVaultItemCreateGate({
    vault: personalVault,
    workspace,
    config: { deploymentMode: "self_hosted", enterpriseModulesEnabled: false },
  });
  assert.equal(result.ok, true);
});

test("denies ITEM_CREATE in shared vault when modules off", () => {
  const result = evaluateSharedVaultItemCreateGate({
    vault: sharedVault,
    workspace,
    config: { deploymentMode: "self_hosted", enterpriseModulesEnabled: false },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "PLAN_FEATURE_REQUIRED");
    assert.equal(result.statusCode, 403);
  }
});

test("denies ITEM_CREATE in shared vault when modules on but plan_tier is FREE", () => {
  const result = evaluateSharedVaultItemCreateGate({
    vault: sharedVault,
    workspace,
    config: { deploymentMode: "self_hosted", enterpriseModulesEnabled: true },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "PLAN_FEATURE_REQUIRED");
  }
});

test("allows ITEM_CREATE in shared vault when modules on and plan_tier is ENTERPRISE", () => {
  const result = evaluateSharedVaultItemCreateGate({
    vault: sharedVault,
    workspace: { ...workspace, planTier: "ENTERPRISE" },
    config: { deploymentMode: "self_hosted", enterpriseModulesEnabled: true },
  });
  assert.equal(result.ok, true);
});
