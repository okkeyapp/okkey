import type { ItemPlaintextV2, TotpAlgorithm } from "@okkey/types";

/** RFC 6238 defaults — match `@okkey/vault` / autofill. */
export const DEFAULT_TOTP_PERIOD_SECONDS = 30;
export const DEFAULT_TOTP_DIGITS = 6;
export const DEFAULT_TOTP_ALGORITHM: TotpAlgorithm = "SHA1";

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
 * Parse a bare Base32 secret or `otpauth://` URI into stored TOTP parameters.
 * Returns null when the input is empty or not a usable TOTP secret.
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
      const periodRaw = Number(parsed.searchParams.get("period") ?? String(DEFAULT_TOTP_PERIOD_SECONDS));
      const digitsRaw = Number(parsed.searchParams.get("digits") ?? String(DEFAULT_TOTP_DIGITS));
      return {
        secretBase32: secret,
        periodSeconds:
          Number.isFinite(periodRaw) && periodRaw > 0 ? periodRaw : DEFAULT_TOTP_PERIOD_SECONDS,
        digits: Number.isFinite(digitsRaw) && digitsRaw > 0 ? digitsRaw : DEFAULT_TOTP_DIGITS,
        algorithm: normalizeTotpAlgorithm(parsed.searchParams.get("algorithm")),
      };
    } catch {
      return null;
    }
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
 * from `otpauth://` (or RFC defaults for a bare secret).
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
