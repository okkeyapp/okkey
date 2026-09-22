import type { AccountSecurityColorBand } from "@okkey/types";
import { cn } from "@okkey/ui";
import type { SVGProps } from "react";

/**
 * Account security shield — fill/stroke by score color band (light + dark).
 * Uses Tailwind palette tokens already used in Monitoring (green/yellow/amber/red).
 */
const BAND_CLASS: Record<AccountSecurityColorBand, string> = {
  good: "text-green-600 dark:text-green-400",
  almost: "text-lime-600 dark:text-lime-400",
  medium: "text-yellow-600 dark:text-yellow-400",
  weak: "text-orange-500 dark:text-orange-400",
  critical: "text-red-600 dark:text-red-400",
};

export type AccountSecurityShieldProps = SVGProps<SVGSVGElement> & {
  colorBand: AccountSecurityColorBand;
};

export function AccountSecurityShield({
  colorBand,
  className,
  ...props
}: AccountSecurityShieldProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-12 shrink-0", BAND_CLASS[colorBand], className)}
      aria-hidden
      {...props}
    >
      <path
        d="M24 4.5C24 4.5 12.5 8.2 10 9.2C9.55 9.38 9.2 9.78 9.2 10.26V24.4C9.2 32.9 15.35 37.55 23.15 40.35C23.7 40.55 24.3 40.55 24.85 40.35C32.65 37.55 38.8 32.9 38.8 24.4V10.26C38.8 9.78 38.45 9.38 38 9.2C35.5 8.2 24 4.5 24 4.5Z"
        fill="currentColor"
        fillOpacity={0.14}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M18.5 24.2L22.2 27.9L29.8 20.1"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AccountSecurityShieldSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("size-12 shrink-0 animate-pulse rounded-xl bg-secondary", className)}
      aria-hidden
    />
  );
}
