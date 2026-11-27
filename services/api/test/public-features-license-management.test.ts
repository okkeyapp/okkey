/**
 * TSK-431: `/public/features` exposes license-management availability separately
 * from module entitlements. 403 vs 402 write codes follow verification/lapse only.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ENTERPRISE_MODULE_FEATURES,
  PLAN_LICENSE_LAPSED,
  planFeatureAccess,
} from "@okkey/types";

import {
  isEnterpriseModulesEntitlementActive,
  workspacePlanEntitlementOptions,
  workspacePlanFeatureWriteDecision,
} from "../src/plan-entitlements.ts";
import { createTestApiConfig } from "./test-api-config.ts";

/** Mirror of GET /public/features fields derived from config. */
function publicFeaturesProbe(config: {
  enterpriseModulesEnabled: boolean;
  enterpriseLicenseVerified: boolean;
  deploymentMode: "self_hosted" | "saas";
}) {
  return {
    enterpriseModulesActive: isEnterpriseModulesEntitlementActive(config),
    enterpriseLicenseManagementAvailable: config.enterpriseModulesEnabled === true,
    deploymentMode: config.deploymentMode,
  };
}

test("/public/features: plugin loaded without license → management on, modules off", () => {
  const config = createTestApiConfig({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: true,
    enterpriseLicenseVerified: false,
    enterpriseLicenseLapsed: false,
  });
  const features = publicFeaturesProbe(config);
  assert.equal(features.enterpriseLicenseManagementAvailable, true);
  assert.equal(features.enterpriseModulesActive, false);
  assert.equal(features.deploymentMode, "self_hosted");
});

test("/public/features: no plugin → management off, modules off", () => {
  const config = createTestApiConfig({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: false,
    enterpriseLicenseVerified: false,
  });
  const features = publicFeaturesProbe(config);
  assert.equal(features.enterpriseLicenseManagementAvailable, false);
  assert.equal(features.enterpriseModulesActive, false);
});

test("/public/features: verified license → management on, modules on", () => {
  const config = createTestApiConfig({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: true,
    enterpriseLicenseVerified: true,
  });
  const features = publicFeaturesProbe(config);
  assert.equal(features.enterpriseLicenseManagementAvailable, true);
  assert.equal(features.enterpriseModulesActive, true);
});

test("403 PLAN_FEATURE_REQUIRED when license absent or invalid (not lapsed)", () => {
  for (const label of ["absent", "invalid"] as const) {
    const config = createTestApiConfig({
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: true,
      enterpriseLicenseVerified: false,
      enterpriseLicenseLapsed: false,
    });
    assert.equal(
      publicFeaturesProbe(config).enterpriseLicenseManagementAvailable,
      true,
      label,
    );
    for (const feature of ENTERPRISE_MODULE_FEATURES) {
      const write = workspacePlanFeatureWriteDecision(config, { planTier: "ENTERPRISE" }, feature);
      assert.equal(write.allowed, false, `${label}:${feature}`);
      if (!write.allowed) {
        assert.equal(write.code, "PLAN_FEATURE_REQUIRED", `${label}:${feature}`);
        assert.equal(write.status, 403, `${label}:${feature}`);
        assert.notEqual(write.code, PLAN_LICENSE_LAPSED, `${label}:${feature}`);
      }
      assert.equal(
        planFeatureAccess(
          "ENTERPRISE",
          feature,
          workspacePlanEntitlementOptions(config, { planTier: "ENTERPRISE" }),
        ),
        "unavailable",
        `${label}:${feature}`,
      );
    }
  }
});

test("402 PLAN_LICENSE_LAPSED only when the license actually lapsed", () => {
  const config = createTestApiConfig({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: true,
    enterpriseLicenseVerified: false,
    enterpriseLicenseLapsed: true,
  });
  assert.equal(publicFeaturesProbe(config).enterpriseLicenseManagementAvailable, true);
  assert.equal(publicFeaturesProbe(config).enterpriseModulesActive, false);

  for (const feature of ENTERPRISE_MODULE_FEATURES) {
    const write = workspacePlanFeatureWriteDecision(config, { planTier: "ENTERPRISE" }, feature);
    assert.equal(write.allowed, false, feature);
    if (!write.allowed) {
      assert.equal(write.code, PLAN_LICENSE_LAPSED, feature);
      assert.equal(write.status, 402, feature);
    }
  }
});

test("verified active license allows enterprise-module writes", () => {
  const config = createTestApiConfig({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: true,
    enterpriseLicenseVerified: true,
    enterpriseLicenseLapsed: false,
  });
  for (const feature of ENTERPRISE_MODULE_FEATURES) {
    const write = workspacePlanFeatureWriteDecision(config, { planTier: "FREE" }, feature);
    assert.equal(write.allowed, true, feature);
  }
});
