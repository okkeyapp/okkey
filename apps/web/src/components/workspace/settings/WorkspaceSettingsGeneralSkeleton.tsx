import { Skeleton, cn } from "@okkey/ui";

type WorkspaceSettingsGeneralSkeletonProps = {
  /** SaaS owner-only danger zone placeholder (enterprise overlay). */
  showDangerZone?: boolean;
  /** Accessible loading label for screen readers. */
  label?: string;
  className?: string;
};

/**
 * Loading placeholder for General settings: logo / name / optional danger zone.
 */
export default function WorkspaceSettingsGeneralSkeleton({
  showDangerZone = false,
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
