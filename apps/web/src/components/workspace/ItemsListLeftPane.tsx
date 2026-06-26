import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Favicon,
  ScrollArea,
  SidebarGroupLabel,
  Spinner,
  type OkkeySidebarFolderTreeNode,
} from "@okkey/ui";
import type { WebLocale } from "@okkey/i18n";
import { useEffect, useMemo, useState, type ReactNode, type SVGProps } from "react";
import { useSearchParams } from "react-router-dom";

import { useLocale } from "../../locale/LocaleContext";
import {
  FILTER_QUERY_ARCHIVED,
  FILTER_QUERY_DELETED,
  FILTER_QUERY_FAVOURITES,
  FILTER_QUERY_PARAM,
  FOLDER_QUERY_PARAM,
  ITEM_QUERY_PARAM,
  SEARCH_QUERY_PARAM,
  SORT_QUERY_ALPH_ASC,
  SORT_QUERY_ALPH_DESC,
  SORT_QUERY_DATE_ASC,
  SORT_QUERY_DATE_DESC,
  SORT_QUERY_PARAM,
  VAULT_QUERY_PARAM,
} from "../../routes/paths";

import itemsListDemoWire from "./itemsListLeftPane.demo.json";

const itemsPanelSelectTriggerClassName = cn(
  "h-9 min-h-9 rounded-lg border-0 bg-slate-100 shadow-none dark:bg-muted",
  "px-2 text-sm text-foreground",
  "hover:bg-slate-200/90 dark:hover:bg-muted/80",
  "focus:border-transparent focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)] focus-visible:border-transparent",
  "data-[state=open]:border-transparent data-[state=open]:bg-slate-200/90 dark:data-[state=open]:bg-muted/90",
  "data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)]",
);

export type ItemsListRecordWire = {
  id: string;
  vaultSlot?: number;
  folderId?: string | null;
  urls: string[];
  title: string;
  login: string;
  date: string;
  favorite?: boolean;
  archived?: boolean;
  deleted?: boolean;
};

export type ItemsListRecord = {
  id: string;
  vaultSlot: number;
  folderId: string | null;
  urls: string[];
  title: string;
  login: string;
  date: Date;
  favorite: boolean;
  archived: boolean;
  deleted: boolean;
};

const ITEMS_LIST_DEMO: readonly ItemsListRecord[] = (itemsListDemoWire as readonly ItemsListRecordWire[]).map(
  (row) => ({
    id: row.id,
    vaultSlot: row.vaultSlot ?? 0,
    folderId: row.folderId ?? null,
    urls: row.urls ?? [],
    title: row.title,
    login: row.login,
    date: new Date(row.date),
    favorite: Boolean(row.favorite),
    archived: Boolean(row.archived),
    deleted: Boolean(row.deleted),
  }),
);

function findFolderLabelInTree(nodes: readonly OkkeySidebarFolderTreeNode[], id: string): string {
  for (const n of nodes) {
    if (n.id === id) {
      return n.label;
    }
    if (n.children?.length) {
      const nested = findFolderLabelInTree(n.children, id);
      if (nested) {
        return nested;
      }
    }
  }
  return "";
}

function filterRowsByVault(
  rows: readonly ItemsListRecord[],
  vaults: readonly { id: string }[],
  vaultId: string,
): ItemsListRecord[] {
  if (!vaultId) {
    return [...rows];
  }
  const idx = vaults.findIndex((v) => v.id === vaultId);
  if (idx < 0) {
    return [...rows];
  }
  const mod = Math.max(vaults.length, 1);
  return rows.filter((r) => r.vaultSlot % mod === idx);
}

function filterRowsByFolder(rows: readonly ItemsListRecord[], folderId: string): ItemsListRecord[] {
  if (!folderId) {
    return [...rows];
  }
  return rows.filter((r) => r.folderId === folderId);
}

