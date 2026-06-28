import type { CoreClient } from "@okkey/api";
import type { Vault } from "@okkey/types";
import { ApiRequestError } from "@okkey/api";

/**
 * Resolves the 32-byte key used to encrypt vault item payloads.
 * Personal vaults use the account split-key material; shared vaults require a wrapped key row.
 */
export async function resolveVaultItemEncryptionKey(input: {
  vault: Vault;
  accountVaultKey: Uint8Array;
  core: CoreClient;
}): Promise<Uint8Array> {
  if (input.vault.isPersonal) {
    return input.accountVaultKey;
  }

  try {
    await input.core.getVaultKey(input.vault.id);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      throw new Error("VAULT_KEY_NOT_FOUND");
    }
    throw error;
  }

  throw new Error("SHARED_VAULT_KEY_UNWRAP_UNSUPPORTED");
}
