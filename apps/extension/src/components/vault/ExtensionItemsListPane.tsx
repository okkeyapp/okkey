import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ScrollArea,
  SidebarGroupLabel,
  Spinner,
  cn,
  mutedSurfaceHoverBgClassName,
  mutedSurfaceOpenBgClassName,
} from "@okkey/ui";
import type { ExtensionItemListRecord } from "@okkey/vault";
import { useState, type ReactNode, type SVGProps } from "react";

export type ExtensionListFilter = "all" | "favorites" | "archived" | "recently_deleted";
export type ExtensionListSort = "name_asc" | "name_desc" | "date_asc" | "date_desc";

const itemsPanelSelectTriggerClassName = cn(
  "h-9 min-h-9 rounded-lg border-0 bg-slate-100 shadow-none dark:bg-muted",
  "px-2 text-sm text-foreground",
  mutedSurfaceHoverBgClassName,
  "focus:border-transparent focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)] focus-visible:border-transparent",
  mutedSurfaceOpenBgClassName,
  "data-[state=open]:border-transparent data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)]",
);

function FilterIconAllRecords({ className, ...props }: SVGProps<SVGSVGElement>) {
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

function ChevronDownGlyph({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0 opacity-60", className)} {...props}>
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FilterIconFrame({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[4px] bg-white p-1 dark:bg-background">
      {children}
    </span>
  );
}

function SortIconNewestFirst({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path d="M8 3.33337V12.6667M8 3.33337L4.66667 6.66671M8 3.33337L11.3333 6.66671" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortIconOldestFirst({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path d="M8 12.6667V3.33337M8 12.6667L4.66667 9.33337M8 12.6667L11.3333 9.33337" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortIconAlphaAsc({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path d="M3.33337 12.6667L6.00004 3.33337L8.66671 12.6667M4.13337 10H7.86671M10 5.33337V12.6667M10 5.33337H12.6667M10 5.33337H8.00004" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortIconAlphaDesc({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path d="M3.33337 3.33337L6.00004 12.6667L8.66671 3.33337M4.13337 6H7.86671M10 10.6667V3.33337M10 10.6667H12.6667M10 10.6667H8.00004" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function filterIconForValue(value: ExtensionListFilter) {
  switch (value) {
    case "all":
      return <FilterIconAllRecords />;
    case "favorites":
      return <FilterIconFavorites />;
    case "archived":
      return <FilterIconArchived />;
    case "recently_deleted":
      return <FilterIconDeleted />;
    default: {
      const _ex: never = value;
      return _ex;
    }
  }
}

function sortIconForValue(sort: ExtensionListSort) {
  switch (sort) {
    case "date_desc":
      return <SortIconNewestFirst />;
    case "date_asc":
      return <SortIconOldestFirst />;
    case "name_asc":
      return <SortIconAlphaAsc />;
    case "name_desc":
      return <SortIconAlphaDesc />;
    default: {
      const _ex: never = sort;
      return _ex;
    }
  }
}

function filterLabelKey(filter: ExtensionListFilter): string {
  switch (filter) {
    case "all":
      return "web.items.filter.all";
    case "favorites":
      return "web.items.filter.favorites";
    case "archived":
      return "web.items.filter.archived";
    case "recently_deleted":
      return "web.items.filter.recentlyDeleted";
    default: {
      const _ex: never = filter;
      return _ex;
    }
  }
}

function RecordFaviconPlaceholder({ title }: { title: string }) {
  const letter = (title.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground"
      aria-hidden
    >
      {letter}
    </span>
  );
}

type ExtensionItemsListPaneProps = {
  records: readonly ExtensionItemListRecord[];
  loading: boolean;
  error: string | null;
  filter: ExtensionListFilter;
  sort: ExtensionListSort;
  selectedId: string | null;
  vaultScopeLabel?: string | null;
  onFilterChange: (filter: ExtensionListFilter) => void;
  onSortChange: (sort: ExtensionListSort) => void;
  onSelect: (id: string) => void;
  onClearVaultScope?: () => void;
  t: (key: string) => string;
};

export function ExtensionItemsListPane(props: ExtensionItemsListPaneProps) {
  const {
    records,
    loading,
    error,
    filter,
    sort,
    selectedId,
    vaultScopeLabel,
    onFilterChange,
    onSortChange,
    onSelect,
    onClearVaultScope,
    t,
  } = props;
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-2">
        <div className="flex w-full items-center gap-2">
          <DropdownMenu open={filterMenuOpen} onOpenChange={setFilterMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("web.items.list.filterAria")}
                className={cn(
                  itemsPanelSelectTriggerClassName,
                  "flex min-h-9 min-w-0 flex-1 cursor-default items-center justify-start gap-2 text-left outline-none",
                )}
              >
                <FilterIconFrame>
                  {vaultScopeLabel ? (
                    <span className="text-[14px] leading-none" aria-hidden>
                      💼
                    </span>
                  ) : (
                    filterIconForValue(filter)
                  )}
                </FilterIconFrame>
                <span className="min-w-0 flex-1 truncate text-left text-sm font-normal text-foreground">
                  {vaultScopeLabel ?? t(filterLabelKey(filter))}
                </span>
                <ChevronDownGlyph className="shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[12.5rem] p-1">
              {vaultScopeLabel && onClearVaultScope ? (
                <>
                  <DropdownMenuItem
                    className="relative gap-2 whitespace-nowrap bg-muted/80 py-2 ps-2 pe-3 data-[highlighted]:bg-secondary"
                    onSelect={() => onClearVaultScope()}
                  >
                    <span className="text-base leading-none" aria-hidden>
                      💼
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">{vaultScopeLabel}</span>
                  </DropdownMenuItem>
                  <div className="mx-1 my-1 h-px bg-border" role="separator" />
                </>
              ) : null}
              {(
                [
                  ["all", FilterIconAllRecords],
                  ["favorites", FilterIconFavorites],
                  ["archived", FilterIconArchived],
                  ["recently_deleted", FilterIconDeleted],
                ] as const
              ).map(([value, Icon]) => (
                <DropdownMenuItem
                  key={value}
                  className={cn(
                    "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                    filter === value && "bg-muted/80 data-[highlighted]:bg-secondary",
                  )}
                  onSelect={() => onFilterChange(value)}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-left">{t(filterLabelKey(value))}</span>
                </DropdownMenuItem>
              ))}
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
                  mutedSurfaceHoverBgClassName,
                  "hover:text-foreground",
                  "focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)]",
                  mutedSurfaceOpenBgClassName,
                  "data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)]",
                )}
              >
                {sortIconForValue(sort)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12.5rem] p-1">
              <DropdownMenuGroup className="p-0">
                <SidebarGroupLabel className="pointer-events-none">{t("web.items.sort.groupByDate")}</SidebarGroupLabel>
                <DropdownMenuItem
                  className={cn("gap-2 py-2 ps-2 pe-3", sort === "date_desc" && "bg-muted/80 data-[highlighted]:bg-secondary")}
                  onSelect={() => onSortChange("date_desc")}
                >
                  <SortIconNewestFirst className="size-4 shrink-0 text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t("web.items.sort.dateDesc")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={cn("gap-2 py-2 ps-2 pe-3", sort === "date_asc" && "bg-muted/80 data-[highlighted]:bg-secondary")}
                  onSelect={() => onSortChange("date_asc")}
                >
                  <SortIconOldestFirst className="size-4 shrink-0 text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t("web.items.sort.dateAsc")}</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuGroup className="p-0">
                <SidebarGroupLabel className="pointer-events-none">{t("web.items.sort.groupByAlphabet")}</SidebarGroupLabel>
                <DropdownMenuItem
                  className={cn("gap-2 py-2 ps-2 pe-3", sort === "name_asc" && "bg-muted/80 data-[highlighted]:bg-secondary")}
                  onSelect={() => onSortChange("name_asc")}
                >
                  <SortIconAlphaAsc className="size-4 shrink-0 text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t("web.items.sort.nameAsc")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={cn("gap-2 py-2 ps-2 pe-3", sort === "name_desc" && "bg-muted/80 data-[highlighted]:bg-secondary")}
                  onSelect={() => onSortChange("name_desc")}
                >
                  <SortIconAlphaDesc className="size-4 shrink-0 text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t("web.items.sort.nameDesc")}</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-10" role="status" aria-busy="true">
            <Spinner className="size-5" />
          </div>
        ) : error ? (
          <p className="p-3 text-sm text-destructive">{error}</p>
        ) : records.length === 0 ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center px-4 py-10">
            <p className="text-center text-sm text-muted-foreground">{t("web.items.list.empty")}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-0 px-2 py-2" role="list">
            {records.map((row) => {
              const rowActive = selectedId === row.id;
              const rowSubtitle = row.description.trim();
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-current={rowActive ? "true" : undefined}
                    onClick={() => onSelect(row.id)}
                    className={cn(
                      "group relative z-0 flex h-[60px] w-full items-center gap-4 rounded-lg px-3 text-left transition-colors",
                      "hover:bg-muted/60",
                      rowActive && "z-[1] bg-muted/80 shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
                    )}
                  >
                    <RecordFaviconPlaceholder title={row.title || "—"} />
                    {rowSubtitle ? (
                      <span className="flex min-h-10 min-w-0 flex-1 flex-col justify-center">
                        <span className="block truncate text-sm font-medium leading-5 text-foreground">
                          {row.title || "—"}
                        </span>
                        <span className="block min-h-5 truncate text-sm leading-5 text-muted-foreground">
                          {rowSubtitle}
                        </span>
                      </span>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-sm font-medium leading-5 text-foreground">
                        {row.title || "—"}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
