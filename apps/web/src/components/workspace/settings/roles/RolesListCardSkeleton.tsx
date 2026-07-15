import { Skeleton, cn } from "@okkey/ui";

type RolesListCardSkeletonProps = {
  rows?: number;
  className?: string;
  loadingLabel?: string;
};

export default function RolesListCardSkeleton({
  rows = 3,
  className,
  loadingLabel,
}: RolesListCardSkeletonProps) {
  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-border", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={loadingLabel}
    >
      {loadingLabel ? <span className="sr-only">{loadingLabel}</span> : null}
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={cn("flex items-center gap-4 px-4 py-4", index > 0 && "border-t border-border")}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="size-8 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
