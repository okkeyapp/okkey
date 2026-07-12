import type { Vault, Workspace } from "@okkey/types";
import { useLocation, useOutletContext, useSearchParams } from "react-router-dom";

import ItemDetailCard from "../../components/items/ItemDetailCard";
import ItemsDetailPanelEmptyState from "../../components/items/ItemsDetailPanelEmptyState";
import WorkspaceSettingsPage from "../../components/workspace/settings/WorkspaceSettingsPage";
import { useLocale } from "../../locale/LocaleContext";
import { FOLDER_QUERY_PARAM, ITEM_QUERY_PARAM, ITEMS_PATH, isSettingsPathname, VAULT_QUERY_PARAM } from "../../routes/paths";

export type WorkspaceShellOutletContext = {
  workspaceId: string;
  vaults: readonly Vault[];
  workspace?: Workspace;
  refreshWorkspaces?: () => Promise<void>;
};

export default function WorkspaceSectionPage() {
  const { workspaceId, vaults, workspace, refreshWorkspaces } = useOutletContext<WorkspaceShellOutletContext>();
  const { t } = useLocale();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const vaultId = searchParams.get(VAULT_QUERY_PARAM)?.trim() ?? "";
  const folderId = searchParams.get(FOLDER_QUERY_PARAM)?.trim() ?? "";
  const itemId = searchParams.get(ITEM_QUERY_PARAM)?.trim() ?? "";
  const isItemsRoute = location.pathname === ITEMS_PATH;
  const isSettingsRoute = isSettingsPathname(location.pathname);

  if (isSettingsRoute) {
    return (
      <WorkspaceSettingsPage
        workspaceId={workspaceId}
        workspace={workspace}
        vaults={vaults}
        onSettingsChanged={() => void refreshWorkspaces?.()}
      />
    );
  }

  if (isItemsRoute) {
    if (itemId) {
      return <ItemDetailCard itemId={itemId} vaults={vaults} />;
    }

    return (
      <ItemsDetailPanelEmptyState
        title={t("web.items.detail.selectItemTitle")}
        description={t("web.items.detail.selectItemDescription")}
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
