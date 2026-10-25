/**
 * RFC 6238 TOTP for autofill and form save. Uses Web Crypto — no Node `crypto`.
 */

import type { TotpAlgorithm } from "@okkey/types";

/** RFC 6238 default time step (seconds). */
export const DEFAULT_TOTP_PERIOD_SECONDS = 30;
export const DEFAULT_TOTP_DIGITS = 6;
export const DEFAULT_TOTP_ALGORITHM: TotpAlgorithm = "SHA1";

export type ParsedTotpParams = {
  secretBase32: string;
  periodSeconds: number;
  digits: number;
  algorithm: TotpAlgorithm;
};

function base32Decode(encoded: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = encoded.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) {
      continue;
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

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

function webCryptoHashName(algorithm: TotpAlgorithm): "SHA-1" | "SHA-256" | "SHA-512" {
  if (algorithm === "SHA256") {
    return "SHA-256";
  }
  if (algorithm === "SHA512") {
    return "SHA-512";
  }
  return "SHA-1";
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

async function hmac(
  key: Uint8Array,
  data: Uint8Array,
  algorithm: TotpAlgorithm,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: webCryptoHashName(algorithm) },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, data as BufferSource);
  return new Uint8Array(sig);
}

export async function totpCodeFromSecret(input: {
  secretBase32: string;
  periodSeconds?: number;
  digits?: number;
  algorithm?: TotpAlgorithm;
  nowMs?: number;
}): Promise<string | null> {
  const parsed = parseTotpParams(input.secretBase32);
  if (!parsed) {
    return null;
  }
  const period =
    input.periodSeconds && input.periodSeconds > 0 ? input.periodSeconds : parsed.periodSeconds;
  const digits = input.digits && input.digits > 0 ? input.digits : parsed.digits;
  const algorithm = input.algorithm ?? parsed.algorithm;
  const secret = base32Decode(parsed.secretBase32);
  if (secret.length === 0) {
    return null;
  }
  const unixSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const counter = Math.floor(unixSeconds / period);
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setUint32(0, Math.floor(counter / 0x1_0000_0000), false);
  view.setUint32(4, counter >>> 0, false);
  const mac = await hmac(secret, buf, algorithm);
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  const mod = 10 ** digits;
  return String(bin % mod).padStart(digits, "0");
}
