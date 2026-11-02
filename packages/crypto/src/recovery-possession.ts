/**
 * Signed proof that the client decrypted the identity key with the vault key
 * recovered from the recovery wrap. The server checks the signature with the
 * stored Ed25519 public key and never sees the recovery secret.
 */
import { b64_encode, ed25519_sign } from "@okkey/crypto-wasm";
import { mapWasmError } from "./errors.js";
import { decryptUserIdentityFromEncryptedBlob } from "./user-identity-bundle.js";
import { wipeBytes } from "./secret-buffer.js";
import { ensureWasm } from "./wasm-init.js";

export const RECOVERY_POSSESSION_ATTESTATION_PURPOSE = "account.recovery_possession" as const;

/** Max age for `recorded_at` when the server accepts a recovery possession attestation. */
export const RECOVERY_POSSESSION_ATTESTATION_MAX_AGE_MS = 5 * 60 * 1000;

export type RecoveryPossessionAttestation = {
  purpose: typeof RECOVERY_POSSESSION_ATTESTATION_PURPOSE;
  user_id: string;
  recorded_at: string;
  challenge: string;
  signature: string;
};

function withWasmError<T>(op: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw mapWasmError(op, err);
  }
}

/** Canonical bytes signed by the user's Ed25519 identity key. Key order is part of the contract. */
export function recoveryPossessionAttestationMessageBytes(input: {
  userId: string;
  recordedAt: string;
  challenge: string;
}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      challenge: input.challenge,
      purpose: RECOVERY_POSSESSION_ATTESTATION_PURPOSE,
      recorded_at: input.recordedAt,
      user_id: input.userId,
    }),
  );
}

/**
 * Build a possession attestation after unwrapping the vault key with the recovery secret.
 * Used when the account enrolled a wrap before a possession verifier was stored.
 */
export async function buildRecoveryPossessionAttestation(input: {
  userId: string;
  vaultKey: Uint8Array;
  encryptedPrivateKeyPayloadB64: string;
  challenge: string;
  recordedAt?: string;
}): Promise<RecoveryPossessionAttestation> {
  await ensureWasm();
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const identity = await decryptUserIdentityFromEncryptedBlob(
    input.vaultKey,
    input.encryptedPrivateKeyPayloadB64,
  );
  try {
    const message = recoveryPossessionAttestationMessageBytes({
      userId: input.userId,
      recordedAt,
      challenge: input.challenge,
    });
    const signature = withWasmError("ed25519Sign", () =>
      ed25519_sign(identity.ed25519SecretKey, message),
    );
    return {
      purpose: RECOVERY_POSSESSION_ATTESTATION_PURPOSE,
      user_id: input.userId,
      recorded_at: recordedAt,
      challenge: input.challenge,
      signature: withWasmError("b64Encode", () => b64_encode(signature)),
    };
  } finally {
    wipeBytes(identity.ed25519SecretKey);
    wipeBytes(identity.mlkem768DecapsulationKey);
  }
}