/** «Все записи» */
function FilterIconAllRecords({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0 text-[#22C55E]", className)} {...props}>
      <path
        d="M2 4.33333C2 4.63975 2.06035 4.94317 2.17761 5.22626C2.29488 5.50935 2.46675 5.76658 2.68342 5.98325C2.90009 6.19992 3.15731 6.37179 3.44041 6.48905C3.7235 6.60631 4.02692 6.66667 4.33333 6.66667C4.63975 6.66667 4.94317 6.60631 5.22626 6.48905C5.50935 6.37179 5.76658 6.19992 5.98325 5.98325C6.19992 5.76658 6.37179 5.50935 6.48905 5.22626C6.60631 4.94317 6.66667 4.63975 6.66667 4.33333C6.66667 4.02692 6.60631 3.7235 6.48905 3.44041C6.37179 3.15731 6.19992 2.90009 5.98325 2.68342C5.76658 2.46675 5.50935 2.29488 5.22626 2.17761C4.94317 2.06035 4.63975 2 4.33333 2C4.02692 2 3.7235 2.06035 3.44041 2.17761C3.15731 2.29488 2.90009 2.46675 2.68342 2.68342C2.46675 2.90009 2.29488 3.15731 2.17761 3.44041C2.06035 3.7235 2 4.02692 2 4.33333Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M1.66663 14.0002H6.99996L4.33329 9.3335L1.66663 14.0002Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.33337 2L14 6.66667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.33337 6.66667L14 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.33337 9.3335H14V14.0002H9.33337V9.3335Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FilterIconFavorites({ className, ...props }: SVGProps<SVGSVGElement>) {
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

function FilterIconArchived({ className, ...props }: SVGProps<SVGSVGElement>) {
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

function SearchGlyph({ className, ...props }: SVGProps<SVGSVGElement>) {
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

function FilterIconDeleted({ className, ...props }: SVGProps<SVGSVGElement>) {
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

function FolderClosedGlyph({ className, ...props }: SVGProps<SVGSVGElement>) {
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

function ChevronDownGlyph({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0 opacity-60", className)} {...props}>
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FilterIconFrame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[4px] bg-white p-1 dark:bg-muted",
        /** 4px padding on all sides; wide inner row: 16 + 4 + 1 + 4 + 16 → 4 + 41 + 4 = 49px wide, 4 + 16 + 4 = 24px tall. */
        wide ? "h-[24px] w-[49px]" : "h-[24px] w-[24px]",
      )}
    >
      {children}
    </span>
  );
}

/** Сначала новые — `date_desc` */
function SortIconNewestFirst({ className, ...props }: SVGProps<SVGSVGElement>) {
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

/** Сначала старые — `date_asc` */
function SortIconOldestFirst({ className, ...props }: SVGProps<SVGSVGElement>) {
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

/** Алфавит — `name_asc` */
function SortIconAlphaAsc({ className, ...props }: SVGProps<SVGSVGElement>) {
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

/** Обратный алфавит — `name_desc` */
function SortIconAlphaDesc({ className, ...props }: SVGProps<SVGSVGElement>) {
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

function sortIconForValue(value: ItemsListSort, className?: string) {
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

function MoreVerticalIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4", className)} {...props}>
      <circle cx="8" cy="3" r="1.25" fill="currentColor" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" />
      <circle cx="8" cy="13" r="1.25" fill="currentColor" />
    </svg>
  );
}

function IconActions16({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path
        d="M7.99992 8.66675C8.36811 8.66675 8.66659 8.36827 8.66659 8.00008C8.66659 7.63189 8.36811 7.33341 7.99992 7.33341C7.63173 7.33341 7.33325 7.63189 7.33325 8.00008C7.33325 8.36827 7.63173 8.66675 7.99992 8.66675Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.99992 4.00008C8.36811 4.00008 8.66659 3.7016 8.66659 3.33341C8.66659 2.96522 8.36811 2.66675 7.99992 2.66675C7.63173 2.66675 7.33325 2.96522 7.33325 3.33341C7.33325 3.7016 7.63173 4.00008 7.99992 4.00008Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.99992 13.3334C8.36811 13.3334 8.66659 13.0349 8.66659 12.6667C8.66659 12.2986 8.36811 12.0001 7.99992 12.0001C7.63173 12.0001 7.33325 12.2986 7.33325 12.6667C7.33325 13.0349 7.63173 13.3334 7.99992 13.3334Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconEdit16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M9.99992 3.33333L12.6666 6M14.1159 4.54126C14.4683 4.18888 14.6664 3.71091 14.6665 3.2125C14.6665 2.71409 14.4686 2.23607 14.1162 1.8836C13.7638 1.53112 13.2859 1.33307 12.7874 1.33301C12.289 1.33295 11.811 1.53088 11.4585 1.88326L2.56121 10.7826C2.40642 10.9369 2.29195 11.127 2.22787 11.3359L1.34721 14.2373C1.32998 14.2949 1.32868 14.3562 1.34344 14.4145C1.35821 14.4728 1.38849 14.5261 1.43107 14.5686C1.47366 14.6111 1.52696 14.6413 1.58531 14.656C1.64367 14.6707 1.70491 14.6693 1.76254 14.6519L4.66454 13.7719C4.87332 13.7084 5.06332 13.5947 5.21787 13.4406L14.1159 4.54126Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSelect16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M14.6673 7.38723V8.00056C14.6665 9.43818 14.201 10.837 13.3402 11.9884C12.4794 13.1399 11.2695 13.9822 9.89089 14.3898C8.51227 14.7974 7.03882 14.7485 5.6903 14.2503C4.34177 13.7521 3.19042 12.8313 2.40796 11.6253C1.6255 10.4193 1.25385 8.9926 1.34844 7.5581C1.44303 6.1236 1.99879 4.75811 2.93284 3.66528C3.86689 2.57244 5.12917 1.81082 6.53144 1.49399C7.93371 1.17717 9.40083 1.32212 10.714 1.90723M6.00065 7.33382L8.00065 9.33382L14.6673 2.66715"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUnfavorite16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path d="M2 2L14 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6.67468 4.01047L7.99535 1.33447L10.0527 5.50314L14.6527 6.16981L11.7053 9.03914M11.7133 11.7125L12.1053 13.9965L8.00001 11.8331L3.88535 13.9965L4.67135 9.41447L1.33801 6.16981L5.55601 5.55847"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUnarchive16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M5.33327 2.6665H12.6666C13.0202 2.6665 13.3594 2.80698 13.6094 3.05703C13.8595 3.30708 13.9999 3.64622 13.9999 3.99984C13.9999 4.35346 13.8595 4.6926 13.6094 4.94265C13.3594 5.19269 13.0202 5.33317 12.6666 5.33317H7.99994M5.33327 5.33317H3.33327C3.02844 5.33335 2.73274 5.22907 2.49546 5.03771C2.25818 4.84634 2.09363 4.57945 2.02923 4.28149C1.96484 3.98353 2.00449 3.67251 2.14157 3.40024C2.27866 3.12796 2.5049 2.91089 2.78261 2.78517"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.33337 5.3335V12.0002C3.33337 12.3538 3.47385 12.6929 3.7239 12.943C3.97395 13.193 4.31309 13.3335 4.66671 13.3335H11.3334C11.5903 13.3335 11.8418 13.2592 12.0575 13.1197C12.2732 12.9801 12.444 12.7812 12.5494 12.5468M12.6667 10.0002V5.3335"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6.66663 8H7.99996" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 2L14 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDelete16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M2 3.99992H14M12.6667 3.99992V13.3333C12.6667 13.9999 12 14.6666 11.3333 14.6666H4.66667C4 14.6666 3.33333 13.9999 3.33333 13.3333V3.99992M5.33333 3.99992V2.66659C5.33333 1.99992 6 1.33325 6.66667 1.33325H9.33333C10 1.33325 10.6667 1.99992 10.6667 2.66659V3.99992M6.66667 7.33325V11.3333M9.33333 7.33325V11.3333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRestore16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path d="M2 2L14 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.66663 4.6665H4.66663M7.33329 4.6665H13.3333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.66663 7.3335V11.3335" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.33337 9.3335V11.3335" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M3.33337 4.6665L4.00004 12.6665C4.00004 13.0201 4.14052 13.3593 4.39056 13.6093C4.64061 13.8594 4.97975 13.9998 5.33337 13.9998H10.6667C11.0203 13.9998 11.3595 13.8594 11.6095 13.6093C11.8596 13.3593 12 13.0201 12 12.6665L12.0514 12.0512"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.256 9.58184L12.6666 4.6665" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6 3.33333V2.66667C6 2.48986 6.07024 2.32029 6.19526 2.19526C6.32029 2.07024 6.48986 2 6.66667 2H9.33333C9.51014 2 9.67971 2.07024 9.80474 2.19526C9.92976 2.32029 10 2.48986 10 2.66667V4.66667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheck16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-3.5 shrink-0", className)}>
      <path d="M13.3327 4L5.99935 11.3333L2.66602 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClose16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4", className)}>
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export type ItemsListFilter = "all" | "favorites" | "archived" | "recently_deleted";
export type ItemsListSort = "name_asc" | "name_desc" | "date_asc" | "date_desc";

function filterIconForValue(value: ItemsListFilter, className?: string) {
  const c = cn("shrink-0", className);
  switch (value) {
    case "all":
      return <FilterIconAllRecords className={c} />;
    case "favorites":
      return <FilterIconFavorites className={c} />;
    case "archived":
      return <FilterIconArchived className={c} />;
    case "recently_deleted":
      return <FilterIconDeleted className={c} />;
    default: {
      const _ex: never = value;
      return _ex;
    }
  }
}

/** Compact filter glyph for the filter dropdown trigger when a vault/folder/search scope is active. */
function filterSecondaryGlyph(filter: ItemsListFilter): ReactNode {
  const c = "size-4 shrink-0";
  switch (filter) {
    case "favorites":
      return <FilterIconFavorites className={c} />;
    case "archived":
      return <FilterIconArchived className={c} />;
    case "recently_deleted":
      return <FilterIconDeleted className={c} />;
    case "all":
      return null;
    default: {
      const _ex: never = filter;
      return _ex;
    }
  }
}

function scopeRowCloseAriaLabel(locale: WebLocale): string {
  return locale === "ru" ? "Сбросить область списка" : "Clear list scope";
}

function ScopeRowCloseButton({ locale, onClear }: { locale: WebLocale; onClear: () => void }) {
  return (
    <button
      type="button"
      aria-label={scopeRowCloseAriaLabel(locale)}
      className="absolute right-1.5 top-1/2 z-10 flex size-4 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClear();
      }}
    >
      <svg viewBox="0 0 16 16" fill="none" className="size-2.5" aria-hidden>
        <path d="M5 5L11 11M11 5L5 11" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function filterFromSearchParam(raw: string): ItemsListFilter {
  const x = raw.trim().toLowerCase();
  if (x === FILTER_QUERY_FAVOURITES || x === "favorites") {
    return "favorites";
  }
  if (x === FILTER_QUERY_ARCHIVED) {
    return "archived";
  }
  if (x === FILTER_QUERY_DELETED || x === "deleted") {
    return "recently_deleted";
  }
  return "all";
}

function filterToSearchParam(filter: ItemsListFilter): string | null {
  switch (filter) {
    case "all":
      return null;
    case "favorites":
      return FILTER_QUERY_FAVOURITES;
    case "archived":
      return FILTER_QUERY_ARCHIVED;
    case "recently_deleted":
      return FILTER_QUERY_DELETED;
    default: {
      const _ex: never = filter;
      return _ex;
    }
  }
}

function sortFromSearchParam(raw: string): ItemsListSort {
  const x = raw.trim().toLowerCase();
  if (x === SORT_QUERY_DATE_ASC || x === "date_asc") {
    return "date_asc";
  }
  if (x === SORT_QUERY_ALPH_ASC || x === "name_asc" || x === "alph_asc") {
    return "name_asc";
  }
  if (x === SORT_QUERY_ALPH_DESC || x === "name_desc" || x === "alph_desc") {
    return "name_desc";
  }
  if (x === SORT_QUERY_DATE_DESC || x === "date_desc") {
    return "date_desc";
  }
  return "date_desc";
}

function sortToSearchParam(sort: ItemsListSort): string | null {
  switch (sort) {
    case "date_desc":
      return null;
    case "date_asc":
      return SORT_QUERY_DATE_ASC;
    case "name_asc":
      return SORT_QUERY_ALPH_ASC;
    case "name_desc":
      return SORT_QUERY_ALPH_DESC;
    default: {
      const _ex: never = sort;
      return _ex;
    }
  }
}

function firstGrapheme(s: string): string {
  const t = s.trim();
  if (!t) {
    return "";
  }
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const first = [...seg.segment(t)][0];
    return first?.segment ?? "";
  }
  return [...t][0] ?? "";
}

function alphaGroupKeyAndLabel(title: string, locale: WebLocale): { key: string; label: string } {
  const g = firstGrapheme(title);
  if (!g) {
    return { key: "#", label: "#" };
  }
  if (!/\p{L}/u.test(g)) {
    return { key: "#", label: "#" };
  }
  const loc = locale === "ru" ? "ru" : "en";
  const label = g.toLocaleUpperCase(loc).normalize("NFC");
  return { key: label, label };
}

function compareAlphaSectionKeys(a: string, b: string, ascending: boolean): number {
  const rank = (x: string, y: string) => {
    if (x === "#") {
      return y === "#" ? 0 : -1;
    }
    if (y === "#") {
      return 1;
    }
    return x.localeCompare(y, "ru", { sensitivity: "base" });
  };
  const r = rank(a, b);
  return ascending ? r : -r;
}

function formatYearMonthHeading(locale: WebLocale, d: Date): string {
  const y = d.getFullYear();
  const month = new Intl.DateTimeFormat(locale === "ru" ? "ru" : "en-US", { month: "long" }).format(d);
  return locale === "ru" ? `${y} ${month}` : `${month} ${y}`;
}

function yearMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseYearMonthKey(key: string): Date {
  const [ys, ms] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  return new Date(Number.isFinite(y) && Number.isFinite(m) ? y : 1970, Number.isFinite(m) ? m - 1 : 0, 1);
}

function compareYearMonthKeys(a: string, b: string, ascending: boolean): number {
  const ta = parseYearMonthKey(a).getTime();
  const tb = parseYearMonthKey(b).getTime();
  const r = ta - tb;
  return ascending ? r : -r;
}

function sortItems(items: readonly ItemsListRecord[], sort: ItemsListSort): ItemsListRecord[] {
  const copy = [...items];
  copy.sort((a, b) => compareTwoItemsSort(a, b, sort));
  return copy;
}

function compareTwoItemsSort(a: ItemsListRecord, b: ItemsListRecord, sort: ItemsListSort): number {
  switch (sort) {
    case "name_asc":
      return a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
    case "name_desc":
      return b.title.localeCompare(a.title, "ru", { sensitivity: "base" });
    case "date_asc":
      return a.date.getTime() - b.date.getTime();
    case "date_desc":
      return b.date.getTime() - a.date.getTime();
    default: {
      const _ex: never = sort;
      return _ex;
    }
  }
}

/** Title weight 10; each URL index `i` contributes `10 / (i + 1)` if substring matches. */
function searchScore(row: ItemsListRecord, needle: string): number {
  const q = needle.trim().toLowerCase();
  if (!q) {
    return 0;
  }
  let s = 0;
  if (row.title.toLowerCase().includes(q)) {
    s += 10;
  }
  row.urls.forEach((url, i) => {
    if (url.toLowerCase().includes(q)) {
      s += 10 / (i + 1);
    }
  });
  return s;
}

function filterItems(items: readonly ItemsListRecord[], filter: ItemsListFilter): ItemsListRecord[] {
  switch (filter) {
    case "all":
      return items.filter((r) => !r.deleted && !r.archived);
    case "favorites":
      return items.filter((r) => !r.deleted && !r.archived && r.favorite);
    case "archived":
      return items.filter((r) => !r.deleted && r.archived);
    case "recently_deleted":
      return items.filter((r) => r.deleted);
    default: {
      const _ex: never = filter;
      return _ex;
    }
  }
}

type ListSection = { key: string; label: string; rows: ItemsListRecord[] };

function buildSections(sorted: readonly ItemsListRecord[], sort: ItemsListSort, locale: WebLocale): ListSection[] {
  const isDate = sort === "date_asc" || sort === "date_desc";
  if (isDate) {
    const map = new Map<string, ItemsListRecord[]>();
    for (const row of sorted) {
      const k = yearMonthKey(row.date);
      const prev = map.get(k);
      if (prev) {
        prev.push(row);
      } else {
        map.set(k, [row]);
      }
    }
    const asc = sort === "date_asc";
    const keys = [...map.keys()].sort((a, b) => compareYearMonthKeys(a, b, asc));
    return keys.map((key) => ({
      key,
      label: formatYearMonthHeading(locale, parseYearMonthKey(key)),
      rows: map.get(key) ?? [],
    }));
  }

  const map = new Map<string, { label: string; rows: ItemsListRecord[] }>();
  for (const row of sorted) {
    const { key, label } = alphaGroupKeyAndLabel(row.title, locale);
    const bucket = map.get(key);
    if (bucket) {
      bucket.rows.push(row);
    } else {
      map.set(key, { label, rows: [row] });
    }
  }
  const asc = sort === "name_asc";
  const keys = [...map.keys()].sort((a, b) => compareAlphaSectionKeys(a, b, asc));
  return keys.map((key) => {
    const v = map.get(key)!;
    return { key, label: v.label, rows: v.rows };
  });
}

export type ItemsListPaneVault = { id: string; name: string; isPersonal: boolean };

type ItemsListLeftPaneProps = {
  vaults: readonly ItemsListPaneVault[];
  folderTree: readonly OkkeySidebarFolderTreeNode[];
  /** False until the workspace vault list has been fetched at least once (avoids vault ID flash in the filter trigger). */
  itemsListVaultsLoaded?: boolean;
};

export default function ItemsListLeftPane({
  vaults,
  folderTree,
  itemsListVaultsLoaded = true,
}: ItemsListLeftPaneProps) {
  const { locale, t } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeItemId = searchParams.get(ITEM_QUERY_PARAM)?.trim() ?? "";
  const vaultQ = searchParams.get(VAULT_QUERY_PARAM)?.trim() ?? "";
  const folderQ = searchParams.get(FOLDER_QUERY_PARAM)?.trim() ?? "";
  const filter = filterFromSearchParam(searchParams.get(FILTER_QUERY_PARAM) ?? "");
  const sort = sortFromSearchParam(searchParams.get(SORT_QUERY_PARAM) ?? "");
  const searchQ = searchParams.get(SEARCH_QUERY_PARAM)?.trim() ?? "";

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const vaultMeta = vaultQ ? vaults.find((v) => v.id === vaultQ) : undefined;
  const folderTitle = folderQ ? findFolderLabelInTree(folderTree, folderQ) || folderQ : "";

  const hasListScope = Boolean(searchQ || vaultQ || folderQ);
  const secondaryFilterInTrigger = hasListScope && filterToSearchParam(filter) !== null;
  const vaultScopeLoading = Boolean(vaultQ && !itemsListVaultsLoaded && !vaultMeta);

  const setFilterUrl = (next: ItemsListFilter) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        const fp = filterToSearchParam(next);
        if (fp) {
          n.set(FILTER_QUERY_PARAM, fp);
        } else {
          n.delete(FILTER_QUERY_PARAM);
        }
        return n;
      },
      { replace: true },
    );
  };

  const setSortUrl = (next: ItemsListSort) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        const sp = sortToSearchParam(next);
        if (sp) {
          n.set(SORT_QUERY_PARAM, sp);
        } else {
          n.delete(SORT_QUERY_PARAM);
        }
        return n;
      },
      { replace: true },
    );
  };

  /** Same as sidebar “All items”: drop vault, folder, search, and list filter; keep `item` and `sort`. */
  const clearWorkspaceScopeFromUrl = () => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete(VAULT_QUERY_PARAM);
        n.delete(FOLDER_QUERY_PARAM);
        n.delete(SEARCH_QUERY_PARAM);
        n.delete(FILTER_QUERY_PARAM);
        return n;
      },
      { replace: true },
    );
  };

  const sections = useMemo(() => {
    const searchTrim = searchQ.trim();
    let pool: ItemsListRecord[];
    if (searchTrim) {
      pool = ITEMS_LIST_DEMO.filter((r) => searchScore(r, searchTrim) > 0);
    } else {
      const inVault = filterRowsByVault(ITEMS_LIST_DEMO, vaults, vaultQ);
      pool = filterRowsByFolder(inVault, folderQ);
    }
    const filtered = filterItems(pool, filter);
    const sorted = searchTrim
      ? [...filtered].sort((a, b) => {
          const ds = searchScore(b, searchTrim) - searchScore(a, searchTrim);
          if (ds !== 0) {
            return ds;
          }
          return compareTwoItemsSort(a, b, sort);
        })
      : sortItems(filtered, sort);
    return buildSections(sorted, sort, locale);
  }, [filter, sort, locale, vaultQ, folderQ, vaults, searchQ]);

  const totalRows = useMemo(() => sections.reduce((n, s) => n + s.rows.length, 0), [sections]);
  const selectedRows = useMemo(() => ITEMS_LIST_DEMO.filter((row) => selectedIds.has(row.id)), [selectedIds]);
  const selectedActions = useMemo(
    () => ({
      canFavorite: selectedRows.some((row) => !row.favorite),
      canUnfavorite: selectedRows.some((row) => row.favorite),
      canArchive: selectedRows.some((row) => !row.archived),
      canUnarchive: selectedRows.some((row) => row.archived),
      canDelete: selectedRows.some((row) => !row.deleted),
      canRestore: selectedRows.some((row) => row.deleted),
    }),
    [selectedRows],
  );

  useEffect(() => {
    if (selectionMode && selectedIds.size === 0) {
      setSelectionMode(false);
    }
  }, [selectionMode, selectedIds]);

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const enterSelectionModeWith = (id: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  };

  const toggleRowSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectItemInUrl = (id: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(ITEM_QUERY_PARAM, id);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border p-2">
        <div className="flex w-full items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-busy={vaultScopeLoading}
                aria-label={t("web.items.list.filterAria")}
                className={cn(
                  itemsPanelSelectTriggerClassName,
                  "flex min-h-9 min-w-0 flex-1 cursor-default items-center justify-start gap-2 text-left outline-none",
                )}
              >
                <FilterIconFrame wide={secondaryFilterInTrigger}>
                  {hasListScope ? (
                    <span className="flex h-4 items-center gap-1">
                      {searchQ ? (
                        <SearchGlyph />
                      ) : vaultQ ? (
                        vaultScopeLoading ? (
                          <Spinner size="small" className="size-4 shrink-0" />
                        ) : (
                          <span className="flex size-4 shrink-0 items-center justify-center leading-none" aria-hidden>
                            <span className="text-[14px] leading-none">{vaultMeta?.isPersonal ? "🏠" : "💼"}</span>
                          </span>
                        )
                      ) : (
                        <FolderClosedGlyph />
                      )}
                      {secondaryFilterInTrigger ? (
                        <>
                          <span className="h-4 w-px shrink-0 bg-border/80" aria-hidden />
                          {filterSecondaryGlyph(filter)}
                        </>
                      ) : null}
                    </span>
                  ) : (
                    filterIconForValue(filter)
                  )}
                </FilterIconFrame>
                <span className="min-w-0 flex-1 truncate text-left text-sm font-normal text-foreground">
                  {searchQ
                    ? searchQ
                    : vaultQ
                      ? vaultScopeLoading
                        ? null
                        : (vaultMeta?.name ?? vaultQ)
                      : folderQ
                        ? folderTitle
                        : t(`web.items.filter.${filter === "recently_deleted" ? "recentlyDeleted" : filter}`)}
                </span>
                <ChevronDownGlyph className="shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[12.5rem] p-1">
              {searchQ ? (
                <>
                  <DropdownMenuItem
                    className={cn(
                      "relative gap-2 whitespace-nowrap py-2 ps-2 pe-7",
                      "bg-muted/80 data-[highlighted]:bg-secondary",
                    )}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <SearchGlyph className="size-4 shrink-0 text-foreground" />
                    <span className="min-w-0 flex-1 truncate text-left">{searchQ}</span>
                    <ScopeRowCloseButton locale={locale} onClear={clearWorkspaceScopeFromUrl} />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="mx-1 my-1" />
                </>
              ) : null}
              {vaultQ ? (
                <>
                  <DropdownMenuItem
                    className={cn(
                      "relative gap-2 whitespace-nowrap py-2 ps-2 pe-7",
                      "bg-muted/80 data-[highlighted]:bg-secondary",
                    )}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="text-base leading-none" aria-hidden>
                      {vaultMeta?.isPersonal ? "🏠" : "💼"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">{vaultMeta?.name ?? vaultQ}</span>
                    <ScopeRowCloseButton locale={locale} onClear={clearWorkspaceScopeFromUrl} />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="mx-1 my-1" />
                </>
              ) : null}
              {!vaultQ && folderQ ? (
                <>
                  <DropdownMenuItem
                    className={cn(
                      "relative gap-2 whitespace-nowrap py-2 ps-2 pe-7",
                      "bg-muted/80 data-[highlighted]:bg-secondary",
                    )}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <FolderClosedGlyph />
                    <span className="min-w-0 flex-1 truncate text-left">{folderTitle}</span>
                    <ScopeRowCloseButton locale={locale} onClear={clearWorkspaceScopeFromUrl} />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="mx-1 my-1" />
                </>
              ) : null}
              <DropdownMenuItem
                className={cn(
                  "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                  filter === "all" && "bg-muted/80 data-[highlighted]:bg-secondary",
                )}
                onSelect={() => setFilterUrl("all")}
              >
                <FilterIconAllRecords className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left">{t("web.items.filter.all")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                  filter === "favorites" && "bg-muted/80 data-[highlighted]:bg-secondary",
                )}
                onSelect={() => setFilterUrl("favorites")}
              >
                <FilterIconFavorites className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left">{t("web.items.filter.favorites")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                  filter === "archived" && "bg-muted/80 data-[highlighted]:bg-secondary",
                )}
                onSelect={() => setFilterUrl("archived")}
              >
                <FilterIconArchived className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left">{t("web.items.filter.archived")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                  filter === "recently_deleted" && "bg-muted/80 data-[highlighted]:bg-secondary",
                )}
                onSelect={() => setFilterUrl("recently_deleted")}
              >
                <FilterIconDeleted className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left">{t("web.items.filter.recentlyDeleted")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                aria-label={t("web.items.list.sortAria")}
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-slate-100 p-0 text-foreground shadow-none dark:bg-muted",
                  "hover:bg-slate-200/90 hover:text-foreground dark:hover:bg-muted/80",
                  "focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)]",
                  "data-[state=open]:bg-slate-200/90 data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)] dark:data-[state=open]:bg-muted/90",
                )}
              >
                {sortIconForValue(sort)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12.5rem] p-1">
              <DropdownMenuGroup className="p-0">
                <SidebarGroupLabel className="pointer-events-none">{t("web.items.sort.groupByDate")}</SidebarGroupLabel>
                <DropdownMenuItem
                  className={cn(
                    "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                    sort === "date_desc" && "bg-muted/80 data-[highlighted]:bg-secondary",
                  )}
                  onSelect={() => setSortUrl("date_desc")}
                >
                  <SortIconNewestFirst className="size-4 shrink-0 text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t("web.items.sort.dateDesc")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={cn(
                    "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                    sort === "date_asc" && "bg-muted/80 data-[highlighted]:bg-secondary",
                  )}
                  onSelect={() => setSortUrl("date_asc")}
                >
                  <SortIconOldestFirst className="size-4 shrink-0 text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t("web.items.sort.dateAsc")}</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuGroup className="p-0">
                <SidebarGroupLabel className="pointer-events-none">{t("web.items.sort.groupByAlphabet")}</SidebarGroupLabel>
                <DropdownMenuItem
                  className={cn(
                    "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                    sort === "name_asc" && "bg-muted/80 data-[highlighted]:bg-secondary",
                  )}
                  onSelect={() => setSortUrl("name_asc")}
                >
                  <SortIconAlphaAsc className="size-4 shrink-0 text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t("web.items.sort.nameAsc")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={cn(
                    "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                    sort === "name_desc" && "bg-muted/80 data-[highlighted]:bg-secondary",
                  )}
                  onSelect={() => setSortUrl("name_desc")}
                >
                  <SortIconAlphaDesc className="size-4 shrink-0 text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t("web.items.sort.nameDesc")}</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        {totalRows === 0 ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center px-4 py-10">
            <p className="okkey-body text-center text-sm text-muted-foreground">{t("web.items.list.empty")}</p>
          </div>
        ) : (
          <div className="pt-2">
            {sections.map((section) => (
              <section key={section.key} className="pb-2">
                <h2 className="okkey-body px-5 py-2 text-sm font-medium text-foreground">{section.label}</h2>
                <ul className="flex flex-col gap-0 px-2" role="list">
                  {section.rows.map((row) => {
                    const rowSelected = selectedIds.has(row.id);
                    const rowActive = activeItemId === row.id;
                    return (
                      <li key={row.id}>
                        <div
                          className={cn(
                            "group flex w-full min-h-[44px] items-center gap-0 overflow-hidden rounded-lg transition-colors",
                            "hover:bg-muted/60",
                            rowActive && "bg-muted/80",
                          )}
                        >
                          <button
                            type="button"
                            aria-label={selectionMode ? t("web.items.list.toggleRowAria") : undefined}
                            aria-current={rowActive ? "true" : undefined}
                            onClick={
                              selectionMode
                                ? () => toggleRowSelected(row.id)
                                : () => {
                                    selectItemInUrl(row.id);
                                  }
                            }
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 px-3 py-2.5 text-left"
                          >
                            <Favicon urls={row.urls.length ? row.urls : undefined} size={32} className="shrink-0 bg-background" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">{row.title}</span>
                              <span className="block truncate text-sm text-muted-foreground">{row.login}</span>
                            </span>
                          </button>

                          <div className="flex shrink-0 self-center pe-1.5">
                            {selectionMode ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="iconSm"
                                aria-label={t("web.items.list.toggleRowAria")}
                                aria-pressed={rowSelected}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleRowSelected(row.id);
                                }}
                                className={cn(
                                  "size-8 shrink-0 rounded-full border border-transparent transition-colors",
                                  rowSelected
                                    ? "border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90"
                                    : "bg-foreground/[0.04] text-foreground/45 hover:bg-foreground/[0.08] hover:text-foreground/80 dark:bg-white/[0.06] dark:hover:bg-white/[0.12]",
                                )}
                              >
                                <IconCheck16 className={rowSelected ? "text-primary-foreground" : undefined} />
                              </Button>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="iconSm"
                                    className={cn(
                                      "size-8 shrink-0 text-muted-foreground opacity-0 transition-colors transition-opacity",
                                      "hover:bg-muted/90 hover:text-foreground group-hover:opacity-100",
                                      "data-[state=open]:bg-muted/90 data-[state=open]:opacity-100 data-[state=open]:text-foreground dark:hover:bg-muted/70 dark:data-[state=open]:bg-muted/70",
                                    )}
                                    aria-label={t("web.items.list.rowMenuAria")}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreVerticalIcon />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52 p-1">
                                  <DropdownMenuItem className="gap-2" onSelect={() => undefined}>
                                    <IconEdit16 />
                                    <span>{t("web.items.menu.edit")}</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="gap-2" onSelect={() => undefined}>
                                    {row.favorite ? (
                                      <IconUnfavorite16 className="text-foreground" />
                                    ) : (
                                      <FilterIconFavorites className="size-4 shrink-0 text-foreground" />
                                    )}
                                    <span>
                                      {row.favorite
                                        ? t("web.items.menu.removeFromFavorites")
                                        : t("web.items.menu.addToFavorites")}
                                    </span>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="mx-1 my-1" />
                                  <DropdownMenuItem className="gap-2" onSelect={() => enterSelectionModeWith(row.id)}>
                                    <IconSelect16 />
                                    <span>{t("web.items.menu.select")}</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="mx-1 my-1" />
                                  <DropdownMenuItem className="gap-2" onSelect={() => undefined}>
                                    {row.archived ? (
                                      <IconUnarchive16 className="text-foreground" />
                                    ) : (
                                      <FilterIconArchived className="size-4 shrink-0 text-foreground" />
                                    )}
                                    <span>{row.archived ? t("web.items.menu.unarchive") : t("web.items.menu.archive")}</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className={cn(
                                      "gap-2",
                                      !row.deleted &&
                                        "text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive",
                                    )}
                                    onSelect={() => undefined}
                                  >
                                    {row.deleted ? (
                                      <IconRestore16 className="text-foreground" />
                                    ) : (
                                      <IconDelete16 />
                                    )}
                                    <span>{row.deleted ? t("web.items.menu.restore") : t("web.items.menu.delete")}</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </ScrollArea>

      {selectionMode ? (
        <div className="flex shrink-0 items-center border-t border-border bg-background px-2 py-2">
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            className="shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("web.items.list.exitSelectionAria")}
            onClick={exitSelectionMode}
          >
            <IconClose16 />
          </Button>
          <p className="ms-2 min-w-0 flex-1 truncate text-left text-sm text-foreground">
            {t("web.items.list.selectionCount", { count: selectedIds.size })}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="secondary" size="sm" className="ms-auto shrink-0 gap-2">
                <IconActions16 />
                {t("web.items.list.actions")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1">
              {selectedActions.canFavorite ? (
                <DropdownMenuItem className="gap-2" onSelect={() => undefined}>
                  <FilterIconFavorites className="size-4 shrink-0 text-foreground" />
                  <span>{t("web.items.menu.addToFavorites")}</span>
                </DropdownMenuItem>
              ) : null}
              {selectedActions.canUnfavorite ? (
                <DropdownMenuItem className="gap-2" onSelect={() => undefined}>
                  <IconUnfavorite16 />
                  <span>{t("web.items.menu.removeFromFavorites")}</span>
                </DropdownMenuItem>
              ) : null}
              {(selectedActions.canFavorite || selectedActions.canUnfavorite) &&
              (selectedActions.canArchive ||
                selectedActions.canUnarchive ||
                selectedActions.canDelete ||
                selectedActions.canRestore) ? (
                <DropdownMenuSeparator className="mx-1 my-1" />
              ) : null}
              {selectedActions.canArchive ? (
                <DropdownMenuItem className="gap-2" onSelect={() => undefined}>
                  <FilterIconArchived className="size-4 shrink-0 text-foreground" />
                  <span>{t("web.items.menu.archive")}</span>
                </DropdownMenuItem>
              ) : null}
              {selectedActions.canUnarchive ? (
                <DropdownMenuItem className="gap-2" onSelect={() => undefined}>
                  <IconUnarchive16 />
                  <span>{t("web.items.menu.unarchive")}</span>
                </DropdownMenuItem>
              ) : null}
              {(selectedActions.canArchive || selectedActions.canUnarchive) &&
              (selectedActions.canDelete || selectedActions.canRestore) ? (
                <DropdownMenuSeparator className="mx-1 my-1" />
              ) : null}
              {selectedActions.canDelete ? (
                <DropdownMenuItem
                  className="gap-2 text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive"
                  onSelect={() => undefined}
                >
                  <IconDelete16 />
                  <span>{t("web.items.menu.delete")}</span>
                </DropdownMenuItem>
              ) : null}
              {selectedActions.canRestore ? (
                <DropdownMenuItem className="gap-2" onSelect={() => undefined}>
                  <IconRestore16 />
                  <span>{t("web.items.menu.restore")}</span>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
}
