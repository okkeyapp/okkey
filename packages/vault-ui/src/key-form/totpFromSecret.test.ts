import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOTP_PERIOD_SECONDS,
  createTotp,
  getTotpTokenState,
  parseTotpParams,
  resolveTotpFieldFromFormInput,
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

describe("createTotp period / digits / algorithm handling", () => {
  it("uses 30 s for bare Base32 secrets (not 60)", () => {
    const totp = createTotp(RFC_SECRET_BASE32);
    expect(totp).not.toBeNull();
    expect(totp!.period).toBe(30);
    expect(totp!.digits).toBe(6);
    expect(String(totp!.algorithm)).toBe("SHA1");
  });

  it("uses the stored period, digits, and algorithm for bare Base32", () => {
    const totp = createTotp(RFC_SECRET_BASE32, {
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA256",
    });
    expect(totp).not.toBeNull();
    expect(totp!.period).toBe(60);
    expect(totp!.digits).toBe(8);
    expect(String(totp!.algorithm)).toBe("SHA256");
  });

  it("prefers stored params over otpauth URI params", () => {
    const uri = `otpauth://totp/Example:user?secret=${RFC_SECRET_BASE32}&period=60&digits=8&algorithm=SHA256`;
    const totp = createTotp(uri, {
      periodSeconds: 30,
      digits: 6,
      algorithm: "SHA1",
    });
    expect(totp).not.toBeNull();
    expect(totp!.period).toBe(30);
    expect(totp!.digits).toBe(6);
    expect(String(totp!.algorithm)).toBe("SHA1");
  });

  it("keeps otpauth URI params when no stored overrides are set", () => {
    const uri = `otpauth://totp/Example:user?secret=${RFC_SECRET_BASE32}&period=60&digits=8&algorithm=SHA256`;
    const totp = createTotp(uri);
    expect(totp).not.toBeNull();
    expect(totp!.period).toBe(60);
    expect(totp!.digits).toBe(8);
    expect(String(totp!.algorithm)).toBe("SHA256");
  });
});

describe("getTotpTokenState", () => {
  it("matches RFC 6238 SHA1 8-digit vector at T=59 with period 30", () => {
    const uri = `otpauth://totp/Example:user?secret=${RFC_SECRET_BASE32}&digits=8&period=30`;
    const state = getTotpTokenState(uri, 59 * 1000);
    expect(state).not.toBeNull();
    expect(state!.token).toBe("94287082");
    expect(state!.period).toBe(30);
    expect(state!.digits).toBe(8);
  });

  it("bare Base32 with stored period 30 matches period-30 code generation", () => {
    const at = 59 * 1000;
    const withDefault = getTotpTokenState(RFC_SECRET_BASE32, at);
    const withStored30 = getTotpTokenState(RFC_SECRET_BASE32, at, { periodSeconds: 30 });
    expect(withDefault?.token).toBe(withStored30?.token);
    expect(withDefault?.period).toBe(30);
  });

  it("bare Base32 with stored period 60 differs from default 30 at the same timestamp", () => {
    const at = 45 * 1000;
    const period30 = getTotpTokenState(RFC_SECRET_BASE32, at, { periodSeconds: 30 });
    const period60 = getTotpTokenState(RFC_SECRET_BASE32, at, { periodSeconds: 60 });
    expect(period30?.period).toBe(30);
    expect(period60?.period).toBe(60);
    expect(period30?.token).not.toBe(period60?.token);
  });

  it("uses stored digits for bare secrets after save", () => {
    const at = 59 * 1000;
    const sha1Six = getTotpTokenState(RFC_SECRET_BASE32, at, {
      periodSeconds: 30,
      digits: 6,
      algorithm: "SHA1",
    });
    const sha1Eight = getTotpTokenState(RFC_SECRET_BASE32, at, {
      periodSeconds: 30,
      digits: 8,
      algorithm: "SHA1",
    });
    expect(sha1Six?.token).toHaveLength(6);
    expect(sha1Eight?.token).toBe("94287082");
    expect(sha1Six?.token).toBe("287082");
  });
});

describe("parseTotpParams / resolveTotpFieldFromFormInput", () => {
  it("reads period, digits, and algorithm from otpauth URIs", () => {
    const uri = `otpauth://totp/QA:test?secret=${RFC_SECRET_BASE32}&issuer=QA&period=60&digits=8&algorithm=SHA256`;
    expect(parseTotpParams(uri)).toEqual({
      secretBase32: RFC_SECRET_BASE32,
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA256",
    });
  });

  it("lets otpauth URI params win on save even when form had defaults", () => {
    const uri = `otpauth://totp/QA:test?secret=${RFC_SECRET_BASE32}&period=60&digits=8&algorithm=SHA256`;
    expect(
      resolveTotpFieldFromFormInput({
        raw: uri,
        storedPeriodSeconds: 30,
        storedDigits: 6,
        storedAlgorithm: "SHA1",
      }),
    ).toEqual({
      secretBase32: RFC_SECRET_BASE32,
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA256",
    });
  });

  it("keeps stored metadata for bare secrets on unrelated edits", () => {
    expect(
      resolveTotpFieldFromFormInput({
        raw: RFC_SECRET_BASE32,
        storedPeriodSeconds: 60,
        storedDigits: 8,
        storedAlgorithm: "SHA256",
      }),
    ).toEqual({
      secretBase32: RFC_SECRET_BASE32,
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA256",
    });
  });
});

