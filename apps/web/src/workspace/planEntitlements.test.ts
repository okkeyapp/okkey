import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");

beforeEach(async () => {
  vi.resetModules();
  const { resetBackendEnterpriseModulesActiveForTests } = await import("./planEntitlements");
  resetBackendEnterpriseModulesActiveForTests();
});

describe("web plan entitlements (self_hosted)", () => {
  it("unlocks paid features from modules active, ignoring plan_tier", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");
    const { workspaceHasPlanFeature, webDisplayPlanTier } = await import("./planEntitlements");
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "sharedVaults")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "customWorkspaceRoles")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "filesInItems")).toBe(true);
    expect(webDisplayPlanTier({ planTier: "FREE" })).toBe("ENTERPRISE");
  });

  it("unlocks paid features when modules are active and plan_tier is ENTERPRISE", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");
    const { workspaceHasPlanFeature, webDisplayPlanTier } = await import("./planEntitlements");
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "sharedVaults")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "customWorkspaceRoles")).toBe(true);
    expect(webDisplayPlanTier({ planTier: "ENTERPRISE" })).toBe("ENTERPRISE");
  });

  it("downgrades when API reports enterpriseModulesActive=false", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");
    const {
      setBackendEnterpriseModulesActive,
      workspaceHasPlanFeature,
      webDisplayPlanTier,
    } = await import("./planEntitlements");
    setBackendEnterpriseModulesActive(false);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "sharedVaults")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "sharedVaults")).toBe(false);
    expect(webDisplayPlanTier({ planTier: "FREE" })).toBe("FREE");
    expect(webDisplayPlanTier({ planTier: "ENTERPRISE" })).toBe("FREE");
  });
});

describe("web plan entitlements (self_hosted without modules)", () => {
  it("stays FREE even when plan_tier is ENTERPRISE", async () => {
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "false");
    const { workspaceHasPlanFeature, webDisplayPlanTier } = await import("./planEntitlements");
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "sharedVaults")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "filesInItems")).toBe(true);
    expect(webDisplayPlanTier({ planTier: "ENTERPRISE" })).toBe("FREE");
  });
});

describe("web plan entitlements (saas)", () => {
  it("uses plan_tier", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "saas");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");
    const { workspaceHasPlanFeature, webDisplayPlanTier } = await import("./planEntitlements");
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "sharedVaults")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "filesInItems")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "sharedVaults")).toBe(true);
    expect(webDisplayPlanTier({ planTier: "TEAM" })).toBe("TEAM");
  });
});
