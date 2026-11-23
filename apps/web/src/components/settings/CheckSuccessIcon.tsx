import type { SVGProps } from "react";

import { cn } from "@okkey/ui";

/** Circle + check — success mark for credential rows in account settings. */
export function CheckSuccessIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M6.00016 8.00016L7.3335 9.3335L10.0002 6.66683M14.6668 8.00016C14.6668 11.6821 11.6821 14.6668 8.00016 14.6668C4.31826 14.6668 1.3335 11.6821 1.3335 8.00016C1.3335 4.31826 4.31826 1.3335 8.00016 1.3335C11.6821 1.3335 14.6668 4.31826 14.6668 8.00016Z"
        stroke="#16A34A"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
