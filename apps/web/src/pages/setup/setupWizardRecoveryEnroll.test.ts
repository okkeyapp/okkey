import { describe, expect, it } from "vitest";

import { wizardStepAfterRecoveryEnroll } from "./setupWizardRecoveryEnroll";

describe("wizardStepAfterRecoveryEnroll", () => {
  it("continues to recovery export after a successful enroll", () => {
    expect(wizardStepAfterRecoveryEnroll(true)).toBe("recovery");
  });

  it("blocks on enrollFailed when enroll does not succeed", () => {
    expect(wizardStepAfterRecoveryEnroll(false)).toBe("enrollFailed");
  });
});
