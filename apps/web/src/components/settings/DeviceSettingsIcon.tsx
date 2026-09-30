import type { SVGProps } from "react";

/**
 * Monitor + gear (16×16). Stroke uses currentColor — never hard-coded black.
 * Shared by SettingsPopup menu and sidebar account dropdown.
 */
export default function DeviceSettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
    >
      <path
        d="M1.5 2.83333C1.5 2.55619 1.72486 2.33333 2.002 2.33333H9.66467C9.94181 2.33333 10.1667 2.55619 10.1667 2.83333V8.16667C10.1667 8.44381 9.94181 8.66667 9.66467 8.66667H6.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 12.6667H7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 8.66667V12.6667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 9.16667V9.5M12.5 14.5V14.8333M10.1667 12V12M14.8333 12V12M10.8452 10.3452L11.0833 10.5833M13.9167 13.4167L14.1548 13.6548M14.1548 10.3452L13.9167 10.5833M11.0833 13.4167L10.8452 13.6548"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12.5" cy="12" r="1.5" stroke="currentColor" />
    </svg>
  );
}
