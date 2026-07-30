import type { CoreClient } from "@okkey/api";
import type { EncryptedBlobDto, Vault } from "@okkey/types";
import { ApiRequestError } from "@okkey/api";
import {
  decryptUserIdentityFromEncryptedBlob,
  unwrapVaultKeyForSelf,
} from "@okkey/crypto";

import { readVaultBundle } from "../auth/localVaultBundle";

/**
 * Resolves the 32-byte key used to encrypt vault item payloads.
 * Personal vaults use the account split-key material; shared vaults unwrap a hybrid-wrapped key.
 */
export async function resolveVaultItemEncryptionKey(input: {
  vault: Vault;
  accountVaultKey: Uint8Array;
  core: CoreClient;
  /** Optional pre-decrypted identity; when omitted, loaded from the local vault bundle. */
  identity?: {
    ed25519SecretKey: Uint8Array;
    mlkem768DecapsulationKey: Uint8Array;
  };
  userId?: string | null;
}): Promise<Uint8Array> {
  if (input.vault.isPersonal) {
    return input.accountVaultKey;
  }

  let encryptedVaultKey: EncryptedBlobDto;
  try {
    const response = await input.core.getVaultKey(input.vault.id);
    encryptedVaultKey = response.encryptedVaultKey;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      throw new Error("VAULT_KEY_NOT_FOUND");
    }
    throw error;
  }

  let identity = input.identity;
  if (!identity) {
    const bundle = readVaultBundle(input.userId ?? null);
    if (!bundle) {
      throw new Error("VAULT_IDENTITY_BUNDLE_MISSING");
    }
    identity = await decryptUserIdentityFromEncryptedBlob(
      input.accountVaultKey,
      bundle.encrypted_private_key.payload,
    );
  }

  return unwrapVaultKeyForSelf({
    encryptedVaultKey,
    recipientPrivateKey: identity.ed25519SecretKey,
    recipientPqPrivateKey: identity.mlkem768DecapsulationKey,
  });
}
