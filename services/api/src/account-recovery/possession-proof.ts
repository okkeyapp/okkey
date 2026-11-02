import { createPublicKey, timingSafeEqual, verify as verifyEd25519 } from "node:crypto";

/** Must match `RECOVERY_POSSESSION_ATTESTATION_PURPOSE` in `@okkey/crypto`. */
export const RECOVERY_POSSESSION_ATTESTATION_PURPOSE = "account.recovery_possession";

/** Must match `RECOVERY_POSSESSION_ATTESTATION_MAX_AGE_MS` in `@okkey/crypto`. */
export const RECOVERY_POSSESSION_ATTESTATION_MAX_AGE_MS = 5 * 60 * 1000;

/** SPKI DER prefix for a raw 32-byte Ed25519 public key. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export type RecoveryPossessionAttestationInput = {
  purpose?: string;
  userId: string;
  recordedAt: string;
  challenge: string;
  signature: string;
};

/** Canonical bytes. Key order must match the client signer. */
export function recoveryPossessionAttestationMessage(input: {
  userId: string;
  recordedAt: string;
  challenge: string;
}): Buffer {
  return Buffer.from(
    JSON.stringify({
      challenge: input.challenge,
      purpose: RECOVERY_POSSESSION_ATTESTATION_PURPOSE,
      recorded_at: input.recordedAt,
      user_id: input.userId,
    }),
    "utf8",
  );
}

export function decodePossessionVerifier(value: string): Buffer | null {
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

export function possessionVerifiersEqual(stored: string, given: string): boolean {
  const left = decodePossessionVerifier(stored);
  const right = decodePossessionVerifier(given);
  if (!left || !right) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function verifyRecoveryPossessionAttestation(input: {
  userId: string;
  publicKeyBase64: string;
  expectedChallenge: string;
  attestation: RecoveryPossessionAttestationInput;
  now: number;
}): boolean {
  if (input.attestation.purpose !== RECOVERY_POSSESSION_ATTESTATION_PURPOSE) {
    return false;
  }
  if (input.attestation.userId !== input.userId) {
    return false;
  }
  if (input.attestation.challenge !== input.expectedChallenge) {
    return false;
  }
  const recordedMs = Date.parse(input.attestation.recordedAt);
  if (Number.isNaN(recordedMs)) {
    return false;
  }
  if (Math.abs(input.now - recordedMs) > RECOVERY_POSSESSION_ATTESTATION_MAX_AGE_MS) {
    return false;
  }
  try {
    const publicKeyRaw = Buffer.from(input.publicKeyBase64, "base64");
    if (publicKeyRaw.length !== 32) {
      return false;
    }
    const signature = Buffer.from(input.attestation.signature, "base64");
    if (signature.length !== 64) {
      return false;
    }
    const message = recoveryPossessionAttestationMessage({
      userId: input.attestation.userId,
      recordedAt: input.attestation.recordedAt,
      challenge: input.attestation.challenge,
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
