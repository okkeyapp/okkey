import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { wipeSecretBytes } from "./secret-lifecycle.ts";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_DERIVE_LABEL = "okkey:api:totp-secret:v1";
/** Domain-separated from the 2FA key that is the HKDF input. */
const SMTP_PASSWORD_KEY_INFO = "okkey:api:smtp-password:v1";

export function deriveAes256KeyFromSessionSecret(sessionSecret: string): Buffer {
  return createHash("sha256").update(`${KEY_DERIVE_LABEL}:${sessionSecret}`, "utf8").digest();
}

/**
 * AES-256 key for SMTP passwords stored by the API.
 * Derived from the existing 2FA server key so current installs keep working
 * without a new required environment variable.
 */
export function deriveSmtpPasswordKey(sessionSecret: string): Buffer {
  const ikm = deriveAes256KeyFromSessionSecret(sessionSecret);
  try {
    return Buffer.from(
      hkdfSync("sha256", ikm, Buffer.alloc(0), SMTP_PASSWORD_KEY_INFO, 32),
    );
  } finally {
    wipeSecretBytes(ikm);
  }
}

/** Packed: IV (12) || tag (16) || ciphertext */
export function sealSecret(key: Buffer, plaintext: Uint8Array): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const plaintextBuffer = Buffer.from(plaintext);
  const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ciphertext]);
  wipeSecretBytes(plaintextBuffer);
  wipeSecretBytes(ciphertext);
  return packed;
}

export function openSecret(key: Buffer, packed: Uint8Array): Buffer {
  const buf = Buffer.from(packed);
  try {
    if (buf.length < IV_LEN + TAG_LEN + 1) {
      throw new Error("invalid sealed secret");
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } finally {
    wipeSecretBytes(buf);
  }
}
