/**
 * Challenge signature for recovery-key possession.
 * The private key is derived from the recovery secret in the crypto engine.
 * The server stores only the Ed25519 public key and a single-use challenge.
 */
import { recoveryPossessionPublicKey, signRecoveryPossessionMessage } from "./vault-recovery-key.js";

export const RECOVERY_POSSESSION_PROOF_PURPOSE = "account.recovery_possession" as const;

export type RecoveryPossessionProofMessage = {
  userId: string;
  deviceId: string;
  challenge: string;
};

/** Canonical bytes. Key order must match the API verifier. */
export function recoveryPossessionProofMessageBytes(input: RecoveryPossessionProofMessage): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      challenge: input.challenge,
      device_id: input.deviceId,
      purpose: RECOVERY_POSSESSION_PROOF_PURPOSE,
      user_id: input.userId,
    }),
  );
}

export async function recoveryPossessionPublicKeyB64(recoverySecretUtf8: Uint8Array): Promise<string> {
  return recoveryPossessionPublicKey(recoverySecretUtf8);
}

export async function signRecoveryPossessionProof(
  recoverySecretUtf8: Uint8Array,
  input: RecoveryPossessionProofMessage,
): Promise<string> {
  return signRecoveryPossessionMessage(
    recoverySecretUtf8,
    recoveryPossessionProofMessageBytes(input),
  );
}
