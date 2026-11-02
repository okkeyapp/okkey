import { createPublicKey, verify as verifyEd25519 } from "node:crypto";

/** Must match `RECOVERY_POSSESSION_PROOF_PURPOSE` in `@okkey/crypto`. */
export const RECOVERY_POSSESSION_PROOF_PURPOSE = "account.recovery_possession";

/** How long an issued challenge can be signed. */
export const RECOVERY_PROOF_CHALLENGE_TTL_MS = 2 * 60 * 1000;

/** SPKI DER prefix for a raw 32-byte Ed25519 public key. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function decodePossessionPublicKey(value: string): Buffer | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 88) {
    return null;
  }
  try {
    const bytes = Buffer.from(trimmed, "base64");
    if (bytes.length !== 32) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

/** Canonical bytes. Key order must match the client signer. */
export function recoveryPossessionProofMessage(input: {
  userId: string;
  deviceId: string;
  challenge: string;
}): Buffer {
  return Buffer.from(
    JSON.stringify({
      challenge: input.challenge,
      device_id: input.deviceId,
      purpose: RECOVERY_POSSESSION_PROOF_PURPOSE,
      user_id: input.userId,
    }),
    "utf8",
  );
}

export function verifyRecoveryPossessionProof(input: {
  userId: string;
  deviceId: string;
  challenge: string;
  publicKeyBase64: string;
  signatureBase64: string;
}): boolean {
  if (!input.deviceId || !input.challenge) {
    return false;
  }
  try {
    const publicKeyRaw = Buffer.from(input.publicKeyBase64, "base64");
    if (publicKeyRaw.length !== 32) {
      return false;
    }
    const signature = Buffer.from(input.signatureBase64, "base64");
    if (signature.length !== 64) {
      return false;
    }
    const message = recoveryPossessionProofMessage({
      userId: input.userId,
      deviceId: input.deviceId,
      challenge: input.challenge,
    });
    const keyObject = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyRaw]),
      format: "der",
      type: "spki",
    });
    return verifyEd25519(null, message, keyObject, signature);
  } catch {
    return false;
  }
}
