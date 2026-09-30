/**
 * Shared items-list filter dropdown (web + extension).
 * Matches web `ItemsListLeftPane` filter trigger + menu: scope chip with red
 * close, icons on selected rows, and multi-glyph trigger (scope + secondary filter).
 */
import type { WebLocale, WebMessageValues } from "@okkey/i18n";
import {
  ChevronDownGlyph,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FilterIconAllRecords,
  FilterIconArchived,
  FilterIconDeleted,
  FilterIconFavorites,
  FilterIconFrame,
  FolderClosedGlyph,
  cn,
  mutedSurfaceHoverBgClassName,
  mutedSurfaceOpenBgClassName,
  vaultDisplayIcon,
} from "@okkey/ui";
import { useState, type ReactNode } from "react";

import { getItemCategoryDefinition } from "../items/itemCategoryCatalog.js";
import {
  CategoryIconBadge,
  FilterTagsIcon,
  ItemsListFilterScopeSubmenus,
  type ItemsListFilterScopeRecord,
  type ItemsListFilterScopeVault,
} from "./ItemsListFilterScopeSubmenus.js";

export type ItemsListCoreFilter = "all" | "favorites" | "archived" | "recently_deleted";

const itemsPanelSelectTriggerClassName = cn(
  "h-9 min-h-9 rounded-lg border-0 bg-slate-100 shadow-none dark:bg-muted",
  "px-2 text-sm text-foreground",
  mutedSurfaceHoverBgClassName,
  "focus:border-transparent focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)] focus-visible:border-transparent",
  mutedSurfaceOpenBgClassName,
  "data-[state=open]:border-transparent data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)]",
);

const CORE_FILTERS: readonly ItemsListCoreFilter[] = [
  "all",
  "favorites",
  "archived",
  "recently_deleted",
];

