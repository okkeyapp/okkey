import type { SVGProps } from "react";
import { hasPlanFeature, type Workspace } from "@okkey/types";
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

function BriefcaseGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden {...props}>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </svg>
  );
}

const badgeShadow =
  "shadow-[0px_0px_0px_1px_rgba(0,0,0,0.06),0px_1px_2px_rgba(0,0,0,0.12)] dark:shadow-[0px_0px_0px_1px_rgba(255,255,255,0.2),0px_2px_8px_rgba(255,255,255,0.07)]";

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
  const showBusinessBadge = hasPlanFeature(workspace.planTier, "paidPlanBadge") && !hasCustomLogo;

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
        {showBusinessBadge ? (
          <div
            className={cn(
              "absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-lg bg-card",
              badgeShadow,
            )}
          >
            <BriefcaseGlyph className="size-3.5 text-foreground" />
          </div>
        ) : null}
      </div>
      <div className="flex w-full flex-col items-center gap-0.5 text-center">
        <p className="w-full text-base font-semibold leading-relaxed text-foreground">{workspace.name}</p>
        <p className="w-full text-sm font-normal leading-5 text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}
