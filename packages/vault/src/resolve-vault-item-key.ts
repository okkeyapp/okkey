import type { CoreClient } from "@okkey/api";
import { ApiRequestError } from "@okkey/api";
import {
  decryptUserIdentityFromEncryptedBlob,
  unwrapVaultKeyForSelf,
} from "@okkey/crypto";
import type { EncryptedBlobDto, Vault } from "@okkey/types";

export type VaultIdentityKeys = {
  ed25519SecretKey: Uint8Array;
  mlkem768DecapsulationKey: Uint8Array;
};

/**
 * Resolves the 32-byte key used to encrypt vault item payloads.
 * Personal vaults use the account split-key; shared vaults unwrap a hybrid-wrapped key.
 * Identity must be provided (no localStorage coupling) — load via decryptUserIdentityFromEncryptedBlob.
 */
export async function resolveVaultItemEncryptionKey(input: {
  vault: Vault;
  accountVaultKey: Uint8Array;
  core: CoreClient;
  identity?: VaultIdentityKeys;
  /** When identity is omitted, decrypt from this encrypted private key blob. */
  encryptedPrivateKeyPayload?: string;
}): Promise<Uint8Array> {
  if (input.vault.isPersonal) {
    return input.accountVaultKey;
  }

  let encryptedVaultKey: EncryptedBlobDto;
  try {
    const response = await input.core.getVaultKey(input.vault.id);
    encryptedVaultKey = response.encryptedVaultKey;
  } catch (error: unknown) {
    if (error instanceof ApiRequestError && error.status === 404) {
      throw new Error("VAULT_KEY_NOT_FOUND");
    }
    throw error;
  }

  let identity = input.identity;
  if (!identity) {
    if (!input.encryptedPrivateKeyPayload) {
      throw new Error("VAULT_IDENTITY_BUNDLE_MISSING");
    }
    identity = await decryptUserIdentityFromEncryptedBlob(
      input.accountVaultKey,
      input.encryptedPrivateKeyPayload,
    );
  }

  return unwrapVaultKeyForSelf({
    encryptedVaultKey,
    recipientPrivateKey: identity.ed25519SecretKey,
    recipientPqPrivateKey: identity.mlkem768DecapsulationKey,
  });
}
