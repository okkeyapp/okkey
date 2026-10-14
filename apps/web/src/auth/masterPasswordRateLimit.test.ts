import { describe, expect, it } from "vitest";

import {
  clearMasterPasswordFailures,
  getMasterPasswordLockRemainingMs,
  isMasterPasswordLocked,
  MASTER_PASSWORD_RATE_LIMIT,
  recordMasterPasswordFailure,
} from "./masterPasswordRateLimit";

describe("masterPasswordRateLimit", () => {
  it("locks after max failures in window", () => {
    const userId = `master-rate-${Date.now()}`;
    clearMasterPasswordFailures(userId);
    for (let i = 0; i < MASTER_PASSWORD_RATE_LIMIT.MAX_ATTEMPTS - 1; i++) {
      expect(recordMasterPasswordFailure(userId).locked).toBe(false);
    }
    const locked = recordMasterPasswordFailure(userId);
    expect(locked.locked).toBe(true);
    expect(locked.remainingMs).toBeGreaterThan(0);
    expect(isMasterPasswordLocked(userId)).toBe(true);
    expect(getMasterPasswordLockRemainingMs(userId)).toBeGreaterThan(0);
    clearMasterPasswordFailures(userId);
    expect(isMasterPasswordLocked(userId)).toBe(false);
  });
});
