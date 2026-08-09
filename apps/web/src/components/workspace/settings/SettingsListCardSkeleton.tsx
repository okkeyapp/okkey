import { Skeleton, cn } from "@okkey/ui";

type SettingsListCardSkeletonProps = {
  /** Match vault rows that include a leading icon tile. */
  withLeadingIcon?: boolean;
  /** Full-width button placeholder under the list row (default true). */
  withFooterButton?: boolean;
  /** Accessible loading label for screen readers. */
  label?: string;
  className?: string;
};

/**
 * Loading placeholder for settings list cards: one row (78px, same as list item) +
 * optional secondary-style button skeleton below with 16px gap.
 */
export default function SettingsListCardSkeleton({
  withLeadingIcon = false,
  withFooterButton = true,
  label,
  className,
}: SettingsListCardSkeletonProps) {
  return (
    <div
      className={cn("flex flex-col gap-4 px-px", className)}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {/* Bordered surface is h-[78px] (border-box) — same as roles/profiles/vault list rows. */}
      <div className="flex h-[78px] w-full items-center gap-4 rounded-lg border border-border px-4">
        {withLeadingIcon ? <Skeleton className="size-8 shrink-0 rounded-md" /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Skeleton className="h-5 w-32 max-w-[45%]" />
          <Skeleton className="h-5 w-52 max-w-[70%]" />
        </div>
        <Skeleton className="h-5 w-16 shrink-0" />
      </div>
      {withFooterButton ? <Skeleton className="h-9 w-full rounded-md" /> : null}
    </div>
  );
}
