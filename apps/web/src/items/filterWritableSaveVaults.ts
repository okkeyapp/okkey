import type { Vault } from "@okkey/types";

import { workspaceHasPlanFeature } from "../workspace/planEntitlements";

/**
 * Personal vaults always; shared only when plan grants `sharedVaults`.
 * When editing, keep `currentVaultId` even if shared (ITEM_UPDATE on remnant vault).
 */
export function filterWritableSaveVaults(
  vaults: readonly Vault[],
  canPostToVault: (vaultId: string) => boolean,
  currentVaultId?: string,
): Vault[] {
  const sharedAllowed = workspaceHasPlanFeature(null, "sharedVaults");
  return vaults.filter((vault) => {
    if (!canPostToVault(vault.id)) {
      return false;
    }
    if (vault.isPersonal || sharedAllowed) {
      return true;
    }
    return Boolean(currentVaultId && vault.id === currentVaultId);
  });
}
