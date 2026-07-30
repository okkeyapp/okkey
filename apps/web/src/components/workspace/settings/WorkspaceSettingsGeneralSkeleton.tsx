import { Skeleton, cn } from "@okkey/ui";

type WorkspaceSettingsGeneralSkeletonProps = {
  /** Owner-only danger zone block. */
  showDangerZone?: boolean;
  /** Accessible loading label for screen readers. */
  label?: string;
  className?: string;
};

/**
 * Loading placeholder for General settings: same layout as loaded content with
 * files-in-items off (no extensions / max-size fields).
 */
export default function WorkspaceSettingsGeneralSkeleton({
  showDangerZone = true,
  label,
  className,
}: WorkspaceSettingsGeneralSkeletonProps) {
  return (
    <div
      className={cn("flex w-full flex-col gap-9", className)}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-6">
          <Skeleton className="size-[60px] shrink-0 rounded-lg" />
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-9 w-[168px] rounded-md" />
            <Skeleton className="h-5 w-8 rounded-sm" />
            <Skeleton className="h-9 w-[180px] rounded-md" />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-44 max-w-[60%]" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <Skeleton className="h-7 w-24" />
        <div className="flex flex-col">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <Skeleton className="h-5 w-56 max-w-full" />
              <Skeleton className="h-5 w-full max-w-md" />
            </div>
            <Skeleton className="h-9 w-full shrink-0 rounded-md sm:w-[150px]" />
          </div>

          <div className="my-4 border-t border-border" aria-hidden />

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <Skeleton className="h-5 w-52 max-w-full" />
              <Skeleton className="h-5 w-full max-w-sm" />
            </div>
            <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
          </div>
        </div>
      </div>

      {showDangerZone ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-7 w-36" />
          <div className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              <Skeleton className="h-5 w-44 max-w-full" />
              <Skeleton className="h-5 w-full max-w-lg" />
            </div>
            <Skeleton className="h-9 w-[88px] shrink-0 rounded-md" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
