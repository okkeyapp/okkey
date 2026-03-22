import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const LABEL = "okkey:backup-code:v1";

export function normalizeBackupCodeInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-F0-9]/g, "");
}

export function generateBackupCodePlaintext(): string {
  const bytes = randomBytes(5);
  const hex = bytes.toString("hex").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 10)}`;
}

export function hashBackupCode(plaintext: string, pepper: string): string {
  const norm = normalizeBackupCodeInput(plaintext);
  return createHash("sha256").update(`${LABEL}:${pepper}:${norm}`, "utf8").digest("hex");
}

export function verifyBackupCodeHash(
  plaintext: string,
  pepper: string,
  expectedHex: string,
): boolean {
  const computed = hashBackupCode(plaintext, pepper);
  try {
    return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(expectedHex, "hex"));
  } catch {
    return false;
  }
}
