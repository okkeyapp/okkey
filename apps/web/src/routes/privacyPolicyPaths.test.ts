import { describe, expect, it } from "vitest";

import { PRIVACY_POLICY_LEGACY_PATH, PRIVACY_POLICY_PATH, isPrivacyPolicyPathname } from "./paths";

describe("privacy policy paths", () => {
  it("exposes canonical and legacy paths", () => {
    expect(PRIVACY_POLICY_PATH).toBe("/legal/privacy-policy");
    expect(PRIVACY_POLICY_LEGACY_PATH).toBe("/privacy");
    expect(isPrivacyPolicyPathname(PRIVACY_POLICY_PATH)).toBe(true);
    expect(isPrivacyPolicyPathname(PRIVACY_POLICY_LEGACY_PATH)).toBe(true);
    expect(isPrivacyPolicyPathname("/legal/other")).toBe(false);
  });
});
