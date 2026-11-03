import type { SVGProps } from "react";

/**
 * Monitor + gear (16×16). Stroke uses currentColor — never hard-coded black.
 * Shared by SettingsPopup menu and sidebar account dropdown.
 */
export function DeviceSettingsIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
      overflow="visible"
      className={className}
    >
      <path
        d="M8 11.3333H2.66667C2.48986 11.3333 2.32029 11.2631 2.19526 11.1381C2.07024 11.013 2 10.8435 2 10.6667V2.66667C2 2.48986 2.07024 2.32029 2.19526 2.19526C2.32029 2.07024 2.48986 2 2.66667 2H13.3333C13.5101 2 13.6797 2.07024 13.8047 2.19526C13.9298 2.32029 14 2.48986 14 2.66667V8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 8.6665H10.6667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.33337 14H8.00004"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.66671 11.3335L6.33337 14.0002"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.334 12.6668C11.334 13.0205 11.4745 13.3596 11.7245 13.6096C11.9746 13.8597 12.3137 14.0002 12.6673 14.0002C13.0209 14.0002 13.3601 13.8597 13.6101 13.6096C13.8602 13.3596 14.0007 13.0205 14.0007 12.6668C14.0007 12.3132 13.8602 11.9741 13.6101 11.724C13.3601 11.474 13.0209 11.3335 12.6673 11.3335C12.3137 11.3335 11.9746 11.474 11.7245 11.724C11.4745 11.9741 11.334 12.3132 11.334 12.6668Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.6674 10.3335V11.3335"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.6674 14V15"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.688 11.5L13.822 12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.5133 13.3335L10.6466 13.8335"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.6466 11.5L11.5133 12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.822 13.3335L14.6887 13.8335"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
