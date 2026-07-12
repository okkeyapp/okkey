import { cn, PersonalWorkspaceMark, Skeleton } from "@okkey/ui";
import { useEffect, useState } from "react";

import { DEFAULT_WORKSPACE_TILE_COLOR } from "./settings/workspaceSettingsCatalog";

type WorkspaceLogoTileProps = {
  tileColor?: string | null;
  hasCustomLogo: boolean;
  imageSrc?: string;
  loading?: boolean;
  className?: string;
};

/** Workspace tile mark: custom logo with skeleton (like record favicon) or colored PersonalWorkspaceMark. */
export default function WorkspaceLogoTile({
  tileColor,
  hasCustomLogo,
  imageSrc,
  loading = false,
  className,
}: WorkspaceLogoTileProps) {
  const fillColor = tileColor ?? DEFAULT_WORKSPACE_TILE_COLOR;
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
  }, [imageSrc]);

  if (!hasCustomLogo) {
    return (
      <div className={cn("overflow-hidden rounded-lg", className)}>
        <PersonalWorkspaceMark fillColor={fillColor} className="size-full" />
      </div>
    );
  }

  const hasImageSrc = Boolean(imageSrc);
  const imagePending = hasImageSrc && !imageLoaded;
  const skeletonWhileLoading = loading || hasImageSrc;
  const showSkeleton = skeletonWhileLoading && (loading || imagePending);

  return (
    <div className={cn("relative isolate overflow-hidden rounded-lg", className)}>
      {showSkeleton ? <Skeleton className="absolute inset-0 z-[1] rounded-lg" /> : null}
      {hasImageSrc ? (
        <img
          src={imageSrc}
          alt=""
          className={cn("size-full object-cover", imagePending && skeletonWhileLoading && "opacity-0")}
          draggable={false}
          onLoad={() => setImageLoaded(true)}
        />
      ) : null}
      {!showSkeleton && !hasImageSrc ? (
        <PersonalWorkspaceMark fillColor={fillColor} className="size-full" />
      ) : null}
    </div>
  );
}
