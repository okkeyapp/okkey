import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");

beforeEach(async () => {
  vi.resetModules();
  const { resetBackendEnterpriseModulesActiveForTests } = await import("./planEntitlements");
  resetBackendEnterpriseModulesActiveForTests();
});

describe("web plan entitlements (self_hosted)", () => {
  it("EE + any stored plan_tier shows ENTERPRISE and grants module writes", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");
    const {
      workspaceHasPlanFeature,
      webDisplayPlanTier,
      webEnterpriseModuleReadOnly,
      webPlanFeatureAccess,
    } = await import("./planEntitlements");
    for (const planTier of ["FREE", "PREMIUM", "TEAM", "ENTERPRISE", null] as const) {
      expect(workspaceHasPlanFeature({ planTier }, "sharedVaults")).toBe(true);
      expect(workspaceHasPlanFeature({ planTier }, "customWorkspaceRoles")).toBe(true);
      expect(workspaceHasPlanFeature({ planTier }, "monitoring")).toBe(true);
      expect(workspaceHasPlanFeature({ planTier }, "capsuleAccessSettings")).toBe(true);
      expect(workspaceHasPlanFeature({ planTier }, "accountRecovery")).toBe(true);
      expect(workspaceHasPlanFeature({ planTier }, "trustedContacts")).toBe(true);
      expect(workspaceHasPlanFeature({ planTier }, "filesInItems")).toBe(true);
      expect(workspaceHasPlanFeature({ planTier }, "filesInCapsules")).toBe(true);
      expect(webPlanFeatureAccess({ planTier }, "customWorkspaceRoles")).toBe("granted");
      expect(webPlanFeatureAccess({ planTier }, "monitoring")).toBe("granted");
      expect(webEnterpriseModuleReadOnly({ planTier }, "customWorkspaceRoles")).toBe(false);
      expect(webDisplayPlanTier({ planTier })).toBe("ENTERPRISE");
    }
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
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "sharedVaults")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "sharedVaults")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "customWorkspaceRoles")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "monitoring")).toBe(false);
    expect(webDisplayPlanTier({ planTier: "FREE" })).toBe("FREE");
    expect(webDisplayPlanTier({ planTier: "ENTERPRISE" })).toBe("FREE");
  });
});

describe("web plan entitlements (self_hosted without modules)", () => {
  it("non-EE + FREE stays FREE", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "false");
    const { workspaceHasPlanFeature, webDisplayPlanTier } = await import("./planEntitlements");
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "sharedVaults")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "customWorkspaceRoles")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "monitoring")).toBe(false);
    expect(webDisplayPlanTier({ planTier: "FREE" })).toBe("FREE");
  });

  it("stays FREE even when plan_tier is ENTERPRISE", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "false");
    const { workspaceHasPlanFeature, webDisplayPlanTier } = await import("./planEntitlements");
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "sharedVaults")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "customWorkspaceRoles")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "filesInItems")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "filesInCapsules")).toBe(true);
    expect(webDisplayPlanTier({ planTier: "ENTERPRISE" })).toBe("FREE");
  });
});

describe("web plan entitlements (saas)", () => {
  it("uses plan_tier", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "saas");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");
    const { workspaceHasPlanFeature, webDisplayPlanTier } = await import("./planEntitlements");
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "sharedVaults")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "filesInItems")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "filesInCapsules")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "PREMIUM" }, "filesInCapsules")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "monitoring")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "PREMIUM" }, "monitoring")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "PREMIUM" }, "capsuleAccessSettings")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "TEAM" }, "capsuleAccessSettings")).toBe(true);
    expect(webDisplayPlanTier({ planTier: "FAMILY" })).toBe("PREMIUM");
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "sharedVaults")).toBe(true);
    expect(webDisplayPlanTier({ planTier: "TEAM" })).toBe("TEAM");
  });
});
