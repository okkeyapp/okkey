import { cn } from "@okkey/ui";
import type { SVGProps } from "react";

/** Download-from-cloud mark for the self-host version button. */
export function SystemUpdateIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M12.6667 12C13.2855 12 13.879 11.7542 14.3166 11.3166C14.7542 10.879 15 10.2855 15 9.66665C15 9.04782 14.7542 8.45432 14.3166 8.01674C13.879 7.57915 13.2855 7.33332 12.6667 7.33332H12C12.0973 6.89996 12.0988 6.4536 12.0044 6.01972C11.91 5.58584 11.7215 5.17295 11.4498 4.80461C11.1781 4.43627 10.8285 4.1197 10.4209 3.87297C10.0132 3.62625 9.55559 3.4542 9.07407 3.36665C8.59256 3.27911 8.0966 3.27777 7.61452 3.36273C7.13243 3.44769 6.67366 3.61727 6.26439 3.8618C5.43784 4.35564 4.86312 5.12477 4.66667 5.99999C3.95597 5.97152 3.25703 6.18026 2.68951 6.59045C2.122 7.00065 1.72122 7.5868 1.55578 8.24854C1.39035 8.91027 1.47055 9.60644 1.78267 10.2178C2.09478 10.8292 2.61939 11.3178 3.26667 11.6"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 8.66666V14.6667"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 12.6667L8 14.6667L10 12.6667"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
