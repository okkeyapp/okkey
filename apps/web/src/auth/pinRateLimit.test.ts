import { describe, expect, it } from "vitest";

import {
  clearPinFailures,
  getPinLockRemainingMs,
  isPinLocked,
  PIN_RATE_LIMIT,
  recordPinFailure,
} from "./pinRateLimit";

describe("pinRateLimit", () => {
  it("locks after max failures in window", () => {
    const userId = `pin-rate-${Date.now()}`;
    clearPinFailures(userId);
    for (let i = 0; i < PIN_RATE_LIMIT.MAX_ATTEMPTS - 1; i++) {
      expect(recordPinFailure(userId).locked).toBe(false);
    }
    const locked = recordPinFailure(userId);
    expect(locked.locked).toBe(true);
    expect(locked.remainingMs).toBeGreaterThan(0);
    expect(isPinLocked(userId)).toBe(true);
    expect(getPinLockRemainingMs(userId)).toBeGreaterThan(0);
    clearPinFailures(userId);
    expect(isPinLocked(userId)).toBe(false);
  });
});