function filterIconForValue(value: ItemsListCoreFilter, className?: string) {
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

function filterSecondaryGlyph(filter: ItemsListCoreFilter): ReactNode {
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

function filterLabelKey(filter: ItemsListCoreFilter): string {
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

function scopeRowCloseAriaLabel(locale: WebLocale): string {
  return locale === "ru" ? "Сбросить область списка" : "Clear list scope";
}

/** Red circular close control on the active scope chip row (web parity). */
export function ScopeRowCloseButton({
  locale,
  onClear,
}: {
  locale: WebLocale;
  onClear: () => void;
}) {
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

export type ItemsListFilterDropdownProps<TRecord extends ItemsListFilterScopeRecord> = {
  t: (key: string, values?: WebMessageValues) => string;
  locale: WebLocale;
  filter: ItemsListCoreFilter;
  onFilterChange: (filter: ItemsListCoreFilter) => void;
  vaultScopeLabel?: string | null;
  folderScopeLabel?: string | null;
  categoryScopeLabel?: string | null;
  tagScopeLabel?: string | null;
  vaultOptions: readonly ItemsListFilterScopeVault[];
  folderTree: Parameters<typeof ItemsListFilterScopeSubmenus>[0]["folderTree"];
  records: readonly TRecord[];
  activeVaultId: string;
  activeFolderId: string;
  activeCategoryId: string;
  onClearScope?: () => void;
  onPickVault: (vaultId: string) => void;
  onPickFolder: (folderId: string) => void;
  onPickCategory: (categoryId: string) => void;
  onPickTag: (tag: string) => void;
};

export function ItemsListFilterDropdown<TRecord extends ItemsListFilterScopeRecord>(
  props: ItemsListFilterDropdownProps<TRecord>,
) {
  const {
    t,
    locale,
    filter,
    onFilterChange,
    vaultScopeLabel,
    folderScopeLabel,
    categoryScopeLabel,
    tagScopeLabel,
    vaultOptions,
    folderTree,
    records,
    activeVaultId,
    activeFolderId,
    activeCategoryId,
    onClearScope,
    onPickVault,
    onPickFolder,
    onPickCategory,
    onPickTag,
  } = props;

  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  const vaultMeta = activeVaultId
    ? vaultOptions.find((v) => v.id === activeVaultId)
    : undefined;
  const categoryDefinition = activeCategoryId
    ? getItemCategoryDefinition(activeCategoryId)
    : undefined;

  const hasListScope = Boolean(
    tagScopeLabel || vaultScopeLabel || folderScopeLabel || categoryScopeLabel,
  );
  const secondaryFilterInTrigger = hasListScope && filter !== "all";
  const categoryScopeActive = Boolean(categoryScopeLabel && categoryDefinition);
  const categoryWithSecondaryFilter = categoryScopeActive && secondaryFilterInTrigger;

  const activeScopeLabel =
    tagScopeLabel ?? vaultScopeLabel ?? folderScopeLabel ?? categoryScopeLabel ?? null;

  const triggerLabel = activeScopeLabel ?? t(filterLabelKey(filter));

  return (
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
          <FilterIconFrame wide={secondaryFilterInTrigger} flush={categoryScopeActive}>
            {hasListScope ? (
              <span
                className={cn(
                  "flex items-center",
                  categoryScopeActive ? "h-full w-full" : "h-4 gap-1",
                  categoryWithSecondaryFilter && "gap-0",
                )}
              >
                {tagScopeLabel ? (
                  <FilterTagsIcon className="size-4 shrink-0 text-foreground" />
                ) : categoryScopeActive && categoryDefinition ? (
                  <>
                    <CategoryIconBadge
                      categoryId={categoryDefinition.id}
                      iconColor={categoryDefinition.iconColor}
                      size={24}
                    />
                    {secondaryFilterInTrigger ? (
                      <span className="flex flex-1 items-center justify-center">
                        {filterSecondaryGlyph(filter)}
                      </span>
                    ) : null}
                  </>
                ) : vaultScopeLabel ? (
                  <span className="flex size-4 shrink-0 items-center justify-center leading-none" aria-hidden>
                    <span className="text-[14px] leading-none">
                      {vaultMeta ? vaultDisplayIcon(vaultMeta) : "💼"}
                    </span>
                  </span>
                ) : (
                  <FolderClosedGlyph />
                )}
                {!categoryScopeActive && secondaryFilterInTrigger ? (
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
            {triggerLabel}
          </span>
          <ChevronDownGlyph className="shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem] p-1">
        {tagScopeLabel && onClearScope ? (
          <>
            <DropdownMenuItem
              className={cn(
                "relative gap-2 whitespace-nowrap py-2 ps-2 pe-7",
                "bg-muted/80 data-[highlighted]:bg-secondary",
              )}
              onSelect={(e) => e.preventDefault()}
            >
              <FilterTagsIcon className="size-4 shrink-0 text-foreground" />
              <span className="min-w-0 flex-1 truncate text-left">{tagScopeLabel}</span>
              <ScopeRowCloseButton locale={locale} onClear={onClearScope} />
            </DropdownMenuItem>
            <DropdownMenuSeparator className="mx-1 my-1" />
          </>
        ) : null}
        {vaultScopeLabel && onClearScope ? (
          <>
            <DropdownMenuItem
              className={cn(
                "relative gap-2 whitespace-nowrap py-2 ps-2 pe-7",
                "bg-muted/80 data-[highlighted]:bg-secondary",
              )}
              onSelect={(e) => e.preventDefault()}
            >
              <span className="text-base leading-none" aria-hidden>
                {vaultMeta ? vaultDisplayIcon(vaultMeta) : "💼"}
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{vaultScopeLabel}</span>
              <ScopeRowCloseButton locale={locale} onClear={onClearScope} />
            </DropdownMenuItem>
            <DropdownMenuSeparator className="mx-1 my-1" />
          </>
        ) : null}
        {!vaultScopeLabel && folderScopeLabel && onClearScope ? (
          <>
            <DropdownMenuItem
              className={cn(
                "relative gap-2 whitespace-nowrap py-2 ps-2 pe-7",
                "bg-muted/80 data-[highlighted]:bg-secondary",
              )}
              onSelect={(e) => e.preventDefault()}
            >
              <FolderClosedGlyph />
              <span className="min-w-0 flex-1 truncate text-left">{folderScopeLabel}</span>
              <ScopeRowCloseButton locale={locale} onClear={onClearScope} />
            </DropdownMenuItem>
            <DropdownMenuSeparator className="mx-1 my-1" />
          </>
        ) : null}
        {!tagScopeLabel &&
        !vaultScopeLabel &&
        !folderScopeLabel &&
        categoryScopeLabel &&
        categoryDefinition &&
        onClearScope ? (
          <>
            <DropdownMenuItem
              className={cn(
                "relative gap-2 whitespace-nowrap py-2 ps-2 pe-7",
                "bg-muted/80 data-[highlighted]:bg-secondary",
              )}
              onSelect={(e) => e.preventDefault()}
            >
              <CategoryIconBadge
                categoryId={categoryDefinition.id}
                iconColor={categoryDefinition.iconColor}
                size={24}
              />
              <span className="min-w-0 flex-1 truncate text-left">{categoryScopeLabel}</span>
              <ScopeRowCloseButton locale={locale} onClear={onClearScope} />
            </DropdownMenuItem>
            <DropdownMenuSeparator className="mx-1 my-1" />
          </>
        ) : null}

        {CORE_FILTERS.map((value) => {
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
                filter === value && "bg-muted/80 data-[highlighted]:bg-secondary",
              )}
              onSelect={() => onFilterChange(value)}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t(filterLabelKey(value))}</span>
            </DropdownMenuItem>
          );
        })}

        <ItemsListFilterScopeSubmenus
          t={t}
          vaults={vaultOptions}
          folderTree={folderTree}
          records={records}
          activeVaultId={activeVaultId}
          activeFolderId={activeFolderId}
          activeCategoryId={activeCategoryId}
          onPickVault={onPickVault}
          onPickFolder={onPickFolder}
          onPickCategory={onPickCategory}
          onPickTag={onPickTag}
          onCloseMenu={() => setFilterMenuOpen(false)}
          menuOpen={filterMenuOpen}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
