import * as OTPAuth from "otpauth";

/** RFC 6238 default time step; matches autofill (`@okkey/vault` item-totp). */
export const DEFAULT_TOTP_PERIOD_SECONDS = 30;

export type TotpTokenState = {
  token: string;
  remainingSeconds: number;
  period: number;
};

/**
 * Resolve the period used for TOTP generation.
 * Prefer a positive stored period; otherwise RFC/default 30 s.
 */
export function resolveTotpPeriodSeconds(storedPeriodSeconds?: number): number {
  return storedPeriodSeconds && storedPeriodSeconds > 0
    ? storedPeriodSeconds
    : DEFAULT_TOTP_PERIOD_SECONDS;
}

/**
 * Build a TOTP generator from a bare Base32 secret or `otpauth://` URI.
 * When `periodSeconds` is set (from the item), it wins over URI/default — same as autofill.
 */
export function createTotp(value: string, periodSeconds?: number): OTPAuth.TOTP | null {
  const secret = value.trim();
  if (!secret) {
    return null;
  }

  const storedPeriod =
    periodSeconds !== undefined && periodSeconds > 0 ? periodSeconds : undefined;

  try {
    const parsed = OTPAuth.URI.parse(secret);
    if (!(parsed instanceof OTPAuth.TOTP)) {
      return null;
    }
    if (storedPeriod !== undefined && storedPeriod !== parsed.period) {
      return new OTPAuth.TOTP({
        issuer: parsed.issuer,
        label: parsed.label,
        algorithm: parsed.algorithm,
        digits: parsed.digits,
        period: storedPeriod,
        secret: parsed.secret,
      });
    }
    return parsed;
  } catch {
    try {
      const normalizedSecret = secret.replace(/\s+/g, "").replace(/=+$/g, "").toUpperCase();
      if (!/^[A-Z2-7]+$/.test(normalizedSecret) || normalizedSecret.length < 16) {
        return null;
      }

      return new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(normalizedSecret),
        digits: 6,
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
  periodSeconds?: number,
): TotpTokenState | null {
  const totp = createTotp(value, periodSeconds);
  if (!totp) {
    return null;
  }

  const remainingMs = totp.remaining({ timestamp });
  return {
    token: totp.generate({ timestamp }).padStart(6, "0"),
    remainingSeconds: Math.max(0, Math.ceil(remainingMs / 1000) - 1),
    period: totp.period,
  };
}
