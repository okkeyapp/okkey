import type { Vault, Workspace } from "@okkey/types";
import { hasPlanFeature, normalizePlanTier } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import enterpriseSharedVaultsModule from "@okkey-enterprise/workspace-shared-vaults";

import { useAuthVault, useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
import {
  EDIT_VAULT_POPUP_ID,
  POPUP_QUERY_PARAM,
  buildPopupQueryValue,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../../../routes/popupQuery";

import SharedVaultsUpsell from "./SharedVaultsUpsell";
import VaultListRow from "./VaultListRow";
import VaultsSectionHeader from "./VaultsSectionHeader";
import SettingsListCardSkeleton from "../SettingsListCardSkeleton";
import { DEFAULT_PERSONAL_VAULT_ICON, normalizeVaultIcon } from "./vaultIcons";

type WorkspaceSettingsVaultsSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  vaults: readonly Vault[];
  vaultsListReady?: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onVaultsChanged?: () => void | Promise<void>;
};

export default function WorkspaceSettingsVaultsSection({
  workspaceId,
  workspace,
  vaults,
  vaultsListReady = true,
  t,
  onVaultsChanged,
}: WorkspaceSettingsVaultsSectionProps) {
  const core = useAuthenticatedCoreClient();
  const { userId, vaultKey } = useAuthVault();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const canManageSharedPlan = hasPlanFeature(workspace?.planTier, "sharedVaults");
  const SharedVaultsSection = enterpriseSharedVaultsModule.SharedVaultsSection;
  const PersonalVaultCardPopup = enterpriseSharedVaultsModule.PersonalVaultCardPopup;
  const showEnterpriseShared = Boolean(canManageSharedPlan && SharedVaultsSection);
  /** Personal vault card opens only on paid plan + enterprise module (like built-in role cards). */
  const canOpenPersonalVault =
    normalizePlanTier(workspace?.planTier) === "ENTERPRISE" && Boolean(PersonalVaultCardPopup);

  const personalVault = useMemo(() => vaults.find((vault) => vault.isPersonal) ?? null, [vaults]);

  const popupRaw = searchParams.get(POPUP_QUERY_PARAM);
  const parsedPopup = parsePopupQueryValue(popupRaw);
  const isEditVault = parsedPopup?.popupId === EDIT_VAULT_POPUP_ID;
  const editVaultId = isEditVault ? parsedPopup?.menuItemId : undefined;
  const editingVault = editVaultId ? vaults.find((vault) => vault.id === editVaultId) : undefined;
  const editingPersonal =
    editingVault && editingVault.isPersonal && canOpenPersonalVault ? editingVault : undefined;

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

  return (
    <div className="flex flex-col gap-9">
      <VaultsSectionHeader t={t} />

      {!vaultsListReady ? (
        <SettingsListCardSkeleton
          withLeadingIcon
          withFooterButton={false}
          label={t("web.workspaceSettings.vaults.loading")}
        />
      ) : personalVault ? (
        <div className="px-px">
          <VaultListRow
            icon={normalizeVaultIcon(personalVault.icon, DEFAULT_PERSONAL_VAULT_ICON)}
            title={personalVault.name || t("web.workspaceSettings.vaults.personal.title")}
            description={
              personalVault.description || t("web.workspaceSettings.vaults.personal.description")
            }
            trailing={t("web.workspaceSettings.vaults.personal.onlyYou")}
            onClick={
              canOpenPersonalVault
                ? () => openPopup(buildPopupQueryValue(EDIT_VAULT_POPUP_ID, personalVault.id))
                : undefined
            }
          />
        </div>
      ) : null}

      {showEnterpriseShared && SharedVaultsSection ? (
        <SharedVaultsSection
          workspaceId={workspaceId}
          workspace={workspace}
          vaults={vaults}
          vaultsListReady={vaultsListReady}
          t={t}
          onVaultsChanged={onVaultsChanged}
          personalVaultId={personalVault?.id ?? null}
        />
      ) : (
        <section className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-sm font-medium text-foreground">
              {t("web.workspaceSettings.vaults.shared.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("web.workspaceSettings.vaults.shared.subtitle")}
            </p>
          </div>
          <SharedVaultsUpsell t={t} />
        </section>
      )}

      {editingPersonal && core && userId && PersonalVaultCardPopup ? (
        <PersonalVaultCardPopup
          popupId={`${EDIT_VAULT_POPUP_ID}|${editVaultId}`}
          mode="personal"
          initialVault={editingPersonal}
          workspaceId={workspaceId}
          core={core}
          userId={userId}
          accountVaultKey={vaultKey}
          members={[]}
          profiles={[]}
          initialAccessByUserId={{}}
          t={t}
          onClose={closePopup}
          onSaved={async () => {
            await onVaultsChanged?.();
          }}
        />
      ) : null}
    </div>
  );
}
