import { cn } from "@okkey/ui";
import type { SVGProps } from "react";

/**
 * Triangle + info mark for recovery key / restore callouts.
 * Stroke follows `currentColor` (default: muted token) — not hardcoded black.
 */
export function RecoveryInfoTriangleIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
      {...props}
    >
      <path
        d="M6.90849 2.39404L1.50449 11.4167C1.39309 11.6096 1.33414 11.8284 1.3335 12.0511C1.33286 12.2739 1.39056 12.493 1.50086 12.6865C1.61115 12.8801 1.7702 13.0414 1.96219 13.1544C2.15417 13.2674 2.3724 13.3282 2.59516 13.3307H13.4045C13.6272 13.3281 13.8453 13.2673 14.0372 13.1544C14.2291 13.0414 14.388 12.8802 14.4983 12.6867C14.6086 12.4932 14.6663 12.2743 14.6658 12.0516C14.6652 11.8289 14.6064 11.6103 14.4952 11.4174L9.09116 2.39338C8.97746 2.20571 8.8173 2.05054 8.62613 1.94284C8.43496 1.83515 8.21925 1.77856 7.99983 1.77856C7.78041 1.77856 7.5647 1.83515 7.37353 1.94284C7.18236 2.05054 7.02219 2.20571 6.90849 2.39338V2.39404Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 6H8.00667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M7.3335 8H8.00016V10.6667H8.66683"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
