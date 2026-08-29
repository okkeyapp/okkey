import type { SVGProps } from "react";

function iconProps(className?: string) {
  return { className: className ?? "size-4 shrink-0", "aria-hidden": true as const };
}

export function GeneratorPasswordTabIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...iconProps(props.className)} {...props}>
      <path
        d="M3.3335 8.66659C3.3335 8.31296 3.47397 7.97382 3.72402 7.72378C3.97407 7.47373 4.31321 7.33325 4.66683 7.33325H11.3335C11.6871 7.33325 12.0263 7.47373 12.2763 7.72378C12.5264 7.97382 12.6668 8.31296 12.6668 8.66659V12.6666C12.6668 13.0202 12.5264 13.3593 12.2763 13.6094C12.0263 13.8594 11.6871 13.9999 11.3335 13.9999H4.66683C4.31321 13.9999 3.97407 13.8594 3.72402 13.6094C3.47397 13.3593 3.3335 13.0202 3.3335 12.6666V8.66659Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.3335 7.33333V4.66667C5.3335 3.95942 5.61445 3.28115 6.11454 2.78105C6.61464 2.28095 7.29292 2 8.00016 2C8.70741 2 9.38568 2.28095 9.88578 2.78105C10.3859 3.28115 10.6668 3.95942 10.6668 4.66667V7.33333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 10.6667H10.0067" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.00684 10.6667H8.0135" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.01318 10.6667H6.01985" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GeneratorPassphraseTabIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...iconProps(props.className)} {...props}>
      <path d="M8 11.3333V13.9999" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.6665 13.3333L9.33317 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.6665 12L9.33317 13.3333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.3335 11.3333V13.9999" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 13.3333L4.66667 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12L4.66667 13.3333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.6665 11.3333V13.9999" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.3335 13.3333L14.0002 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.3335 12L14.0002 13.3333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6 4C6 4.53043 6.21071 5.03914 6.58579 5.41421C6.96086 5.78929 7.46957 6 8 6C8.53043 6 9.03914 5.78929 9.41421 5.41421C9.78929 5.03914 10 4.53043 10 4C10 3.46957 9.78929 2.96086 9.41421 2.58579C9.03914 2.21071 8.53043 2 8 2C7.46957 2 6.96086 2.21071 6.58579 2.58579C6.21071 2.96086 6 3.46957 6 4Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.6665 9.33333C4.6665 8.97971 4.80698 8.64057 5.05703 8.39052C5.30708 8.14048 5.64622 8 5.99984 8H9.99984C10.3535 8 10.6926 8.14048 10.9426 8.39052C11.1927 8.64057 11.3332 8.97971 11.3332 9.33333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GeneratorUsernameTabIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...iconProps(props.className)} {...props}>
      <path
        d="M12.0002 13.3333C12.0002 12.2724 11.5787 11.255 10.8286 10.5048C10.0784 9.75468 9.06103 9.33325 8.00016 9.33325M8.00016 9.33325C6.9393 9.33325 5.92188 9.75468 5.17174 10.5048C4.42159 11.255 4.00016 12.2724 4.00016 13.3333M8.00016 9.33325C9.47292 9.33325 10.6668 8.13934 10.6668 6.66658C10.6668 5.19383 9.47292 3.99992 8.00016 3.99992C6.5274 3.99992 5.3335 5.19383 5.3335 6.66658C5.3335 8.13934 6.5274 9.33325 8.00016 9.33325ZM14.6668 7.99992C14.6668 11.6818 11.6821 14.6666 8.00016 14.6666C4.31826 14.6666 1.3335 11.6818 1.3335 7.99992C1.3335 4.31802 4.31826 1.33325 8.00016 1.33325C11.6821 1.33325 14.6668 4.31802 14.6668 7.99992Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GeneratorRefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...iconProps(props.className ?? "size-6 shrink-0")} {...props}>
      <path
        d="M21 12C21 9.61305 20.0518 7.32387 18.364 5.63604C16.6761 3.94821 14.3869 3 12 3C9.48395 3.00947 7.06897 3.99122 5.26 5.74L3 8M8 8H3V3M3 12C3 14.3869 3.94821 16.6761 5.63604 18.364C7.32387 20.0518 9.61305 21 12 21C14.516 20.9905 16.931 20.0088 18.74 18.26L21 16M21 21V16H16"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GeneratorExternalLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...iconProps(props.className ?? "size-3 shrink-0")} {...props}>
      <path
        d="M14 6V2H10M14 2L6.66667 9.33333M12 8.66667V12.6667C12 13.0203 11.8595 13.3594 11.6095 13.6095C11.3594 13.8595 11.0203 14 10.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V5.33333C2 4.97971 2.14048 4.64057 2.39052 4.39052C2.64057 4.14048 2.97971 4 3.33333 4H7.33333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
