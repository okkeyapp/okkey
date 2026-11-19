import type { Vault } from "@okkey/types";
import { generateEntityId } from "@okkey/types";
import { useEffect, useRef } from "react";

import { useAuthVault } from "../../auth/AuthVaultContext";
import {
  hasSoftDeletedPersonalDataItem,
  buildPersonalDataBootstrapItem,
  shouldSkipPersonalDataBootstrap,
} from "../../items/personalDataBootstrap";
import { isPersonalDataBootstrapDismissed } from "../../items/personalDataBootstrapDismissal";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import { useWorkspaceVaultProfiles } from "../../items/WorkspaceVaultProfilesContext";
import { useLocale } from "../../locale/LocaleContext";
import { useProductTour } from "../../product-tour/ProductTourContext";
import { createKeyFormEditorMessages } from "../key-form/keyFormI18n";
import { useItemCategoryPreferences } from "./useItemCategoryPreferences";

type PersonalDataBootstrapControllerProps = {
  workspaceId: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
};

/**
 * After unlock, once items for the workspace are bootstrapped: if the user has never
 * had a personal_data item (and has not dismissed bootstrap via delete), create one in
 * the personal vault (no folder) with profile prefill.
 *
 * Does not open the edit popup — the first-sign-in product tour owns that explanation.
 * While the product tour is still incomplete, creation is deferred to the tour's last step.
 */
export default function PersonalDataBootstrapController({
  workspaceId,
  vaults,
  vaultsListReady,
}: PersonalDataBootstrapControllerProps) {
  const { t, locale } = useLocale();
  const { profile, vaultUnlocked, userId } = useAuthVault();
  const { items, bootstrapped, createItem } = useWorkspaceItems();
  const { canPostToVault } = useWorkspaceVaultProfiles();
  const {
    ready: preferencesReady,
    personalDataBootstrapDismissed,
    markPersonalDataBootstrapDismissed,
  } = useItemCategoryPreferences();
  const { ready: tourReady, completed: tourCompleted } = useProductTour();
  const doneWorkspaceIdRef = useRef<string | null>(null);
  const inFlightWorkspaceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !vaultUnlocked ||
      !bootstrapped ||
      !vaultsListReady ||
      !workspaceId ||
      !userId ||
      !preferencesReady ||
      !tourReady
    ) {
      return;
    }
    // Tour step 4 creates and opens Personal data; skip silent create until the tour is done.
    if (!tourCompleted) {
      return;
    }
    if (doneWorkspaceIdRef.current === workspaceId) {
      return;
    }
    if (inFlightWorkspaceIdRef.current === workspaceId) {
      return;
    }

    // Soft-deleted row still in retention → persist dismiss so a later purge cannot recreate.
    // Only when the server flag is not already set (avoids a redundant PUT on every unlock).
    if (hasSoftDeletedPersonalDataItem(items) && !personalDataBootstrapDismissed) {
      markPersonalDataBootstrapDismissed();
    }

    const dismissed =
      personalDataBootstrapDismissed || isPersonalDataBootstrapDismissed(userId, workspaceId);
    if (shouldSkipPersonalDataBootstrap(items, dismissed)) {
      doneWorkspaceIdRef.current = workspaceId;
      return;
    }

    const personalVault = vaults.find((vault) => vault.isPersonal);
    if (!personalVault || !canPostToVault(personalVault.id)) {
      return;
    }

    const title = t("web.newItemPopup.categories.personalData");
    const messages = createKeyFormEditorMessages(locale);
    const itemId = generateEntityId();
    const item = buildPersonalDataBootstrapItem({
      itemId,
      vaultId: personalVault.id,
      title,
      messages,
      firstName: profile?.firstName,
      lastName: profile?.lastName,
      email: profile?.email,
    });

    inFlightWorkspaceIdRef.current = workspaceId;

    void (async () => {
      try {
        await createItem(item);
        if (inFlightWorkspaceIdRef.current !== workspaceId) {
          return;
        }
        doneWorkspaceIdRef.current = workspaceId;
      } catch {
        if (inFlightWorkspaceIdRef.current === workspaceId) {
          inFlightWorkspaceIdRef.current = null;
        }
      } finally {
        if (inFlightWorkspaceIdRef.current === workspaceId) {
          inFlightWorkspaceIdRef.current = null;
        }
      }
    })();
  }, [
    bootstrapped,
    canPostToVault,
    createItem,
    items,
    locale,
    markPersonalDataBootstrapDismissed,
    personalDataBootstrapDismissed,
    preferencesReady,
    profile?.email,
    profile?.firstName,
    profile?.lastName,
    t,
    tourCompleted,
    tourReady,
    userId,
    vaultUnlocked,
    vaults,
    vaultsListReady,
    workspaceId,
  ]);

  return null;
}
