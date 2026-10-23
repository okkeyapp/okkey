import { cn } from "@okkey/ui";
import type { SVGProps } from "react";

import { RecoveryInfoTriangleIcon } from "../settings/RecoveryInfoTriangleIcon";

type SystemUpdatesPlaqueProps = {
  versionLabel: string;
  /** When true, secondary line is «update available»; else «check for update». */
  updateAvailable: boolean;
  checkLabel: string;
  availableLabel: string;
  onClick: () => void;
  className?: string;
};

/** Circular arrows for «check for update». */
function RefreshCircularIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-3.5 shrink-0", className)}
      {...props}
    >
      <path
        d="M13.333 2.667v3.333H10"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.667 13.333V10H6"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.727 6A4.667 4.667 0 0 1 12.24 4.24l1.093 1.76M2.667 10l1.093-1.76A4.667 4.667 0 0 0 12.273 10"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Sidebar footer plaque (between Help/Docs and account): current Okkey version +
 * check / update-available affordance. Entire control is clickable.
 */
export default function SystemUpdatesPlaque({
  versionLabel,
  updateAvailable,
  checkLabel,
  availableLabel,
  onClick,
  className,
}: SystemUpdatesPlaqueProps) {
  const secondary = updateAvailable ? availableLabel : checkLabel;

  return (
    <button
      type="button"
      data-testid="sidebar-updates-plaque"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left outline-none transition-[background-color,box-shadow]",
        // Default = user-button hover surface; hover = darker; focus = input-like accent ring.
        "bg-[rgba(0,0,0,0.05)] hover:bg-[rgba(0,0,0,0.1)] dark:bg-[rgba(255,255,255,0.08)] dark:hover:bg-[rgba(255,255,255,0.14)]",
        "focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
        className,
      )}
    >
      <span
        className="truncate text-xs leading-4 text-muted-foreground"
        data-testid="sidebar-instance-version-label"
      >
        {versionLabel}
      </span>
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-1 truncate text-xs font-medium leading-4 text-primary",
          !updateAvailable && "underline-offset-2",
        )}
        data-testid={updateAvailable ? "sidebar-update-notice" : "sidebar-update-check"}
      >
        {updateAvailable ? (
          <RecoveryInfoTriangleIcon className="size-3.5 text-primary" />
        ) : (
          <RefreshCircularIcon className="text-primary" />
        )}
        <span className={cn("truncate", !updateAvailable && "underline")}>{secondary}</span>
      </span>
    </button>
  );
}
