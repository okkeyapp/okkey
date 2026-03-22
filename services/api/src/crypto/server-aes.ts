import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_DERIVE_LABEL = "okkey:api:totp-secret:v1";

export function deriveAes256KeyFromSessionSecret(sessionSecret: string): Buffer {
  return createHash("sha256").update(`${KEY_DERIVE_LABEL}:${sessionSecret}`, "utf8").digest();
}

/** Packed: IV (12) || tag (16) || ciphertext */
export function sealSecret(key: Buffer, plaintext: Uint8Array): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export function openSecret(key: Buffer, packed: Uint8Array): Buffer {
  const buf = Buffer.from(packed);
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("invalid sealed secret");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
