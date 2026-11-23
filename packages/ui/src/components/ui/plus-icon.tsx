import * as React from "react";

import { cn } from "../../lib/utils.js";

/** Thin 16×16 plus — same glyph as “Add section with field”. */
export function PlusIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
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
        d="M3.33337 7.99992H12.6667M8.00004 3.33325V12.6666"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
