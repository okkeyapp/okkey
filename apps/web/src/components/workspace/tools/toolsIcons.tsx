import type { SVGProps } from "react";

function iconProps(className?: string) {
  return { className: className ?? "size-4 shrink-0", "aria-hidden": true as const };
}

export function GeneratorIcon(props: SVGProps<SVGSVGElement>) {
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

export function ImportIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...iconProps(props.className)} {...props}>
      <path
        d="M5.26644 5.26668L7.06644 7.06668M8.93311 7.06668L10.7331 5.26668M5.26644 10.7333L7.06644 8.93335M8.93311 8.93335L9.73311 9.73335M5.33317 5.00008C5.33317 5.18418 5.18393 5.33341 4.99984 5.33341C4.81574 5.33341 4.6665 5.18418 4.6665 5.00008C4.6665 4.81599 4.81574 4.66675 4.99984 4.66675C5.18393 4.66675 5.33317 4.81599 5.33317 5.00008ZM11.3332 5.00008C11.3332 5.18418 11.1839 5.33341 10.9998 5.33341C10.8157 5.33341 10.6665 5.18418 10.6665 5.00008C10.6665 4.81599 10.8157 4.66675 10.9998 4.66675C11.1839 4.66675 11.3332 4.81599 11.3332 5.00008ZM5.33317 11.0001C5.33317 11.1842 5.18393 11.3334 4.99984 11.3334C4.81574 11.3334 4.6665 11.1842 4.6665 11.0001C4.6665 10.816 4.81574 10.6667 4.99984 10.6667C5.18393 10.6667 5.33317 10.816 5.33317 11.0001ZM9.33317 8.00008C9.33317 8.73646 8.73622 9.33342 7.99984 9.33342C7.26346 9.33342 6.6665 8.73646 6.6665 8.00008C6.6665 7.2637 7.26346 6.66675 7.99984 6.66675C8.73622 6.66675 9.33317 7.2637 9.33317 8.00008Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 14H3.33333C2.59695 14 2 13.403 2 12.6667V3.33333C2 2.59695 2.59695 2 3.33333 2H12.6667C13.403 2 14 2.59695 14 3.33333V8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.5 15V11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 13L13.5 11L11.5 13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ExportIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...iconProps(props.className)} {...props}>
      <path
        d="M8.29621 13.9173C8.19821 13.9467 8.09955 13.974 8.00021 14C6.96236 13.7308 5.9892 13.2557 5.13858 12.603C4.28795 11.9503 3.57722 11.1332 3.04861 10.2004C2.52 9.26751 2.1843 8.23793 2.06147 7.17279C1.93863 6.10764 2.03115 5.02868 2.33355 4C4.41057 4.09504 6.44299 3.37772 8.00021 2C9.55744 3.37772 11.5899 4.09504 13.6669 4C14.0718 5.37704 14.0987 6.83764 13.7449 8.22867"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.6665 12.6667L14.6665 12.6667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.6665 10.6667L14.6665 12.6667L12.6665 14.6667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 3V13.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
