/**
 * TSK-431: optional modules stay off until the loaded plugin confirms a verified license.
 * ENTERPRISE_MODULES alone never enables the ENTERPRISE entitlement tier on self-host.
 * Lapse soft-lock is independent of verification.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PLAN_LICENSE_LAPSED,
  planFeatureReadable,
  resolveEntitlementPlanTier,
} from "@okkey/types";

import { loadConfig } from "../src/config.ts";
import {
  isEnterpriseModulesEntitlementActive,
  planEntitlementRuntimeFromConfig,
  workspacePlanEntitlementOptions,
  workspacePlanFeatureWriteDecision,
} from "../src/plan-entitlements.ts";
import { loadEnterprisePlugins } from "../src/plugins/load-enterprise-plugins.ts";
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

function selfHostTier(
  config: Parameters<typeof planEntitlementRuntimeFromConfig>[0],
  planTier = "ENTERPRISE",
) {
  return resolveEntitlementPlanTier(
    planTier,
    planEntitlementRuntimeFromConfig(config),
  );
}

test("1: ENTERPRISE_MODULES + loaded plugin without confirmation keeps core tier", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-lic-unverified-"));
  try {
    mkdirSync(path.join(dir, "backend/api-plugin"), { recursive: true });
    writeFileSync(
      path.join(dir, "backend/api-plugin/index.ts"),
      "export function createEnterprisePlugins() { return []; }\n",
    );
    await withEnv(
      {
        ENTERPRISE_MODULES: "true",
        ENTERPRISE_MODULES_PATH: dir,
        OKKEY_DEPLOYMENT_MODE: "self_hosted",
      },
      async () => {
        const cfg = loadConfig();
        assert.equal(cfg.enterpriseModulesRequested, true);
        assert.equal(cfg.enterpriseModulesEnabled, true);
        assert.equal(cfg.enterpriseLicenseVerified, false);

        const load = await loadEnterprisePlugins(cfg);
        assert.equal(load.enterpriseModulesActive, true);

        assert.equal(isEnterpriseModulesEntitlementActive(cfg), false);
        assert.equal(selfHostTier(cfg), "FREE");
        assert.equal(
          workspacePlanEntitlementOptions(cfg, { planTier: "ENTERPRISE" }).enterpriseModulesActive,
          false,
        );
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("2: plugin confirm enables modules; invalid never-verified stays fail-closed; lapse soft-locks", () => {
  const config = createTestApiConfig({
    deploymentMode: "self_hosted",
    enterpriseModulesRequested: true,
    enterpriseModulesEnabled: true,
    enterpriseLicenseVerified: false,
  });

  assert.equal(isEnterpriseModulesEntitlementActive(config), false);
  assert.equal(selfHostTier(config), "FREE");

  const setEnterpriseLicenseVerified: ApiEnterprisePluginContext["setEnterpriseLicenseVerified"] = (
    verified,
  ) => {
    config.enterpriseLicenseVerified = verified;
    if (verified) {
      config.enterpriseLicenseLapsed = false;
    }
  };
  const setEnterpriseLicenseLapsed: ApiEnterprisePluginContext["setEnterpriseLicenseLapsed"] = (
    lapsed,
  ) => {
    config.enterpriseLicenseLapsed = lapsed;
  };

  setEnterpriseLicenseVerified(true);
  assert.equal(isEnterpriseModulesEntitlementActive(config), true);
  assert.equal(selfHostTier(config), "ENTERPRISE");
  const rolesOk = workspacePlanFeatureWriteDecision(
    config,
    { planTier: "FREE" },
    "customWorkspaceRoles",
  );
  assert.equal(rolesOk.allowed, true);

  // Expired: plugin clears verification and reports lapse → soft-lock (402), not 403.
  setEnterpriseLicenseVerified(false);
  setEnterpriseLicenseLapsed(true);
  assert.equal(isEnterpriseModulesEntitlementActive(config), false);
  assert.equal(selfHostTier(config), "FREE");
  const runtime = planEntitlementRuntimeFromConfig(config);
  assert.equal(runtime.enterpriseModulesActive, false);
  assert.equal(runtime.enterpriseLicenseLapsed, true);
  assert.equal(
    planFeatureReadable("FREE", "customWorkspaceRoles", runtime),
    true,
  );
  const rolesLapsed = workspacePlanFeatureWriteDecision(
    config,
    { planTier: "FREE" },
    "customWorkspaceRoles",
  );
  assert.equal(rolesLapsed.allowed, false);
  if (!rolesLapsed.allowed) {
    assert.equal(rolesLapsed.code, PLAN_LICENSE_LAPSED);
    assert.equal(rolesLapsed.status, 402);
  }

  setEnterpriseLicenseLapsed(false);
  setEnterpriseLicenseVerified(true);
  assert.equal(selfHostTier(config), "ENTERPRISE");

  // Invalid / never verified, no lapse → modules fully off (403).
  setEnterpriseLicenseVerified(false);
  assert.equal(isEnterpriseModulesEntitlementActive(config), false);
  assert.equal(config.enterpriseLicenseLapsed, false);
  const rolesOff = workspacePlanFeatureWriteDecision(
    config,
    { planTier: "FREE" },
    "customWorkspaceRoles",
  );
  assert.equal(rolesOff.allowed, false);
  if (!rolesOff.allowed) {
    assert.equal(rolesOff.code, "PLAN_FEATURE_REQUIRED");
    assert.equal(rolesOff.status, 403);
  }
});

test("3: no plugin loaded keeps core behavior", async () => {
  await withEnv(
    {
      ENTERPRISE_MODULES: "false",
      ENTERPRISE_MODULES_PATH: undefined,
      OKKEY_DEPLOYMENT_MODE: "self_hosted",
    },
    async () => {
      const cfg = loadConfig();
      assert.equal(cfg.enterpriseModulesRequested, false);
      assert.equal(cfg.enterpriseModulesEnabled, false);
      assert.equal(cfg.enterpriseLicenseVerified, false);

      const load = await loadEnterprisePlugins(cfg);
      assert.equal(load.enterpriseModulesActive, false);
      assert.deepEqual(load.plugins, []);

      assert.equal(isEnterpriseModulesEntitlementActive(cfg), false);
      assert.equal(selfHostTier(cfg), "FREE");
    },
  );
});

test("4: legacy ENTERPRISE_MODULES warning text is neutral and non-fatal", () => {
  const indexPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/index.ts");
  const indexSource = readFileSync(indexPath, "utf8");
  assert.match(indexSource, /no longer enables optional modules on its own/);
  assert.match(
    indexSource,
    /Modules stay off until the loaded plugin confirms a verified license/,
  );
  assert.doesNotMatch(indexSource, /OKKEY_LICENSE_KEY|bypass|vulnerab/i);
  // Warning path must not interpolate license material into logs.
  const warnBlock = indexSource.slice(
    indexSource.indexOf("ENTERPRISE_MODULES is set"),
    indexSource.indexOf("ENTERPRISE_MODULES is set") + 500,
  );
  assert.doesNotMatch(warnBlock, /enterpriseLicenseKey|licenseKey|OKKEY_LICENSE/);
});

test("loadConfig defaults enterpriseLicenseVerified to false even when modules loadable", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-lic-default-"));
  try {
    mkdirSync(path.join(dir, "backend/api-plugin"), { recursive: true });
    writeFileSync(path.join(dir, "backend/api-plugin/index.ts"), "export {};\n");
    await withEnv(
      {
        ENTERPRISE_MODULES: "true",
        ENTERPRISE_MODULES_PATH: dir,
        OKKEY_DEPLOYMENT_MODE: "self_hosted",
      },
      () => {
        const cfg = loadConfig();
        assert.equal(cfg.enterpriseModulesEnabled, true);
        assert.equal(cfg.enterpriseLicenseVerified, false);
        assert.equal(cfg.enterpriseLicenseLapsed, false);
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
