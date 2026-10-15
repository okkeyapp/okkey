import { describe, expect, it } from "vitest";

import {
  isRecoveryKeyReady,
  recoveryKeyGatePhase,
  recoveryKeyNeedsNewSecret,
} from "./recoveryKeyGate";

describe("recoveryKeyGatePhase", () => {
  it("waits until status has loaded", () => {
    expect(recoveryKeyGatePhase({ status: null, loaded: false, failed: false })).toBe("loading");
  });

  it("requires setup when no recovery key is saved", () => {
    expect(
      recoveryKeyGatePhase({
        status: { key: { enrolled: false, exportedAt: null } },
        loaded: true,
        failed: false,
      }),
    ).toBe("required");
  });

  it("requires setup when a recovery key is enrolled but not exported", () => {
    expect(
      recoveryKeyGatePhase({
        status: { key: { enrolled: true, exportedAt: null } },
        loaded: true,
        failed: false,
      }),
    ).toBe("required");
  });

  it("opens the vault when a recovery key is saved and exported", () => {
    expect(
      recoveryKeyGatePhase({
        status: { key: { enrolled: true, exportedAt: "2026-01-01T00:00:00.000Z" } },
        loaded: true,
        failed: false,
      }),
    ).toBe("ready");
  });

  it("keeps the vault unavailable when status cannot be loaded", () => {
    expect(recoveryKeyGatePhase({ status: null, loaded: true, failed: true })).toBe("unavailable");
  });
});

describe("isRecoveryKeyReady / recoveryKeyNeedsNewSecret", () => {
  it("treats export ack as required for vault use", () => {
    expect(isRecoveryKeyReady({ enrolled: true, exportedAt: null })).toBe(false);
    expect(isRecoveryKeyReady({ enrolled: true, exportedAt: "2026-01-01T00:00:00.000Z" })).toBe(
      true,
    );
    expect(recoveryKeyNeedsNewSecret({ enrolled: true, exportedAt: null })).toBe(true);
    expect(
      recoveryKeyNeedsNewSecret({ enrolled: true, exportedAt: "2026-01-01T00:00:00.000Z" }),
    ).toBe(false);
  });
});
