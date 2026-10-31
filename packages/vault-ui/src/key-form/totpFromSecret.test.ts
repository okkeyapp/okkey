import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOTP_PERIOD_SECONDS,
  createTotp,
  getTotpTokenState,
  parseTotpParams,
  resolveTotpFieldFromFormInput,
  resolveTotpPeriodSeconds,
  shouldShowTotpCodePreview,
} from "./totpFromSecret.js";

/** RFC 6238 Appendix B — SHA-1, 8 digits, secret "12345678901234567890". */
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

/** Valid Base32 secrets used for length / input-mode coverage (A–Z2–7 only). */
const SECRET_LEN_16 = "JBSWY3DPEHPK3PXP";
const SECRET_LEN_26 = "JBSWY3DPEHPK3PXPJBSWY3DPEH";
const SECRET_LEN_32 = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
/** 56 chars (>52); multiple of 8 so Base32 round-trips cleanly through otpauth. */
const SECRET_LEN_52_PLUS = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DP";

/**
 * Mirrors the form field: keep accepting keystrokes while editing; only switch to
 * code preview after blur when the secret parses. Character-by-character input must
 * not truncate once length reaches the createTotp minimum (16).
 */
function applyTotpSecretInput(
  secret: string,
  mode: "type" | "paste",
): { committedSecret: string; showedPreviewWhileEditing: boolean } {
  let committedSecret = "";
  let showedPreviewWhileEditing = false;
  const isEditing = true;

  if (mode === "paste") {
    committedSecret = secret;
    showedPreviewWhileEditing = shouldShowTotpCodePreview(committedSecret, { isEditing });
    return { committedSecret, showedPreviewWhileEditing };
  }

  for (const character of secret) {
    committedSecret += character;
    if (shouldShowTotpCodePreview(committedSecret, { isEditing })) {
      showedPreviewWhileEditing = true;
      break;
    }
  }

  return { committedSecret, showedPreviewWhileEditing };
}

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

  it("matches RFC 6238 Appendix B SHA256 / SHA512 8-digit vectors at T=59", () => {
    // RFC Appendix B uses longer seed material for SHA-256 / SHA-512.
    const sha256Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA";
    const sha512Secret =
      "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA";
    const sha256 = getTotpTokenState(sha256Secret, 59 * 1000, {
      periodSeconds: 30,
      digits: 8,
      algorithm: "SHA256",
    });
    const sha512 = getTotpTokenState(sha512Secret, 59 * 1000, {
      periodSeconds: 30,
      digits: 8,
      algorithm: "SHA512",
    });
    expect(sha256?.token).toBe("46119246");
    expect(sha512?.token).toBe("90693936");
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

describe("createTotp accepts full Base32 secrets of common lengths", () => {
  it.each([
    ["16", SECRET_LEN_16],
    ["26", SECRET_LEN_26],
    ["32", SECRET_LEN_32],
    ["52+", SECRET_LEN_52_PLUS],
  ] as const)("parses a %s-character bare secret without truncation", (_label, secret) => {
    expect(secret.length).toBeGreaterThanOrEqual(_label === "52+" ? 52 : Number(_label));
    const totp = createTotp(secret);
    expect(totp).not.toBeNull();
    // Form stores the raw typed/pasted string; createTotp must accept the full length.
    expect(createTotp(secret.slice(0, 16))).not.toBeNull();
    const fullToken = getTotpTokenState(secret, 59 * 1000)?.token;
    const truncatedToken = getTotpTokenState(secret.slice(0, 16), 59 * 1000)?.token;
    expect(fullToken).toMatch(/^\d{6}$/);
    if (secret.length > 16) {
      expect(fullToken).not.toBe(truncatedToken);
    }
  });
});

describe("shouldShowTotpCodePreview", () => {
  it("hides the code preview while the secret field is being edited", () => {
    expect(shouldShowTotpCodePreview(SECRET_LEN_32, { isEditing: true })).toBe(false);
    expect(shouldShowTotpCodePreview(SECRET_LEN_16, { isEditing: true })).toBe(false);
  });

  it("shows the code preview after editing ends when the secret is valid", () => {
    expect(shouldShowTotpCodePreview(SECRET_LEN_16, { isEditing: false })).toBe(true);
    expect(shouldShowTotpCodePreview(SECRET_LEN_52_PLUS, { isEditing: false })).toBe(true);
  });

  it("does not show a preview for an incomplete secret after blur", () => {
    expect(shouldShowTotpCodePreview("JBSWY3DP", { isEditing: false })).toBe(false);
  });
});

describe("TOTP secret typing and paste preserve full length", () => {
  it.each([
    ["16", SECRET_LEN_16],
    ["26", SECRET_LEN_26],
    ["32", SECRET_LEN_32],
    ["52+", SECRET_LEN_52_PLUS],
  ] as const)("keeps the full %s-character secret when typed character by character", (_label, secret) => {
    const { committedSecret, showedPreviewWhileEditing } = applyTotpSecretInput(secret, "type");
    expect(showedPreviewWhileEditing).toBe(false);
    expect(committedSecret).toBe(secret);
    expect(committedSecret.length).toBe(secret.length);
    expect(createTotp(committedSecret)).not.toBeNull();
    expect(shouldShowTotpCodePreview(committedSecret, { isEditing: false })).toBe(true);
  });

  it.each([
    ["16", SECRET_LEN_16],
    ["26", SECRET_LEN_26],
    ["32", SECRET_LEN_32],
    ["52+", SECRET_LEN_52_PLUS],
  ] as const)("keeps the full %s-character secret when pasted at once", (_label, secret) => {
    const { committedSecret, showedPreviewWhileEditing } = applyTotpSecretInput(secret, "paste");
    expect(showedPreviewWhileEditing).toBe(false);
    expect(committedSecret).toBe(secret);
    expect(committedSecret.length).toBe(secret.length);
    expect(createTotp(committedSecret)).not.toBeNull();
    expect(shouldShowTotpCodePreview(committedSecret, { isEditing: false })).toBe(true);
  });
});

