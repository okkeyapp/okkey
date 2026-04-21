import { useOutletContext, useSearchParams } from "react-router-dom";

import { FOLDER_QUERY_PARAM, VAULT_QUERY_PARAM } from "../../routes/paths";
import { useLocale } from "../../locale/LocaleContext";

export type WorkspaceShellOutletContext = {
  workspaceId: string;
};

export default function WorkspaceSectionPage() {
  const { workspaceId } = useOutletContext<WorkspaceShellOutletContext>();
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  // Items filters from the shell URL; mutually exclusive at runtime (see `WorkspaceRoutesLayout` + `paths.ts`).
  const vaultId = searchParams.get(VAULT_QUERY_PARAM)?.trim() ?? "";
  const folderId = searchParams.get(FOLDER_QUERY_PARAM)?.trim() ?? "";

  return (
    <div className="space-y-2">
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
