import type { Workspace } from "@okkey/types";

import workspacePlanModule from "@okkey-enterprise/workspace-plan";
import { workspaceHasPlanFeature } from "../../workspace/planEntitlements";
import { cn, workspaceTileElevatedShadowClassName } from "@okkey/ui";

import { useAuthVault } from "../../auth/AuthVaultContext";
import WorkspaceLogoTile from "../../components/workspace/WorkspaceLogoTile";
import { DEFAULT_WORKSPACE_TILE_COLOR } from "../../components/workspace/settings/workspaceSettingsCatalog";
import { useWorkspaceLogoUrl } from "../../hooks/useWorkspaceLogoUrl";

type WorkspacesListTileProps = {
  workspace: Workspace;
  description: string;
  onClick: () => void;
};

export default function WorkspacesListTile({ workspace, description, onClick }: WorkspacesListTileProps) {
  const { accessToken, vaultKey } = useAuthVault();
  const hasCustomLogo = Boolean(workspace.logoVaultId && workspace.logoAttachmentId);
  const tileColor = workspace.tileColor ?? DEFAULT_WORKSPACE_TILE_COLOR;
  const logoUrl = useWorkspaceLogoUrl({
    accessToken,
    vaultKey,
    vaultId: workspace.logoVaultId,
    attachmentId: workspace.logoAttachmentId,
    workspaceId: workspace.id,
    enabled: hasCustomLogo,
  });
  const ListTileBadge = workspacePlanModule.ListTileBadge;
  const showPlanBadge =
    Boolean(ListTileBadge) &&
    !hasCustomLogo &&
    workspaceHasPlanFeature(workspace, "paidPlanBadge");

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[170px] w-[180px] shrink-0 flex-col items-center justify-center gap-6 rounded-xl bg-card p-6 text-card-foreground",
        workspaceTileElevatedShadowClassName,
        "transition-[transform,box-shadow] hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <div className="relative size-[60px] shrink-0">
        <WorkspaceLogoTile
          className="size-[60px]"
          tileColor={tileColor}
          hasCustomLogo={hasCustomLogo}
          imageSrc={logoUrl.imageSrc}
          loading={logoUrl.loading}
        />
        {showPlanBadge && ListTileBadge ? <ListTileBadge workspace={workspace} /> : null}
      </div>
      <div className="flex min-w-0 w-full flex-col items-center gap-0.5 text-center">
        <p className="w-full min-w-0 truncate text-base font-semibold leading-relaxed text-foreground">
          {workspace.name}
        </p>
        <p className="w-full text-sm font-normal leading-5 text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}
