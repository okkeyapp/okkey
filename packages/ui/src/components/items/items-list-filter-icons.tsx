import type { ReactNode, SVGProps } from "react";

import { cn } from "../../lib/utils.js";

export type ItemsListSortValue = "name_asc" | "name_desc" | "date_asc" | "date_desc";

export function FilterIconAllRecords({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0 text-[#22C55E]", className)} {...props}>
      <path
        d="M2.50001 3.83334C2.50001 3.47972 2.64048 3.14058 2.89053 2.89054C3.14058 2.64049 3.47972 2.50001 3.83334 2.50001L12.1667 2.49999C12.5203 2.49999 12.8594 2.64047 13.1095 2.89052C13.3595 3.14056 13.5 3.4797 13.5 3.83333V5.16666C13.5 5.52028 13.3595 5.85942 13.1095 6.10947C12.8594 6.35952 12.5203 6.49999 12.1667 6.49999L3.83334 6.50001C3.47972 6.50001 3.14058 6.35954 2.89053 6.10949C2.64048 5.85944 2.50001 5.5203 2.50001 5.16668V3.83334Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.37801 10.8333C2.37801 10.4797 2.51848 10.1406 2.76853 9.89052C3.01858 9.64048 3.35772 9.5 3.71134 9.5L12.1667 9.5C12.5203 9.5 12.8594 9.64048 13.1095 9.89052C13.3595 10.1406 13.5 10.4797 13.5 10.8333V12.1667C13.5 12.5203 13.3595 12.8594 13.1095 13.1095C12.8594 13.3595 12.5203 13.5 12.1667 13.5H3.71134C3.35772 13.5 3.01858 13.3595 2.76853 13.1095C2.51848 12.8594 2.37801 12.5203 2.37801 12.1667V10.8333Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Same glyph as sidebar «Monitoring» nav item (`NavMonitoringIcon` in okkey-app-sidebar). */
export function FilterIconMonitoring({ className, ...props }: SVGProps<SVGSVGElement>) {
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
        d="M13.526 10.336C13.1443 11.2389 12.5473 12.0345 11.7871 12.6533C11.027 13.2721 10.1269 13.6952 9.16553 13.8856C8.20415 14.0761 7.21077 14.0281 6.27223 13.7458C5.33368 13.4635 4.47856 12.9556 3.78161 12.2664C3.08466 11.5772 2.56712 10.7277 2.27422 9.79221C1.98132 8.85671 1.92198 7.86369 2.1014 6.89995C2.28082 5.93622 2.69352 5.03112 3.30344 4.26378C3.91335 3.49645 4.70191 2.89024 5.60015 2.49816M14 8.00138C14 7.21327 13.8448 6.43287 13.5433 5.70475C13.2418 4.97663 12.7998 4.31504 12.2427 3.75776C11.6855 3.20048 11.0241 2.75843 10.2962 2.45683C9.56826 2.15523 8.78806 2 8.00015 2V8.00138H14Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FilterIconFavorites({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0 text-[#F97316]", className)} {...props}>
      <path
        d="M8.00004 1.3335L10.06 5.50683L14.6667 6.18016L11.3334 9.42683L12.12 14.0135L8.00004 11.8468L3.88004 14.0135L4.66671 9.42683L1.33337 6.18016L5.94004 5.50683L8.00004 1.3335Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FilterIconArchived({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0 text-muted-foreground", className)} {...props}>
      <path
        d="M2.5 5.50011V12.1668C2.5 12.5204 2.6295 12.8595 2.86002 13.1096C3.09053 13.3596 3.40318 13.5001 3.72917 13.5001H11.2708C12.5968 13.5001 12.9095 13.3596 13.14 13.1096C13.3705 12.8595 13.5 12.5204 13.5 12.1668V5.50011M6.49996 8.50011H9.49996M2.16667 2.0001L13.8333 2.00002C14.2015 2.00002 14.5 2.29849 14.5 2.66668V4.66668C14.5 5.03487 14.2015 5.50002 13.8333 5.50002L8 5.50011L2.16667 5.5001C1.79848 5.5001 1.5 5.03496 1.5 4.66677V2.66677C1.5 2.29858 1.79848 2.0001 2.16667 2.0001Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchGlyph({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0 text-foreground", className)} {...props}>
      <path
        d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 14L11.1 11.1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FilterIconDeleted({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0 text-[#EF4444]", className)} {...props}>
      <path
        d="M2 4.00016H14M12.6667 4.00016V13.3335C12.6667 14.0002 12 14.6668 11.3333 14.6668H4.66667C4 14.6668 3.33333 14.0002 3.33333 13.3335V4.00016M5.33333 4.00016V2.66683C5.33333 2.00016 6 1.3335 6.66667 1.3335H9.33333C10 1.3335 10.6667 2.00016 10.6667 2.66683V4.00016M6.66667 7.3335V11.3335M9.33333 7.3335V11.3335"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FolderClosedGlyph({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0 text-foreground", className)} {...props}>
      <path
        d="M1.5 6.5H14.5M13.1667 13.5C13.5203 13.5 13.8594 13.3595 14.1095 13.1095C14.3595 12.8594 14.5 12.5203 14.5 12.1667V5.83333C14.5 5.47971 14.3595 5.14057 14.1095 4.89052C13.8594 4.64048 13.5203 4.5 13.1667 4.5H8.06671C7.84372 4.50219 7.62374 4.44841 7.42691 4.34359C7.23008 4.23877 7.06268 4.08625 6.94004 3.9L6.40004 3.1C6.27863 2.91565 6.11336 2.76432 5.91904 2.6596C5.72472 2.55488 5.50745 2.50004 5.28671 2.5H2.83333C2.47971 2.5 2.14057 2.64048 1.89052 2.89052C1.64048 3.14057 1.5 3.47971 1.5 3.83333V12.1667C1.5 12.5203 1.64048 12.8594 1.89052 13.1095C2.14057 13.3595 2.47971 13.5 2.83333 13.5H13.1667Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronDownGlyph({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0 opacity-60", className)} {...props}>
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FilterIconFrame({
  children,
  wide,
  flush,
}: {
  children: ReactNode;
  wide?: boolean;
  /** No inner padding — for 24px category badge that fills the frame. */
  flush?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[4px] bg-white dark:bg-background",
        flush ? "p-0" : "p-1",
        wide ? "h-[24px] w-[49px]" : "h-[24px] w-[24px]",
      )}
    >
      {children}
    </span>
  );
}

/** Newest first — `date_desc` */
export function SortIconNewestFirst({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path d="M2.66663 10L4.66663 12L6.66663 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.66663 4V12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M11.3333 9.3335C11.687 9.3335 12.0261 9.47397 12.2761 9.72402C12.5262 9.97407 12.6667 10.3132 12.6667 10.6668V12.6668C12.6667 13.0205 12.5262 13.3596 12.2761 13.6096C12.0261 13.8597 11.687 14.0002 11.3333 14.0002C10.9797 14.0002 10.6406 13.8597 10.3905 13.6096C10.1405 13.3596 10 13.0205 10 12.6668V10.6668C10 10.3132 10.1405 9.97407 10.3905 9.72402C10.6406 9.47397 10.9797 9.3335 11.3333 9.3335Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 3.33333C10 3.68696 10.1405 4.02609 10.3905 4.27614C10.6406 4.52619 10.9797 4.66667 11.3333 4.66667C11.687 4.66667 12.0261 4.52619 12.2761 4.27614C12.5262 4.02609 12.6667 3.68696 12.6667 3.33333C12.6667 2.97971 12.5262 2.64057 12.2761 2.39052C12.0261 2.14048 11.687 2 11.3333 2C10.9797 2 10.6406 2.14048 10.3905 2.39052C10.1405 2.64057 10 2.97971 10 3.33333Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.6667 3.3335V5.3335C12.6667 5.68712 12.5262 6.02626 12.2762 6.2763C12.0261 6.52635 11.687 6.66683 11.3334 6.66683H10.3334"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Oldest first — `date_asc` */
export function SortIconOldestFirst({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path d="M2.66663 10L4.66663 12L6.66663 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.66663 4V12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M11.3333 2C11.687 2 12.0261 2.14048 12.2761 2.39052C12.5262 2.64057 12.6667 2.97971 12.6667 3.33333V5.33333C12.6667 5.68696 12.5262 6.02609 12.2761 6.27614C12.0261 6.52619 11.687 6.66667 11.3333 6.66667C10.9797 6.66667 10.6406 6.52619 10.3905 6.27614C10.1405 6.02609 10 5.68696 10 5.33333V3.33333C10 2.97971 10.1405 2.64057 10.3905 2.39052C10.6406 2.14048 10.9797 2 11.3333 2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 10.6668C10 11.0205 10.1405 11.3596 10.3905 11.6096C10.6406 11.8597 10.9797 12.0002 11.3333 12.0002C11.687 12.0002 12.0261 11.8597 12.2761 11.6096C12.5262 11.3596 12.6667 11.0205 12.6667 10.6668C12.6667 10.3132 12.5262 9.97407 12.2761 9.72402C12.0261 9.47397 11.687 9.3335 11.3333 9.3335C10.9797 9.3335 10.6406 9.47397 10.3905 9.72402C10.1405 9.97407 10 10.3132 10 10.6668Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.6667 10.6665V12.6665C12.6667 13.0201 12.5262 13.3593 12.2762 13.6093C12.0261 13.8594 11.687 13.9998 11.3334 13.9998H10.3334"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Alphabet A→Z — `name_asc` */
export function SortIconAlphaAsc({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path
        d="M10 6.66667V3.33333C10 2.41333 10.4133 2 11.3333 2C12.2533 2 12.6667 2.41333 12.6667 3.33333V6.66667M12.6667 4.66667H10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.6667 14.0002H10L12.6667 9.3335H10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.66663 10L4.66663 12L6.66663 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.66663 4V12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Alphabet Z→A — `name_desc` */
export function SortIconAlphaDesc({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path
        d="M10 14.0002V10.6668C10 9.74683 10.4133 9.3335 11.3333 9.3335C12.2533 9.3335 12.6667 9.74683 12.6667 10.6668V14.0002M12.6667 12.0002H10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.6667 6.66667H10L12.6667 2H10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.66663 10L4.66663 12L6.66663 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.66663 4V12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function sortIconForValue(value: ItemsListSortValue, className?: string) {
  const common = { className: cn("text-foreground", className) };
  switch (value) {
    case "date_desc":
      return <SortIconNewestFirst {...common} />;
    case "date_asc":
      return <SortIconOldestFirst {...common} />;
    case "name_asc":
      return <SortIconAlphaAsc {...common} />;
    case "name_desc":
      return <SortIconAlphaDesc {...common} />;
    default: {
      const _ex: never = value;
      return _ex;
    }
  }
}
