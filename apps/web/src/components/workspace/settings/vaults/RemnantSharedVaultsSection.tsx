import type { Vault, WorkspaceResourcePermissionDto } from "@okkey/types";
import { permissionAllowsObject } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { cn } from "@okkey/ui";
import { useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuthVault, useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
import { usePopupZoneGate } from "../../../../auth/usePopupZoneGate";
import {
  EDIT_VAULT_POPUP_ID,
  POPUP_QUERY_PARAM,
  buildPopupQueryValue,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../../../routes/popupQuery";

import RemnantSharedVaultCardPopup from "./RemnantSharedVaultCardPopup";
import VaultListRow from "./VaultListRow";
import {
  DEFAULT_SHARED_VAULT_ICON,
  normalizeVaultIcon,
} from "./vaultIcons";

type RemnantSharedVaultsSectionProps = {
  vaults: readonly Vault[];
  vaultsListReady?: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onVaultsChanged?: () => void | Promise<void>;
  resourcePermissions?: WorkspaceResourcePermissionDto | null;
};

/**
 * Shared vaults that remain after plan/modules downgrade: list for viewing + delete only.
 * No Create button and no plan upsell note.
 */
export default function RemnantSharedVaultsSection({
  vaults,
  vaultsListReady = true,
  t,
  onVaultsChanged,
  resourcePermissions = null,
}: RemnantSharedVaultsSectionProps) {
  const core = useAuthenticatedCoreClient();
  const { userId } = useAuthVault();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const sharedVaults = useMemo(() => vaults.filter((vault) => !vault.isPersonal), [vaults]);

  const popupRaw = searchParams.get(POPUP_QUERY_PARAM);
  const parsedPopup = parsePopupQueryValue(popupRaw);
  const isEditVault = parsedPopup?.popupId === EDIT_VAULT_POPUP_ID;
  const editVaultId = isEditVault ? parsedPopup?.menuItemId : undefined;
  const editingVault = editVaultId ? sharedVaults.find((vault) => vault.id === editVaultId) : undefined;

  const editingIsOwn = Boolean(
    userId && editingVault?.ownerId != null && editingVault.ownerId === userId,
  );
  const canDeleteEditing = permissionAllowsObject(resourcePermissions?.delete ?? 0, editingIsOwn);

  function openPopup(value: string) {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, value),
      },
      { replace: false },
    );
  }

  function closePopup() {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, null),
      },
      { replace: true },
    );
  }

  const editUrlOpen = Boolean(editingVault && core && userId);
  const popupOpen = usePopupZoneGate("vaultPopups", editUrlOpen, closePopup);

  if (!vaultsListReady || sharedVaults.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">
          {t("web.workspaceSettings.vaults.shared.title")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("web.workspaceSettings.vaults.shared.subtitle")}
        </p>
      </div>

      <div className="flex flex-col gap-4 px-px">
        <div>
          {sharedVaults.map((vault, index) => {
            const isFirst = index === 0;
            const isLast = index === sharedVaults.length - 1;
            return (
              <VaultListRow
                key={vault.id}
                icon={normalizeVaultIcon(vault.icon, DEFAULT_SHARED_VAULT_ICON)}
                title={vault.name}
                description={vault.description}
                trailing={t("web.workspaceSettings.vaults.memberCount", {
                  count: vault.memberCount ?? 0,
                })}
                onClick={() => openPopup(buildPopupQueryValue(EDIT_VAULT_POPUP_ID, vault.id))}
                rounded={isFirst && isLast ? "both" : isFirst ? "top" : isLast ? "bottom" : "none"}
                className={cn(!isFirst && "-mt-px")}
              />
            );
          })}
        </div>
      </div>

      {popupOpen && core && userId && editingVault ? (
        <RemnantSharedVaultCardPopup
          popupId={`${EDIT_VAULT_POPUP_ID}|${editVaultId}`}
          vault={editingVault}
          core={core}
          canDelete={canDeleteEditing}
          t={t}
          onClose={closePopup}
          onDeleted={async () => {
            await onVaultsChanged?.();
          }}
        />
      ) : null}
    </section>
  );
}
