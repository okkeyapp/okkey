import { describe, expect, it } from "vitest";

import { resolveSectionReauthZone } from "./sectionReauthZones";

describe("resolveSectionReauthZone", () => {
  it("maps capsules/monitoring", () => {
    expect(resolveSectionReauthZone("/capsules")).toBe("capsules");
    expect(resolveSectionReauthZone("/monitoring")).toBe("monitoring");
  });

  it("does not gate items", () => {
    expect(resolveSectionReauthZone("/items")).toBeNull();
    expect(resolveSectionReauthZone("/items/123")).toBeNull();
  });

  it("maps tools and workspace settings separately", () => {
    expect(resolveSectionReauthZone("/tools")).toBe("tools");
    expect(resolveSectionReauthZone("/tools/import")).toBe("tools");
    expect(resolveSectionReauthZone("/settings")).toBe("workspaceSettings");
    expect(resolveSectionReauthZone("/settings/main")).toBe("workspaceSettings");
  });

  it("returns null outside gated areas", () => {
    expect(resolveSectionReauthZone("/account/lock")).toBeNull();
    expect(resolveSectionReauthZone("/auth/email")).toBeNull();
  });
});
