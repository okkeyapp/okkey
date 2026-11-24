import { describe, expect, it } from "vitest";

import stub from "./stubs/enterprise-capsules-stub";

describe("capsule access settings slots", () => {
  it("leaves paid capsule access UI empty in the open core", () => {
    expect(stub.CapsuleAccessSettingsFields).toBeNull();
    expect(stub.PublicCapsuleAccessGate).toBeNull();
    expect(stub.CapsuleApprovalController).toBeNull();
    expect(stub.CapsulesAdvancedPoliciesSection).toBeNull();
  });
});
