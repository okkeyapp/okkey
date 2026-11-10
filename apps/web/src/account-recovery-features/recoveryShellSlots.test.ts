import { describe, expect, it } from "vitest";

import stub from "./stubs/enterprise-account-recovery-stub";

describe("account recovery shell slots", () => {
  it("leaves device-recovery and contact-release popups empty in the open core", () => {
    expect(stub.DeviceRecoveryApprovalController).toBeNull();
    expect(stub.ContactsShareReleaseController).toBeNull();
  });
});
