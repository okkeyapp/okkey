import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Human-readable setup code: 4 hex groups (e.g. a1b2-c3d4-e5f6-7890). */
export function generateSetupCodePlaintext(): string {
  const raw = randomBytes(8).toString("hex");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export function normalizeSetupCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

export function hashSetupCode(code: string): string {
  return createHash("sha256").update(normalizeSetupCode(code), "utf8").digest("hex");
}

export function setupCodeHashesEqual(leftHex: string, rightHex: string): boolean {
  try {
    const a = Buffer.from(leftHex, "hex");
    const b = Buffer.from(rightHex, "hex");
    if (a.length === 0 || a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
