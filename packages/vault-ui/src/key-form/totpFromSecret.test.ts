import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOTP_PERIOD_SECONDS,
  createTotp,
  getTotpTokenState,
  resolveTotpPeriodSeconds,
} from "./totpFromSecret.js";

/** RFC 6238 Appendix B — SHA-1, 8 digits, secret "12345678901234567890". */
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("resolveTotpPeriodSeconds", () => {
  it("defaults to RFC 30 s when stored period is missing or invalid", () => {
    expect(resolveTotpPeriodSeconds()).toBe(DEFAULT_TOTP_PERIOD_SECONDS);
    expect(resolveTotpPeriodSeconds(0)).toBe(DEFAULT_TOTP_PERIOD_SECONDS);
    expect(resolveTotpPeriodSeconds(-1)).toBe(DEFAULT_TOTP_PERIOD_SECONDS);
  });

  it("keeps a positive stored period", () => {
    expect(resolveTotpPeriodSeconds(60)).toBe(60);
  });
});

describe("createTotp period handling", () => {
  it("uses 30 s for bare Base32 secrets (not 60)", () => {
    const totp = createTotp(RFC_SECRET_BASE32);
    expect(totp).not.toBeNull();
    expect(totp!.period).toBe(30);
  });

  it("uses the stored period for bare Base32 when provided", () => {
    const totp = createTotp(RFC_SECRET_BASE32, 60);
    expect(totp).not.toBeNull();
    expect(totp!.period).toBe(60);
  });

  it("prefers stored period over otpauth URI period", () => {
    const uri = `otpauth://totp/Example:user?secret=${RFC_SECRET_BASE32}&period=60&digits=8`;
    const totp = createTotp(uri, 30);
    expect(totp).not.toBeNull();
    expect(totp!.period).toBe(30);
  });
});

describe("getTotpTokenState", () => {
  it("matches RFC 6238 SHA1 8-digit vector at T=59 with period 30", () => {
    const uri = `otpauth://totp/Example:user?secret=${RFC_SECRET_BASE32}&digits=8&period=30`;
    const state = getTotpTokenState(uri, 59 * 1000);
    expect(state).not.toBeNull();
    expect(state!.token).toBe("94287082");
    expect(state!.period).toBe(30);
  });

  it("bare Base32 with stored period 30 matches period-30 code generation", () => {
    const at = 59 * 1000;
    const withDefault = getTotpTokenState(RFC_SECRET_BASE32, at);
    const withStored30 = getTotpTokenState(RFC_SECRET_BASE32, at, 30);
    expect(withDefault?.token).toBe(withStored30?.token);
    expect(withDefault?.period).toBe(30);
  });

  it("bare Base32 with stored period 60 differs from default 30 at the same timestamp", () => {
    const at = 45 * 1000;
    const period30 = getTotpTokenState(RFC_SECRET_BASE32, at, 30);
    const period60 = getTotpTokenState(RFC_SECRET_BASE32, at, 60);
    expect(period30?.period).toBe(30);
    expect(period60?.period).toBe(60);
    expect(period30?.token).not.toBe(period60?.token);
  });
});
