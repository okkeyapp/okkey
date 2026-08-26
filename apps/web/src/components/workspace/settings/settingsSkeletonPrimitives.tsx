import { Skeleton, cn } from "@okkey/ui";
import type { ReactNode } from "react";

type SettingsSkeletonShellProps = {
  label?: string;
  className?: string;
  children: ReactNode;
};

export function SettingsSkeletonShell({ label, className, children }: SettingsSkeletonShellProps) {
  return (
    <div
      className={cn("flex w-full flex-col gap-6", className)}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {children}
    </div>
  );
}

/** Section title + short intro under it. */
export function SettingsPageIntroSkeleton({ titleWidthClass = "w-28" }: { titleWidthClass?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className={cn("h-7", titleWidthClass)} />
      <div className="space-y-2">
        <Skeleton className="h-5 w-full max-w-xl" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
    </div>
  );
}

type SettingsFieldRowSkeletonProps = {
  control: "select" | "switch" | "input";
  labelWidthClass?: string;
  descriptionWidthClass?: string;
};

/** Label + description on the left, control skeleton on the right. */
export function SettingsFieldRowSkeleton({
  control,
  labelWidthClass = "w-56",
  descriptionWidthClass = "w-full max-w-md",
}: SettingsFieldRowSkeletonProps) {
  return (
    <div
      className={cn(
        "flex gap-4",
        control === "switch"
          ? "items-center justify-between"
          : "flex-col sm:flex-row sm:items-center sm:justify-between",
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <Skeleton className={cn("h-5 max-w-full", labelWidthClass)} />
        <Skeleton className={cn("h-5", descriptionWidthClass)} />
      </div>
      {control === "switch" ? (
        <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
      ) : (
        <Skeleton className="h-9 w-full shrink-0 rounded-md sm:w-[150px]" />
      )}
    </div>
  );
}

export function SettingsFieldDividerSkeleton() {
  return <div className="my-4 border-t border-border" aria-hidden />;
}
