import { describe, expect, it } from "vitest";

import { resolveSectionReauthZone } from "./sectionReauthZones";

describe("resolveSectionReauthZone", () => {
  it("maps items/capsules/monitoring", () => {
    expect(resolveSectionReauthZone("/items")).toBe("items");
    expect(resolveSectionReauthZone("/capsules")).toBe("capsules");
    expect(resolveSectionReauthZone("/monitoring")).toBe("monitoring");
  });

  it("groups tools and workspace settings", () => {
    expect(resolveSectionReauthZone("/tools")).toBe("toolsAndWorkspaceSettings");
    expect(resolveSectionReauthZone("/tools/import")).toBe("toolsAndWorkspaceSettings");
    expect(resolveSectionReauthZone("/settings")).toBe("toolsAndWorkspaceSettings");
    expect(resolveSectionReauthZone("/settings/main")).toBe("toolsAndWorkspaceSettings");
  });

  it("returns null outside gated areas", () => {
    expect(resolveSectionReauthZone("/account/lock")).toBeNull();
    expect(resolveSectionReauthZone("/auth/email")).toBeNull();
  });
});
