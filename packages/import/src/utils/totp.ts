import type { ItemPlaintextV2, TotpAlgorithm } from "@okkey/types";

/** RFC 6238 defaults — match `@okkey/vault` / autofill. */
export const DEFAULT_TOTP_PERIOD_SECONDS = 30;
export const DEFAULT_TOTP_DIGITS = 6;
export const DEFAULT_TOTP_ALGORITHM: TotpAlgorithm = "SHA1";

/** Inclusive upper bound for stored TOTP digits (RFC 6238 / common authenticators). */
export const MAX_TOTP_DIGITS = 10;
/** Inclusive lower bound for stored TOTP digits. */
export const MIN_TOTP_DIGITS = 6;

export type ParsedTotpParams = {
  secretBase32: string;
  periodSeconds: number;
  digits: number;
  algorithm: TotpAlgorithm;
};

export function normalizeTotpAlgorithm(raw: string | null | undefined): TotpAlgorithm {
  const normalized = (raw ?? DEFAULT_TOTP_ALGORITHM).trim().toUpperCase().replace(/[-_]/g, "");
  if (normalized === "SHA256") {
    return "SHA256";
  }
  if (normalized === "SHA512") {
    return "SHA512";
  }
  return "SHA1";
}

/**
 * Accept only integer period ≥ 1; otherwise RFC default 30.
 */
export function sanitizeTotpPeriodSeconds(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) {
    return DEFAULT_TOTP_PERIOD_SECONDS;
  }
  const text = String(raw).trim();
  if (!/^-?\d+$/.test(text)) {
    return DEFAULT_TOTP_PERIOD_SECONDS;
  }
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_TOTP_PERIOD_SECONDS;
  }
  return value;
}

/**
 * Accept only integer digits in 6–10; otherwise RFC default 6.
 */
export function sanitizeTotpDigits(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) {
    return DEFAULT_TOTP_DIGITS;
  }
  const text = String(raw).trim();
  if (!/^-?\d+$/.test(text)) {
    return DEFAULT_TOTP_DIGITS;
  }
  const value = Number(text);
  if (!Number.isInteger(value) || value < MIN_TOTP_DIGITS || value > MAX_TOTP_DIGITS) {
    return DEFAULT_TOTP_DIGITS;
  }
  return value;
}

function looksLikeKeeOtp(value: string): boolean {
  // KeeOtp plugin: key=SECRET&step=60&size=8&otpHashMode=Sha1
  return /(?:^|[?&])key=/i.test(value) && !/^otpauth:\/\//i.test(value);
}

function parseKeeOtpParams(raw: string): ParsedTotpParams | null {
  const query = raw.trim().replace(/^\?/, "");
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(query);
  } catch {
    return null;
  }
  const secret = params.get("key")?.trim() ?? "";
  if (!secret) {
    return null;
  }
  return {
    secretBase32: secret,
    periodSeconds: sanitizeTotpPeriodSeconds(params.get("step")),
    digits: sanitizeTotpDigits(params.get("size")),
    algorithm: normalizeTotpAlgorithm(params.get("otpHashMode") ?? params.get("algorithm")),
  };
}

/**
 * Parse a bare Base32 secret, `otpauth://` URI, or KeeOtp `key=&step=&size=` string
 * into stored TOTP parameters. Returns null when the input is empty or not usable.
 */
export function parseTotpParams(secretOrUri: string): ParsedTotpParams | null {
  const trimmed = secretOrUri.trim();
  if (!trimmed) {
    return null;
  }
  if (/^otpauth:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const secret = parsed.searchParams.get("secret")?.trim() ?? "";
      if (!secret) {
        return null;
      }
      return {
        secretBase32: secret,
        periodSeconds: sanitizeTotpPeriodSeconds(
          parsed.searchParams.get("period") ?? String(DEFAULT_TOTP_PERIOD_SECONDS),
        ),
        digits: sanitizeTotpDigits(
          parsed.searchParams.get("digits") ?? String(DEFAULT_TOTP_DIGITS),
        ),
        algorithm: normalizeTotpAlgorithm(parsed.searchParams.get("algorithm")),
      };
    } catch {
      return null;
    }
  }
  if (looksLikeKeeOtp(trimmed)) {
    return parseKeeOtpParams(trimmed);
  }
  return {
    secretBase32: trimmed,
    periodSeconds: DEFAULT_TOTP_PERIOD_SECONDS,
    digits: DEFAULT_TOTP_DIGITS,
    algorithm: DEFAULT_TOTP_ALGORITHM,
  };
}

/**
 * Write a TOTP field onto an item plaintext, preserving period / digits / algorithm
 * from `otpauth://` or KeeOtp (or RFC defaults for a bare secret).
 */
export function ensureTotpField(item: ItemPlaintextV2, totp: string): void {
  const parsed = parseTotpParams(totp);
  if (!parsed) {
    return;
  }

  const existing = item.fields.find((field) => field.id === "totp" || field.type === "totp");
  if (existing && existing.value.kind === "totp") {
    existing.value.secretBase32 = parsed.secretBase32;
    existing.value.periodSeconds = parsed.periodSeconds;
    existing.value.digits = parsed.digits;
    existing.value.algorithm = parsed.algorithm;
    return;
  }

  item.fields.push({
    id: "totp",
    type: "totp",
    sectionId: "credentials",
    order: item.fields.filter((field) => field.sectionId === "credentials").length,
    label: "Authenticator",
    value: {
      kind: "totp",
      secretBase32: parsed.secretBase32,
      periodSeconds: parsed.periodSeconds,
      digits: parsed.digits,
      algorithm: parsed.algorithm,
    },
  });
}
