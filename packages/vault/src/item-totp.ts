/**
 * RFC 6238 TOTP (HMAC-SHA1) for autofill. Uses Web Crypto — no Node `crypto`.
 */

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

function parseTotpParams(secretOrUri: string): {
  secretBase32: string;
  periodSeconds: number;
  digits: number;
} | null {
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
      const periodRaw = Number(parsed.searchParams.get("period") ?? "30");
      const digitsRaw = Number(parsed.searchParams.get("digits") ?? "6");
      return {
        secretBase32: secret,
        periodSeconds: Number.isFinite(periodRaw) && periodRaw > 0 ? periodRaw : 30,
        digits: Number.isFinite(digitsRaw) && digitsRaw > 0 ? digitsRaw : 6,
      };
    } catch {
      return null;
    }
  }
  return { secretBase32: trimmed, periodSeconds: 30, digits: 6 };
}

async function hmacSha1(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
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
  nowMs?: number;
}): Promise<string | null> {
  const parsed = parseTotpParams(input.secretBase32);
  if (!parsed) {
    return null;
  }
  const period = input.periodSeconds && input.periodSeconds > 0 ? input.periodSeconds : parsed.periodSeconds;
  const digits = input.digits && input.digits > 0 ? input.digits : parsed.digits;
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
  const hmac = await hmacSha1(secret, buf);
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const mod = 10 ** digits;
  return String(bin % mod).padStart(digits, "0");
}
