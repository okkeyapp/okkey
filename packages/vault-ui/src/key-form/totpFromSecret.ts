import type { TotpAlgorithm } from "@okkey/types";
import * as OTPAuth from "otpauth";

/** RFC 6238 default time step; matches autofill (`@okkey/vault` item-totp). */
export const DEFAULT_TOTP_PERIOD_SECONDS = 30;
export const DEFAULT_TOTP_DIGITS = 6;
export const DEFAULT_TOTP_ALGORITHM: TotpAlgorithm = "SHA1";

export type TotpTokenState = {
  token: string;
  remainingSeconds: number;
  period: number;
  digits: number;
  algorithm: TotpAlgorithm;
};

export type TotpCreateOptions = {
  periodSeconds?: number;
  digits?: number;
  algorithm?: TotpAlgorithm;
};

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
 * Resolve TOTP fields for item save.
 * `otpauth://` URI parameters always win; bare secrets keep stored form metadata when present.
 */
export function resolveTotpFieldFromFormInput(input: {
  raw: string;
  storedPeriodSeconds?: number;
  storedDigits?: number;
  storedAlgorithm?: TotpAlgorithm;
}): ParsedTotpParams | null {
  const trimmed = input.raw.trim();
  if (!trimmed) {
    return null;
  }

  if (/^otpauth:\/\//i.test(trimmed)) {
    return parseTotpParams(trimmed);
  }

  const parsed = parseTotpParams(trimmed);
  if (!parsed) {
    return null;
  }

  return {
    secretBase32: parsed.secretBase32,
    periodSeconds:
      input.storedPeriodSeconds && input.storedPeriodSeconds > 0
        ? input.storedPeriodSeconds
        : parsed.periodSeconds,
    digits: input.storedDigits && input.storedDigits > 0 ? input.storedDigits : parsed.digits,
    algorithm: input.storedAlgorithm ?? parsed.algorithm,
  };
}

/**
 * Resolve the period used for TOTP generation.
 * Prefer a positive stored period; otherwise RFC/default 30 s.
 */
export function resolveTotpPeriodSeconds(storedPeriodSeconds?: number): number {
  return storedPeriodSeconds && storedPeriodSeconds > 0
    ? storedPeriodSeconds
    : DEFAULT_TOTP_PERIOD_SECONDS;
}

export function resolveTotpDigits(storedDigits?: number): number {
  return storedDigits && storedDigits > 0 ? storedDigits : DEFAULT_TOTP_DIGITS;
}

export function resolveTotpAlgorithm(storedAlgorithm?: TotpAlgorithm): TotpAlgorithm {
  return storedAlgorithm ? normalizeTotpAlgorithm(storedAlgorithm) : DEFAULT_TOTP_ALGORITHM;
}

/**
 * Build a TOTP generator from a bare Base32 secret or `otpauth://` URI.
 * Stored period / digits / algorithm win when provided — same as autofill.
 */
export function createTotp(value: string, options: TotpCreateOptions = {}): OTPAuth.TOTP | null {
  const secret = value.trim();
  if (!secret) {
    return null;
  }

  const storedPeriod =
    options.periodSeconds !== undefined && options.periodSeconds > 0
      ? options.periodSeconds
      : undefined;
  const storedDigits =
    options.digits !== undefined && options.digits > 0 ? options.digits : undefined;
  const storedAlgorithm = options.algorithm
    ? normalizeTotpAlgorithm(options.algorithm)
    : undefined;

  try {
    const parsed = OTPAuth.URI.parse(secret);
    if (!(parsed instanceof OTPAuth.TOTP)) {
      return null;
    }
    const period = storedPeriod ?? parsed.period;
    const digits = storedDigits ?? parsed.digits;
    const algorithm = storedAlgorithm ?? normalizeTotpAlgorithm(String(parsed.algorithm));
    if (
      period === parsed.period &&
      digits === parsed.digits &&
      algorithm === normalizeTotpAlgorithm(String(parsed.algorithm))
    ) {
      return parsed;
    }
    return new OTPAuth.TOTP({
      issuer: parsed.issuer,
      label: parsed.label,
      algorithm,
      digits,
      period,
      secret: parsed.secret,
    });
  } catch {
    try {
      const normalizedSecret = secret.replace(/\s+/g, "").replace(/=+$/g, "").toUpperCase();
      if (!/^[A-Z2-7]+$/.test(normalizedSecret) || normalizedSecret.length < 16) {
        return null;
      }

      return new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(normalizedSecret),
        algorithm: resolveTotpAlgorithm(storedAlgorithm),
        digits: resolveTotpDigits(storedDigits),
        period: resolveTotpPeriodSeconds(storedPeriod),
      });
    } catch {
      return null;
    }
  }
}

export function getTotpTokenState(
  value: string,
  timestamp: number,
  options: TotpCreateOptions = {},
): TotpTokenState | null {
  const totp = createTotp(value, options);
  if (!totp) {
    return null;
  }

  const remainingMs = totp.remaining({ timestamp });
  const algorithm = normalizeTotpAlgorithm(String(totp.algorithm));
  return {
    token: totp.generate({ timestamp }).padStart(totp.digits, "0"),
    remainingSeconds: Math.max(0, Math.ceil(remainingMs / 1000) - 1),
    period: totp.period,
    digits: totp.digits,
    algorithm,
  };
}
