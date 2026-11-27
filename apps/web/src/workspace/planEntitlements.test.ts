import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");

beforeEach(async () => {
  vi.resetModules();
  const {
    resetBackendEnterpriseModulesActiveForTests,
    setBackendDeploymentMode,
  } = await import("./planEntitlements");
  resetBackendEnterpriseModulesActiveForTests();
  setBackendDeploymentMode("self_hosted");
});

describe("web plan entitlements (self_hosted)", () => {
  it("EE + any stored plan_tier shows ENTERPRISE and grants module writes", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");
    const {
      setBackendDeploymentMode,
      workspaceHasPlanFeature,
      webDisplayPlanTier,
      webEnterpriseModuleReadOnly,
      webEnterpriseSurfaceEnabled,
      webPlanFeatureAccess,
    } = await import("./planEntitlements");
    setBackendDeploymentMode("self_hosted");
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
      expect(webEnterpriseSurfaceEnabled({ planTier }, "accountRecovery")).toBe(true);
      expect(webEnterpriseSurfaceEnabled({ planTier }, "trustedContacts")).toBe(true);
      expect(webEnterpriseSurfaceEnabled({ planTier }, "capsuleAccessSettings")).toBe(true);
    }
  });

  it("downgrades when API reports enterpriseModulesActive=false", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");
    const {
      setBackendDeploymentMode,
      setBackendEnterpriseModulesActive,
      workspaceHasPlanFeature,
      webDisplayPlanTier,
      webEnterpriseSurfaceEnabled,
    } = await import("./planEntitlements");
    setBackendDeploymentMode("self_hosted");
    setBackendEnterpriseModulesActive(false);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "sharedVaults")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "sharedVaults")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "customWorkspaceRoles")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "monitoring")).toBe(false);
    expect(webDisplayPlanTier({ planTier: "FREE" })).toBe("FREE");
    expect(webDisplayPlanTier({ planTier: "ENTERPRISE" })).toBe("FREE");
    expect(webEnterpriseSurfaceEnabled({ planTier: "ENTERPRISE" }, "accountRecovery")).toBe(false);
  });
});

describe("web plan entitlements (self_hosted without modules)", () => {
  it("non-EE + FREE stays FREE", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "false");
    const {
      setBackendDeploymentMode,
      workspaceHasPlanFeature,
      webDisplayPlanTier,
    } = await import("./planEntitlements");
    setBackendDeploymentMode("self_hosted");
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "sharedVaults")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "customWorkspaceRoles")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "monitoring")).toBe(false);
    expect(webDisplayPlanTier({ planTier: "FREE" })).toBe("FREE");
  });

  it("stays FREE even when plan_tier is ENTERPRISE", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "false");
    const {
      setBackendDeploymentMode,
      workspaceHasPlanFeature,
      webDisplayPlanTier,
      webEnterpriseSurfaceEnabled,
    } = await import("./planEntitlements");
    setBackendDeploymentMode("self_hosted");
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "sharedVaults")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "customWorkspaceRoles")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "filesInItems")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "filesInCapsules")).toBe(true);
    expect(webDisplayPlanTier({ planTier: "ENTERPRISE" })).toBe("FREE");
    expect(webEnterpriseSurfaceEnabled({ planTier: "ENTERPRISE" }, "trustedContacts")).toBe(false);
  });
});

describe("web plan entitlements (confirmed hosted)", () => {
  it("uses plan_tier; Vite saas alone is not enough", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "saas");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");
    const {
      resetBackendEnterpriseModulesActiveForTests,
      setBackendDeploymentMode,
      webDeploymentMode,
      workspaceHasPlanFeature,
      webDisplayPlanTier,
      webEnterpriseSurfaceEnabled,
    } = await import("./planEntitlements");
    resetBackendEnterpriseModulesActiveForTests();
    // Without API confirmation, Vite saas stays self-hosted.
    expect(webDeploymentMode()).toBe("self_hosted");

    setBackendDeploymentMode("saas");
    expect(webDeploymentMode()).toBe("saas");
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
    expect(webEnterpriseSurfaceEnabled({ planTier: "FREE" }, "accountRecovery")).toBe(false);
    expect(webEnterpriseSurfaceEnabled({ planTier: "PREMIUM" }, "accountRecovery")).toBe(true);
    expect(webEnterpriseSurfaceEnabled({ planTier: "FREE" }, "trustedContacts")).toBe(false);
    expect(webEnterpriseSurfaceEnabled({ planTier: "PREMIUM" }, "trustedContacts")).toBe(true);
    expect(webEnterpriseSurfaceEnabled({ planTier: "TEAM" }, "capsuleAccessSettings")).toBe(true);
    expect(webEnterpriseSurfaceEnabled({ planTier: "PREMIUM" }, "capsuleAccessSettings")).toBe(false);
  });
});
