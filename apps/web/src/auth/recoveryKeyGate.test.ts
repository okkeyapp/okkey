import { describe, expect, it } from "vitest";

import { recoveryKeyGatePhase } from "./recoveryKeyGate";

describe("recoveryKeyGatePhase", () => {
  it("waits until status has loaded", () => {
    expect(recoveryKeyGatePhase({ status: null, loaded: false, failed: false })).toBe("loading");
  });

  it("requires setup when no recovery key is saved", () => {
    expect(
      recoveryKeyGatePhase({
        status: { key: { enrolled: false } },
        loaded: true,
        failed: false,
      }),
    ).toBe("required");
  });

  it("opens the vault when a recovery key is saved", () => {
    expect(
      recoveryKeyGatePhase({
        status: { key: { enrolled: true } },
        loaded: true,
        failed: false,
      }),
    ).toBe("ready");
  });

  it("keeps the vault unavailable when status cannot be loaded", () => {
    expect(recoveryKeyGatePhase({ status: null, loaded: true, failed: true })).toBe("unavailable");
  });
});
