import type { Vault } from "@okkey/types";
import { generateEntityId } from "@okkey/types";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuthVault } from "../../auth/AuthVaultContext";
import { buildPersonalDataBootstrapItem, hasPersonalDataItem } from "../../items/personalDataBootstrap";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import { useWorkspaceVaultProfiles } from "../../items/WorkspaceVaultProfilesContext";
import { useLocale } from "../../locale/LocaleContext";
import {
  EDIT_ITEM_POPUP_ID,
  POPUP_QUERY_PARAM,
  buildPopupQueryValue,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../routes/popupQuery";
import { createKeyFormEditorMessages } from "../key-form/keyFormI18n";

type PersonalDataBootstrapControllerProps = {
  workspaceId: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
};

/**
 * After unlock, once items for the workspace are bootstrapped: if the user has never
 * had a personal_data item (including soft-deleted), create one in the personal vault
 * (no folder) with profile prefill and open its edit popup. Soft-deleted records are
 * treated as a deliberate delete — we do not recreate them on unlock.
 */
export default function PersonalDataBootstrapController({
  workspaceId,
  vaults,
  vaultsListReady,
}: PersonalDataBootstrapControllerProps) {
  const { t, locale } = useLocale();
  const { profile, vaultUnlocked } = useAuthVault();
  const { items, bootstrapped, createItem } = useWorkspaceItems();
  const { canPostToVault } = useWorkspaceVaultProfiles();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const doneWorkspaceIdRef = useRef<string | null>(null);
  const inFlightWorkspaceIdRef = useRef<string | null>(null);
  const navigateRef = useRef(navigate);
  const locationRef = useRef(location);
  navigateRef.current = navigate;
  locationRef.current = location;

  useEffect(() => {
    if (!vaultUnlocked || !bootstrapped || !vaultsListReady || !workspaceId) {
      return;
    }
    if (doneWorkspaceIdRef.current === workspaceId) {
      return;
    }
    if (inFlightWorkspaceIdRef.current === workspaceId) {
      return;
    }
    if (hasPersonalDataItem(items)) {
      doneWorkspaceIdRef.current = workspaceId;
      return;
    }

    const personalVault = vaults.find((vault) => vault.isPersonal);
    if (!personalVault || !canPostToVault(personalVault.id)) {
      return;
    }

    // Defer while another popup is open so we do not stack UI; retry when it closes.
    if (parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM))) {
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
        const createdId = await createItem(item);
        if (inFlightWorkspaceIdRef.current !== workspaceId) {
          return;
        }
        doneWorkspaceIdRef.current = workspaceId;
        const currentLocation = locationRef.current;
        navigateRef.current(
          {
            pathname: currentLocation.pathname,
            search: popupQuerySearch(
              currentLocation.search,
              buildPopupQueryValue(EDIT_ITEM_POPUP_ID, createdId),
            ),
            hash: currentLocation.hash,
          },
          { replace: false },
        );
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
    profile?.email,
    profile?.firstName,
    profile?.lastName,
    searchParams,
    t,
    vaultUnlocked,
    vaults,
    vaultsListReady,
    workspaceId,
  ]);

  return null;
}
