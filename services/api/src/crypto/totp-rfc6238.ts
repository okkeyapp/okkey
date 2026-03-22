import { createHmac, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 (no padding), uppercase */
export function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < data.length; i++) {
    value = (value << 8) | data[i]!;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.toUpperCase().replace(/=+$/g, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]!);
    if (idx < 0) {
      throw new Error("invalid base32");
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Uint8Array, counter: bigint, digits: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(counter);
  const hmac = createHmac("sha1", Buffer.from(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const mod = 10 ** digits;
  const code = bin % mod;
  return String(code).padStart(digits, "0");
}

export function totpAt(
  secret: Uint8Array,
  unixSeconds: number,
  periodSeconds: number,
  digits: number,
): string {
  const counter = BigInt(Math.floor(unixSeconds / periodSeconds));
  return hotp(secret, counter, digits);
}

export function verifyTotpCode(params: {
  secret: Uint8Array;
  code: string;
  unixSeconds: number;
  periodSeconds: number;
  digits: number;
  /** steps each side (e.g. 1 => t-1,t,t+1) */
  windowSteps: number;
}): boolean {
  const trimmed = params.code.trim();
  if (!/^\d+$/.test(trimmed) || trimmed.length !== params.digits) {
    return false;
  }
  const t = Math.floor(params.unixSeconds / params.periodSeconds);
  for (let w = -params.windowSteps; w <= params.windowSteps; w++) {
    const expected = hotp(params.secret, BigInt(t + w), params.digits);
    try {
      if (timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(trimmed, "utf8"))) {
        return true;
      }
    } catch {
      /* length mismatch */
    }
  }
  return false;
}
