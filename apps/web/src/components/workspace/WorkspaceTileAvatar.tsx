import type { Workspace } from "@okkey/types";
import { cn } from "@okkey/ui";

import { useAuthVault } from "../../auth/AuthVaultContext";
import { useWorkspaceLogoUrl } from "../../hooks/useWorkspaceLogoUrl";
import WorkspaceLogoTile from "./WorkspaceLogoTile";

type WorkspaceTileAvatarProps = {
  workspace?: Workspace;
  sizeClass: string;
};

export default function WorkspaceTileAvatar({ workspace, sizeClass }: WorkspaceTileAvatarProps) {
  const { accessToken, vaultKey, userId } = useAuthVault();
  const hasCustomLogo = Boolean(
    workspace?.logoKeyVersion || (workspace?.logoVaultId && workspace?.logoAttachmentId),
  );
  const logoUrl = useWorkspaceLogoUrl({
    accessToken,
    vaultKey,
    vaultId: workspace?.logoVaultId,
    attachmentId: workspace?.logoAttachmentId,
    workspaceId: workspace?.id ?? "",
    enabled: hasCustomLogo,
    logoKeyVersion: workspace?.logoKeyVersion,
    userId,
  });

  if (!workspace) {
    return <div className={cn("shrink-0 rounded-lg bg-muted", sizeClass)} />;
  }

  return (
    <WorkspaceLogoTile
      className={cn("shrink-0", sizeClass)}
      tileColor={workspace.tileColor}
      hasCustomLogo={hasCustomLogo}
      imageSrc={logoUrl.imageSrc}
      loading={logoUrl.loading}
    />
  );
}
