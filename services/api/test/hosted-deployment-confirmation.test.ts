/**
 * Hosted mode requires plugin confirmation of a signed hosted token.
 * OKKEY_DEPLOYMENT_MODE alone never makes the instance hosted.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PLAN_LICENSE_LAPSED,
  resolveEntitlementPlanTier,
} from "@okkey/types";

import { loadConfig } from "../src/config.ts";
import { effectiveDeploymentMode } from "../src/deployment-mode.ts";
import {
  isEnterpriseModulesEntitlementActive,
  planEntitlementRuntimeFromConfig,
  workspaceHasPlanFeature,
  workspacePlanEntitlementOptions,
  workspacePlanFeatureWriteDecision,
} from "../src/plan-entitlements.ts";
import type { ApiEnterprisePluginContext } from "../src/plugins/types.ts";
import { createTestApiConfig } from "./test-api-config.ts";

function withEnv(vars: Record<string, string | undefined>, run: () => void | Promise<void>) {
  const snapshot = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    snapshot.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return Promise.resolve()
    .then(() => run())
    .finally(() => {
      for (const [key, value] of snapshot.entries()) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test("effectiveDeploymentMode: env saas without confirmation stays self_hosted", () => {
  assert.equal(
    effectiveDeploymentMode({
      deploymentModeRequested: "saas",
      hostedDeploymentConfirmed: false,
    }),
    "self_hosted",
  );
  assert.equal(
    effectiveDeploymentMode({
      deploymentModeRequested: "saas",
      hostedDeploymentConfirmed: true,
    }),
    "saas",
  );
  assert.equal(
    effectiveDeploymentMode({
      deploymentModeRequested: "self_hosted",
      hostedDeploymentConfirmed: true,
    }),
    "self_hosted",
  );
});

test("loadConfig: OKKEY_DEPLOYMENT_MODE=saas starts unconfirmed as self_hosted", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-hosted-unconfirmed-"));
  try {
    mkdirSync(path.join(dir, "backend/api-plugin"), { recursive: true });
    writeFileSync(path.join(dir, "backend/api-plugin/index.ts"), "export {};\n");
    await withEnv(
      {
        OKKEY_DEPLOYMENT_MODE: "saas",
        ENTERPRISE_MODULES: "true",
        ENTERPRISE_MODULES_PATH: dir,
      },
      () => {
        const cfg = loadConfig();
        assert.equal(cfg.deploymentModeRequested, "saas");
        assert.equal(cfg.hostedDeploymentConfirmed, false);
        assert.equal(cfg.deploymentMode, "self_hosted");
        assert.equal(effectiveDeploymentMode(cfg), "self_hosted");
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("env hosted without confirmation: plan_tier ignored, license required", () => {
  const config = createTestApiConfig({
    deploymentModeRequested: "saas",
    hostedDeploymentConfirmed: false,
    enterpriseModulesEnabled: true,
    enterpriseLicenseVerified: false,
  });
  assert.equal(effectiveDeploymentMode(config), "self_hosted");
  assert.equal(config.deploymentMode, "self_hosted");
  assert.equal(isEnterpriseModulesEntitlementActive(config), false);

  const options = workspacePlanEntitlementOptions(config, { planTier: "ENTERPRISE" });
  assert.equal(options.deploymentMode, "self_hosted");
  assert.equal(options.enterpriseModulesActive, false);
  assert.equal(resolveEntitlementPlanTier("ENTERPRISE", options), "FREE");
  assert.equal(workspaceHasPlanFeature(config, { planTier: "ENTERPRISE" }, "customWorkspaceRoles"), false);
  assert.equal(workspaceHasPlanFeature(config, { planTier: "ENTERPRISE" }, "sharedVaults"), true);

  const write = workspacePlanFeatureWriteDecision(
    config,
    { planTier: "ENTERPRISE" },
    "customWorkspaceRoles",
  );
  assert.equal(write.allowed, false);
  if (!write.allowed) {
    assert.equal(write.code, "PLAN_FEATURE_REQUIRED");
    assert.equal(write.status, 403);
  }
});

test("confirmed hosted: plan_tier decides free vs enterprise", () => {
  const config = createTestApiConfig({
    deploymentModeRequested: "saas",
    hostedDeploymentConfirmed: true,
    enterpriseModulesEnabled: true,
    enterpriseLicenseVerified: false,
  });
  assert.equal(effectiveDeploymentMode(config), "saas");
  assert.equal(isEnterpriseModulesEntitlementActive(config), false);

  assert.equal(workspaceHasPlanFeature(config, { planTier: "FREE" }, "monitoring"), false);
  assert.equal(workspaceHasPlanFeature(config, { planTier: "FREE" }, "capsuleAccessSettings"), false);
  assert.equal(workspaceHasPlanFeature(config, { planTier: "ENTERPRISE" }, "monitoring"), true);
  assert.equal(workspaceHasPlanFeature(config, { planTier: "ENTERPRISE" }, "customWorkspaceRoles"), true);
  assert.equal(workspaceHasPlanFeature(config, { planTier: "TEAM" }, "capsuleAccessSettings"), true);
  assert.equal(workspaceHasPlanFeature(config, { planTier: "PREMIUM" }, "capsuleAccessSettings"), false);

  const freeWrite = workspacePlanFeatureWriteDecision(
    config,
    { planTier: "FREE" },
    "customWorkspaceRoles",
  );
  assert.equal(freeWrite.allowed, false);
  if (!freeWrite.allowed) {
    assert.equal(freeWrite.code, "PLAN_FEATURE_REQUIRED");
  }
  const entWrite = workspacePlanFeatureWriteDecision(
    config,
    { planTier: "ENTERPRISE" },
    "customWorkspaceRoles",
  );
  assert.equal(entWrite.allowed, true);
});

test("self-hosted with plan_tier=ENTERPRISE and no license keeps modules off", () => {
  const config = createTestApiConfig({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: true,
    enterpriseLicenseVerified: false,
  });
  assert.equal(effectiveDeploymentMode(config), "self_hosted");
  const options = planEntitlementRuntimeFromConfig(config);
  assert.equal(options.enterpriseModulesActive, false);
  assert.equal(resolveEntitlementPlanTier("ENTERPRISE", options), "FREE");
  assert.equal(workspaceHasPlanFeature(config, { planTier: "ENTERPRISE" }, "monitoring"), false);
});

test("setHostedDeploymentConfirmed revoke falls back to self-hosted at runtime", () => {
  const config = createTestApiConfig({
    deploymentModeRequested: "saas",
    hostedDeploymentConfirmed: false,
    enterpriseModulesEnabled: true,
    enterpriseLicenseVerified: true,
  });

  const setHostedDeploymentConfirmed: ApiEnterprisePluginContext["setHostedDeploymentConfirmed"] = (
    confirmed,
  ) => {
    config.hostedDeploymentConfirmed = confirmed;
    config.deploymentMode = effectiveDeploymentMode(config);
  };

  setHostedDeploymentConfirmed(true);
  assert.equal(effectiveDeploymentMode(config), "saas");
  assert.equal(config.deploymentMode, "saas");
  assert.equal(workspaceHasPlanFeature(config, { planTier: "FREE" }, "monitoring"), false);
  assert.equal(workspaceHasPlanFeature(config, { planTier: "ENTERPRISE" }, "monitoring"), true);

  setHostedDeploymentConfirmed(false);
  assert.equal(effectiveDeploymentMode(config), "self_hosted");
  assert.equal(config.deploymentMode, "self_hosted");
  // Self-host + verified license → ENTERPRISE matrix regardless of plan_tier.
  assert.equal(workspaceHasPlanFeature(config, { planTier: "FREE" }, "monitoring"), true);
  assert.equal(workspaceHasPlanFeature(config, { planTier: "FREE" }, "customWorkspaceRoles"), true);
});

test("startup warning for unconfirmed hosted env is neutral and non-fatal", () => {
  const indexPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/index.ts");
  const indexSource = readFileSync(indexPath, "utf8");
  assert.match(
    indexSource,
    /OKKEY_DEPLOYMENT_MODE requests hosted mode; running as self-hosted until the loaded plugin confirms a signed hosted token/,
  );
  assert.doesNotMatch(indexSource, /bypass|vulnerab|private repo/i);
});

test("confirmed hosted ignores self-host lapse soft-lock for plan_tier features", () => {
  const config = createTestApiConfig({
    deploymentModeRequested: "saas",
    hostedDeploymentConfirmed: true,
    enterpriseModulesEnabled: true,
    enterpriseLicenseVerified: true,
    enterpriseLicenseLapsed: true,
  });
  const options = planEntitlementRuntimeFromConfig(config);
  assert.equal(options.deploymentMode, "saas");
  const write = workspacePlanFeatureWriteDecision(
    config,
    { planTier: "ENTERPRISE" },
    "customWorkspaceRoles",
  );
  assert.equal(write.allowed, true);
  assert.notEqual(
    write.allowed === false ? write.code : null,
    PLAN_LICENSE_LAPSED,
  );
});
