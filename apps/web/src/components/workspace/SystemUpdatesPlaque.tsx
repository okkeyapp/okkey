import { cn } from "@okkey/ui";
import type { SVGProps } from "react";

type SystemUpdatesPlaqueProps = {
  versionLabel: string;
  /** When true, secondary line is «update available»; else «check for update». */
  updateAvailable: boolean;
  checkLabel: string;
  availableLabel: string;
  onClick: () => void;
  className?: string;
};

/** Reload arrows for «check for update» (exact asset paths; stroke via currentColor). */
function RefreshCircularIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M13.2886 8.69411C13.1627 9.65408 12.7779 10.5617 12.1754 11.3196C11.5729 12.0774 10.7755 12.657 9.8686 12.9961C8.96174 13.3352 7.97968 13.4211 7.02773 13.2445C6.07578 13.0679 5.18987 12.6355 4.46499 11.9937C3.74012 11.3518 3.20363 10.5248 2.91307 9.60121C2.62251 8.67765 2.58884 7.69241 2.81566 6.75117C3.04249 5.80992 3.52125 4.94818 4.20061 4.25835C4.87997 3.56852 5.73429 3.07663 6.67196 2.83544C9.27129 2.16878 11.962 3.50678 12.9553 6.00011"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M13.3333 2.6665V5.99984H10"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </svg>
  );
}

/** Triangle info for «update available» (exact asset paths; stroke via currentColor). */
function UpdateInfoTriangleIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M6.90849 2.3938L1.50449 11.4165C1.39309 11.6094 1.33414 11.8281 1.3335 12.0509C1.33286 12.2737 1.39056 12.4927 1.50086 12.6863C1.61115 12.8798 1.7702 13.0412 1.96219 13.1542C2.15417 13.2672 2.3724 13.328 2.59516 13.3305H13.4045C13.6272 13.3279 13.8453 13.2671 14.0372 13.1541C14.2291 13.0411 14.388 12.8799 14.4983 12.6865C14.6086 12.493 14.6663 12.2741 14.6658 12.0514C14.6652 11.8287 14.6064 11.61 14.4952 11.4171L9.09116 2.39313C8.97746 2.20547 8.8173 2.0503 8.62613 1.9426C8.43496 1.8349 8.21925 1.77832 7.99983 1.77832C7.78041 1.77832 7.5647 1.8349 7.37353 1.9426C7.18236 2.0503 7.02219 2.20547 6.90849 2.39313V2.3938Z"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M8 6H8.00667"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M7.3335 8H8.00016V10.6667H8.66683"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </svg>
  );
}

/** Input-like accent focus ring (matches `inputLikeControlClassName`). */
const plaqueFocusRingClassName =
  "outline-none focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
  "dark:focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]";

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
        "flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left transition-[background-color,box-shadow]",
        // Default = user-button hover surface; hover = darker.
        "bg-[rgba(0,0,0,0.05)] hover:bg-[rgba(0,0,0,0.1)] dark:bg-[rgba(255,255,255,0.08)] dark:hover:bg-[rgba(255,255,255,0.14)]",
        plaqueFocusRingClassName,
        className,
      )}
    >
      <span
        className="truncate text-xs leading-4 text-foreground"
        data-testid="sidebar-instance-version-label"
      >
        {versionLabel}
      </span>
      <span
        className="inline-flex max-w-full items-center gap-1 truncate text-xs font-medium leading-4 text-muted-foreground"
        data-testid={updateAvailable ? "sidebar-update-notice" : "sidebar-update-check"}
      >
        {updateAvailable ? (
          <UpdateInfoTriangleIcon className="text-muted-foreground" />
        ) : (
          <RefreshCircularIcon className="text-muted-foreground" />
        )}
        <span className="truncate">{secondary}</span>
      </span>
    </button>
  );
}
