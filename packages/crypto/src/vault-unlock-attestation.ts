import { b64_encode, ed25519_sign } from "@okkey/crypto-wasm";
import { mapWasmError } from "./errors.js";
import { decryptUserIdentityFromEncryptedBlob } from "./user-identity-bundle.js";
import { wipeBytes } from "./secret-buffer.js";
import { ensureWasm } from "./wasm-init.js";

export const VAULT_UNLOCK_ATTESTATION_PURPOSE = "account.vault_unlock" as const;

/** Max age for `recorded_at` when the server accepts an unlock attestation. */
export const VAULT_UNLOCK_ATTESTATION_MAX_AGE_MS = 60_000;

export type VaultUnlockAttestation = {
  purpose: typeof VAULT_UNLOCK_ATTESTATION_PURPOSE;
  user_id: string;
  recorded_at: string;
  signature: string;
};

function withWasmError<T>(op: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw mapWasmError(op, err);
  }
}

/** Canonical bytes signed by the user's Ed25519 identity key. */
export function vaultUnlockAttestationMessageBytes(input: {
  userId: string;
  recordedAt: string;
}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      purpose: VAULT_UNLOCK_ATTESTATION_PURPOSE,
      recorded_at: input.recordedAt,
      user_id: input.userId,
    }),
  );
}

/**
 * Build a signed unlock attestation after a successful local vault unlock.
 * Proves the client could decrypt the identity key (master password / PIN / bio unwrap).
 */
export async function buildVaultUnlockAttestation(input: {
  userId: string;
  vaultKey: Uint8Array;
  encryptedPrivateKeyPayloadB64: string;
  recordedAt?: string;
}): Promise<VaultUnlockAttestation> {
  await ensureWasm();
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const identity = await decryptUserIdentityFromEncryptedBlob(
    input.vaultKey,
    input.encryptedPrivateKeyPayloadB64,
  );
  try {
    const message = vaultUnlockAttestationMessageBytes({
      userId: input.userId,
      recordedAt,
    });
    const signature = withWasmError("ed25519Sign", () =>
      ed25519_sign(identity.ed25519SecretKey, message),
    );
    return {
      purpose: VAULT_UNLOCK_ATTESTATION_PURPOSE,
      user_id: input.userId,
      recorded_at: recordedAt,
      signature: withWasmError("b64Encode", () => b64_encode(signature)),
    };
  } finally {
    wipeBytes(identity.ed25519SecretKey);
    wipeBytes(identity.mlkem768DecapsulationKey);
  }
}
