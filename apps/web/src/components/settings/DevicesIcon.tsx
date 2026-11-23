import type { SVGProps } from "react";

/** Same glyph as settings menu “My devices”. */
export function DevicesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M8.5 6.16667C8.5 5.98986 8.57902 5.82029 8.71967 5.69526C8.86032 5.57024 9.05109 5.5 9.25 5.5H13.75C13.9489 5.5 14.1397 5.57024 14.2803 5.69526C14.421 5.82029 14.5 5.98986 14.5 6.16667V12.8333C14.5 13.0101 14.421 13.1797 14.2803 13.3047C14.1397 13.4298 13.9489 13.5 13.75 13.5H9.25C9.05109 13.5 8.86032 13.4298 8.71967 13.3047C8.57902 13.1797 8.5 13.0101 8.5 12.8333V6.16667Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 5.33334V3.16667C11.5 2.98986 11.4298 2.82029 11.3047 2.69526C11.1797 2.57024 11.0101 2.5 10.8333 2.5L3.16667 2.5C2.98986 2.5 2.82029 2.57024 2.69526 2.69526C2.57024 2.82029 2.5 2.98986 2.5 3.16667V11.8333C2.5 12.0101 2.57024 12.1797 2.69526 12.3047C2.82029 12.4298 2.98986 12.5 3.16667 12.5L8 12.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.5 6H12.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 3H8.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
