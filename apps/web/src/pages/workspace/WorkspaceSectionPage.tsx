import type { Vault, Workspace, WorkspacePermissionsMatrixDto } from "@okkey/types";
import {
  DEFAULT_WORKSPACE_CAPSULE_POLICIES,
  isCapsuleAllowedForMember,
} from "@okkey/types";
import { useLocation, useOutletContext, useSearchParams } from "react-router-dom";

import ItemDetailCard from "../../components/items/ItemDetailCard";
import ItemsDetailPanelEmptyState from "../../components/items/ItemsDetailPanelEmptyState";
import WorkspaceSettingsPage from "../../components/workspace/settings/WorkspaceSettingsPage";
import CapsulesPage from "../capsules/CapsulesPage";
import { useLocale } from "../../locale/LocaleContext";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { useWorkspaceVaultProfiles } from "../../items/WorkspaceVaultProfilesContext";
import {
  FOLDER_QUERY_PARAM,
  ITEM_QUERY_PARAM,
  ITEMS_PATH,
  CAPSULES_PATH,
  isSettingsPathname,
  VAULT_QUERY_PARAM,
} from "../../routes/paths";
import WorkspaceNotFoundPage from "./WorkspaceNotFoundPage";

export type WorkspaceShellOutletContext = {
  workspaceId: string;
  vaults: readonly Vault[];
  vaultsListReady?: boolean;
  workspace?: Workspace;
  refreshWorkspaces?: () => Promise<void>;
  patchWorkspace?: (workspaceId: string, patch: Partial<Workspace>) => void;
  refreshVaults?: () => void | Promise<void>;
  workspacePermissions?: WorkspacePermissionsMatrixDto | null;
  workspacePermissionsReady?: boolean;
};

export default function WorkspaceSectionPage() {
  const {
    workspaceId,
    vaults,
    vaultsListReady,
    workspace,
    patchWorkspace,
    refreshVaults,
    workspacePermissions,
    workspacePermissionsReady,
  } = useOutletContext<WorkspaceShellOutletContext>();
  const { t } = useLocale();
  const { userId } = useAuthVault();
  const { canUseFunction } = useWorkspaceVaultProfiles();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const vaultId = searchParams.get(VAULT_QUERY_PARAM)?.trim() ?? "";
  const folderId = searchParams.get(FOLDER_QUERY_PARAM)?.trim() ?? "";
  const itemId = searchParams.get(ITEM_QUERY_PARAM)?.trim() ?? "";
  const isItemsRoute = location.pathname === ITEMS_PATH;
  const isCapsulesRoute = location.pathname === CAPSULES_PATH;
  const isSettingsRoute = isSettingsPathname(location.pathname);
  const capsulesAllowed = isCapsuleAllowedForMember(
    workspace?.capsulePolicies ?? DEFAULT_WORKSPACE_CAPSULE_POLICIES,
    userId,
  );

  if (isSettingsRoute) {
    return (
      <WorkspaceSettingsPage
        workspaceId={workspaceId}
        workspace={workspace}
        vaults={vaults}
        vaultsListReady={vaultsListReady}
        workspacePermissions={workspacePermissions ?? null}
        workspacePermissionsReady={workspacePermissionsReady ?? false}
        onSettingsChanged={(patch) => patchWorkspace?.(workspaceId, patch)}
        onVaultsChanged={refreshVaults}
      />
    );
  }

  if (isItemsRoute) {
    if (itemId) {
      return <ItemDetailCard itemId={itemId} vaults={vaults} workspaceId={workspaceId} />;
    }

    return (
      <ItemsDetailPanelEmptyState
        title={t("web.items.detail.selectItemTitle")}
        description={t("web.items.detail.selectItemDescription")}
      />
    );
  }

  if (isCapsulesRoute) {
    if (!capsulesAllowed) {
      return <WorkspaceNotFoundPage />;
    }
    return (
      <CapsulesPage
        workspaceId={workspaceId}
        workspaceName={workspace?.name ?? t("web.nav.capsules")}
        canCreate={vaults.some((vault) => canUseFunction(vault.id, "create_capsules"))}
      />
    );
  }

  return (
    <div className="space-y-2 p-4">
      <p className="okkey-body text-copy-secondary">{t("workspaces.shellPlaceholder")}</p>
      <p className="okkey-small text-copy-secondary" data-testid="workspace-shell-context-id">
        {workspaceId}
      </p>
      {vaultId ? (
        <p className="okkey-small text-copy-secondary" data-testid="items-vault-filter">
          vault: {vaultId}
        </p>
      ) : null}
      {folderId ? (
        <p className="okkey-small text-copy-secondary" data-testid="items-folder-filter">
          folder: {folderId}
        </p>
      ) : null}
    </div>
  );
}
