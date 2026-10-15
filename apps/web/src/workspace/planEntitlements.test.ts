import { describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");

describe("web plan entitlements (self_hosted)", () => {
  it("unlocks paid features from modules active, ignoring plan_tier", async () => {
    const { workspaceHasPlanFeature, webDisplayPlanTier } = await import("./planEntitlements");
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "sharedVaults")).toBe(true);
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "customWorkspaceRoles")).toBe(true);
    expect(webDisplayPlanTier({ planTier: "FREE" })).toBe("ENTERPRISE");
  });
});

describe("web plan entitlements (self_hosted without modules)", () => {
  it("stays FREE even when plan_tier is ENTERPRISE", async () => {
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "false");
    vi.resetModules();
    const { workspaceHasPlanFeature, webDisplayPlanTier } = await import("./planEntitlements");
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "sharedVaults")).toBe(false);
    expect(webDisplayPlanTier({ planTier: "ENTERPRISE" })).toBe("FREE");
  });
});

describe("web plan entitlements (saas)", () => {
  it("uses plan_tier", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "saas");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");
    vi.resetModules();
    const { workspaceHasPlanFeature, webDisplayPlanTier } = await import("./planEntitlements");
    expect(workspaceHasPlanFeature({ planTier: "FREE" }, "sharedVaults")).toBe(false);
    expect(workspaceHasPlanFeature({ planTier: "ENTERPRISE" }, "sharedVaults")).toBe(true);
    expect(webDisplayPlanTier({ planTier: "TEAM" })).toBe("TEAM");
  });
});
