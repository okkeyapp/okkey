import {
  Button,
  ChevronDownGlyph,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Favicon,
  FilterIconAllRecords,
  FilterIconArchived,
  FilterIconDeleted,
  FilterIconFavorites,
  FilterIconFrame,
  FilterIconMonitoring,
  ScrollArea,
  SidebarGroupLabel,
  SortIconAlphaAsc,
  SortIconAlphaDesc,
  SortIconNewestFirst,
  SortIconOldestFirst,
  Spinner,
  cn,
  mutedSurfaceHoverBgClassName,
  mutedSurfaceOpenBgClassName,
  sortIconForValue,
  type ItemsListSortValue,
} from "@okkey/ui";
import type { ExtensionItemListRecord } from "@okkey/vault";
import { useState } from "react";

export type ExtensionListFilter =
  | "all"
  | "favorites"
  | "archived"
  | "recently_deleted"
  | "reused"
  | "strong"
  | "medium"
  | "weak"
  | "stale"
  | "compromised"
  | "2fa-gap"
  | "passkey-gap";

export type ExtensionListSort = ItemsListSortValue;

export type ExtensionListVaultOption = {
  id: string;
  name: string;
  emoji?: string;
};

const itemsPanelSelectTriggerClassName = cn(
  "h-9 min-h-9 rounded-lg border-0 bg-slate-100 shadow-none dark:bg-muted",
  "px-2 text-sm text-foreground",
  mutedSurfaceHoverBgClassName,
  "focus:border-transparent focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)] focus-visible:border-transparent",
  mutedSurfaceOpenBgClassName,
  "data-[state=open]:border-transparent data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)]",
);

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
    case "reused":
    case "strong":
    case "medium":
    case "weak":
    case "stale":
    case "compromised":
    case "2fa-gap":
    case "passkey-gap":
      return <FilterIconMonitoring />;
    default: {
      const _ex: never = value;
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
    case "reused":
      return "web.monitoring.reusedTitle";
    case "strong":
      return "web.items.filter.strong";
    case "medium":
      return "web.items.filter.medium";
    case "weak":
      return "web.monitoring.weakTitle";
    case "stale":
      return "web.monitoring.staleTitle";
    case "compromised":
      return "web.monitoring.compromisedTitle";
    case "2fa-gap":
      return "web.monitoring.twoFactorGapTitle";
    case "passkey-gap":
      return "web.monitoring.passkeyGapTitle";
    default: {
      const _ex: never = filter;
      return _ex;
    }
  }
}

const BASE_FILTERS: readonly ExtensionListFilter[] = [
  "all",
  "favorites",
  "archived",
  "recently_deleted",
];

const MONITORING_FILTERS: readonly ExtensionListFilter[] = [
  "reused",
  "strong",
  "medium",
  "weak",
  "stale",
  "compromised",
  "2fa-gap",
  "passkey-gap",
];

type ExtensionItemsListPaneProps = {
  records: readonly ExtensionItemListRecord[];
  loading: boolean;
  error: string | null;
  filter: ExtensionListFilter;
  sort: ExtensionListSort;
  selectedId: string | null;
  vaultScopeLabel?: string | null;
  vaultOptions?: readonly ExtensionListVaultOption[];
  onFilterChange: (filter: ExtensionListFilter) => void;
  onSortChange: (sort: ExtensionListSort) => void;
  onSelect: (id: string) => void;
  onClearVaultScope?: () => void;
  onPickVault?: (vaultId: string) => void;
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
    vaultOptions = [],
    onFilterChange,
    onSortChange,
    onSelect,
    onClearVaultScope,
    onPickVault,
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
            <DropdownMenuContent align="start" className="min-w-[14rem] p-1">
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
                    <span className="text-xs text-muted-foreground" aria-hidden>
                      ✕
                    </span>
                  </DropdownMenuItem>
                  <div className="mx-1 my-1 h-px bg-border" role="separator" />
                </>
              ) : null}

              {BASE_FILTERS.map((value) => {
                const Icon =
                  value === "all"
                    ? FilterIconAllRecords
                    : value === "favorites"
                      ? FilterIconFavorites
                      : value === "archived"
                        ? FilterIconArchived
                        : FilterIconDeleted;
                return (
                  <DropdownMenuItem
                    key={value}
                    className={cn(
                      "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                      filter === value && !vaultScopeLabel && "bg-muted/80 data-[highlighted]:bg-secondary",
                    )}
                    onSelect={() => onFilterChange(value)}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-left">{t(filterLabelKey(value))}</span>
                  </DropdownMenuItem>
                );
              })}

              <div className="mx-1 my-1 h-px bg-border" role="separator" />
              <SidebarGroupLabel className="pointer-events-none">
                {t("web.nav.monitoring")}
              </SidebarGroupLabel>
              {MONITORING_FILTERS.map((value) => (
                <DropdownMenuItem
                  key={value}
                  className={cn(
                    "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                    filter === value && !vaultScopeLabel && "bg-muted/80 data-[highlighted]:bg-secondary",
                  )}
                  onSelect={() => onFilterChange(value)}
                >
                  <FilterIconMonitoring className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-left">{t(filterLabelKey(value))}</span>
                </DropdownMenuItem>
              ))}

              {vaultOptions.length > 0 && onPickVault ? (
                <>
                  <div className="mx-1 my-1 h-px bg-border" role="separator" />
                  <SidebarGroupLabel className="pointer-events-none">
                    {t("web.nav.vaultsSection")}
                  </SidebarGroupLabel>
                  {vaultOptions.map((vault) => (
                    <DropdownMenuItem
                      key={vault.id}
                      className="gap-2 whitespace-nowrap py-2 ps-2 pe-3"
                      onSelect={() => onPickVault(vault.id)}
                    >
                      <span className="text-base leading-none" aria-hidden>
                        {vault.emoji ?? "💼"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-left">{vault.name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
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
              const isLogin = row.categoryId === "login";
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
                    <Favicon
                      name={isLogin ? row.title : undefined}
                      size={32}
                      lazy
                      alt=""
                      className="size-8"
                    />
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
