import {
  decryptUserIdentityFromEncryptedBlob,
  derivePasswordShareC,
  reconstructVaultKeyWithMasterPassword,
  wipeBytes,
} from "@okkey/crypto";

import { base64ToBytes } from "./base64.js";
import type { StoredVaultBundle } from "./vault-bundle.js";

export type UnlockWithMasterPasswordResult = {
  vaultKey: Uint8Array;
  passwordShareC: Uint8Array;
};

/**
 * Pure unlock: reconstruct VaultKey + C from the local bundle and master password.
 * Caller must hold secrets in memory and wipe on lock.
 */
export async function unlockWithMasterPassword(
  bundle: StoredVaultBundle,
  masterPassword: string,
): Promise<UnlockWithMasterPasswordResult> {
  const pwd = new TextEncoder().encode(masterPassword);
  const serverA = base64ToBytes(bundle.server_key_share_b64);
  const deviceB = base64ToBytes(bundle.device_share_b64);
  const salt = base64ToBytes(bundle.password_kdf_salt_b64);
  try {
    const passwordShareC = await derivePasswordShareC({
      masterPasswordUtf8: pwd,
      passwordKdfSalt: salt,
      passwordKdfParamsVersion: bundle.password_kdf_params_version,
    });
    const vaultKey = await reconstructVaultKeyWithMasterPassword({
      masterPasswordUtf8: pwd,
      serverKeyShare: serverA,
      deviceShare: deviceB,
      passwordKdfSalt: salt,
      passwordKdfParamsVersion: bundle.password_kdf_params_version,
    });
    await decryptUserIdentityFromEncryptedBlob(vaultKey, bundle.encrypted_private_key.payload);
    return { vaultKey, passwordShareC };
  } finally {
    wipeBytes(pwd);
    wipeBytes(serverA);
    wipeBytes(deviceB);
    wipeBytes(salt);
  }
}
