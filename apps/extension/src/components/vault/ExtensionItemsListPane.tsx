import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ListScrollSentinel,
  ScrollArea,
  SidebarGroupLabel,
  SortIconAlphaAsc,
  SortIconAlphaDesc,
  SortIconNewestFirst,
  SortIconOldestFirst,
  Spinner,
  buildItemsListSections,
  cn,
  mutedSurfaceHoverBgClassName,
  mutedSurfaceOpenBgClassName,
  sortIconForValue,
  useListWindow,
  windowListSections,
  type ItemsListLocale,
  type ItemsListSortValue,
} from "@okkey/ui";
import { parseTagSearchNeedle, type ExtensionItemListRecord } from "@okkey/vault";
import {
  ItemsListFilterDropdown,
  LazyItemRecordFavicon,
  getActiveCategoryLabel,
  useItemFaviconAttachmentUrl,
  type ItemsListCoreFilter,
  type ItemsListFilterScopeVault,
} from "@okkey/vault-ui";
import { useMemo, useRef } from "react";

import { useRadixScrollAreaScrolled } from "../../lib/useRadixScrollAreaScrolled";

export type ExtensionListFilter = ItemsListCoreFilter;

export type ExtensionListSort = ItemsListSortValue;

export type ExtensionListVaultOption = ItemsListFilterScopeVault;

export type ExtensionListRow = ExtensionItemListRecord & {
  date: Date;
  favorite: boolean;
  folderId: string | null;
};

type ExtensionItemsListPaneProps = {
  records: readonly ExtensionListRow[];
  loading: boolean;
  error: string | null;
  filter: ExtensionListFilter;
  sort: ExtensionListSort;
  selectedId: string | null;
  locale: ItemsListLocale;
  searchQuery?: string;
  vaultScopeLabel?: string | null;
  folderScopeLabel?: string | null;
  categoryScopeLabel?: string | null;
  vaultOptions: readonly ExtensionListVaultOption[];
  folderTree: Parameters<typeof ItemsListFilterDropdown>[0]["folderTree"];
  activeVaultId: string;
  activeFolderId: string;
  activeCategoryId: string;
  apiBaseUrl: string;
  accessToken: string;
  resolveVaultKey: (vaultId: string) => Uint8Array | null | undefined;
  onFilterChange: (filter: ExtensionListFilter) => void;
  onSortChange: (sort: ExtensionListSort) => void;
  onSelect: (id: string) => void;
  onClearScope?: () => void;
  onPickVault: (vaultId: string) => void;
  onPickFolder: (folderId: string) => void;
  onPickCategory: (categoryId: string) => void;
  onPickTag: (tag: string) => void;
  t: (key: string) => string;
};

function ExtensionListRowFavicon(props: {
  row: ExtensionListRow;
  apiBaseUrl: string;
  accessToken: string;
  vaultKey: Uint8Array | null | undefined;
}) {
  const faviconUrl = useItemFaviconAttachmentUrl({
    apiBaseUrl: props.apiBaseUrl,
    accessToken: props.accessToken,
    vaultKey: props.vaultKey,
    vaultId: props.row.vaultId,
    itemId: props.row.id,
    faviconId: props.row.faviconId,
    enabled: Boolean(props.vaultKey && props.row.faviconId),
  });

  return (
    <LazyItemRecordFavicon
      categoryId={props.row.categoryId}
      title={props.row.title}
      faviconId={props.row.faviconId}
      previewImageSrc={faviconUrl.imageSrc}
      previewLoading={faviconUrl.loading}
      size={32}
      alt=""
      className="size-8"
    />
  );
}

const listHeaderShadowClassName = (scrolled: boolean) =>
  cn(
    "relative z-10 shrink-0 border-b border-border bg-background p-2 transition-shadow",
    scrolled && "shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
  );

export function ExtensionItemsListPane(props: ExtensionItemsListPaneProps) {
  const {
    records,
    loading,
    error,
    filter,
    sort,
    selectedId,
    locale,
    searchQuery = "",
    vaultScopeLabel,
    folderScopeLabel,
    categoryScopeLabel,
    vaultOptions,
    folderTree,
    activeVaultId,
    activeFolderId,
    activeCategoryId,
    apiBaseUrl,
    accessToken,
    resolveVaultKey,
    onFilterChange,
    onSortChange,
    onSelect,
    onClearScope,
    onPickVault,
    onPickFolder,
    onPickCategory,
    onPickTag,
    t,
  } = props;
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const listHeaderScrolled = useRadixScrollAreaScrolled(scrollAreaRef);

  const tagNeedle = useMemo(() => parseTagSearchNeedle(searchQuery), [searchQuery]);
  const tagScopeLabel = tagNeedle;
  const searchScopeLabel = searchQuery.trim() && !tagNeedle ? searchQuery.trim() : null;

  const sections = useMemo(
    () => buildItemsListSections(records, sort, locale),
    [locale, records, sort],
  );
  const totalRows = useMemo(() => sections.reduce((n, s) => n + s.rows.length, 0), [sections]);
  const listWindowResetKey = [
    filter,
    sort,
    activeVaultId,
    activeFolderId,
    activeCategoryId,
    searchQuery,
    vaultScopeLabel ?? "",
    folderScopeLabel ?? "",
    categoryScopeLabel ?? "",
  ].join("|");
  const { visibleCount, hasMore, loadMore } = useListWindow({
    total: totalRows,
    resetKey: listWindowResetKey,
  });
  const visibleSections = useMemo(
    () => windowListSections(sections, visibleCount),
    [sections, visibleCount],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={listHeaderShadowClassName(listHeaderScrolled)}>
        <div className="flex w-full items-center gap-2">
          <ItemsListFilterDropdown
            t={t}
            locale={locale === "ru" ? "ru" : "en"}
            filter={filter}
            onFilterChange={onFilterChange}
            searchScopeLabel={searchScopeLabel}
            tagScopeLabel={tagScopeLabel}
            vaultScopeLabel={vaultScopeLabel}
            folderScopeLabel={folderScopeLabel}
            categoryScopeLabel={categoryScopeLabel}
            categoryId={activeCategoryId || null}
            vaultOptions={vaultOptions}
            folderTree={folderTree}
            records={records}
            activeVaultId={activeVaultId}
            activeFolderId={activeFolderId}
            activeCategoryId={activeCategoryId}
            onClearScope={onClearScope}
            onPickVault={onPickVault}
            onPickFolder={onPickFolder}
            onPickCategory={onPickCategory}
            onPickTag={onPickTag}
          />

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

      <ScrollArea ref={scrollAreaRef} className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-10" role="status" aria-busy="true">
            <Spinner className="size-5" />
          </div>
        ) : error ? (
          <p className="p-3 text-sm text-destructive">{error}</p>
        ) : totalRows === 0 ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center px-4 py-10">
            <p className="text-center text-sm text-muted-foreground">{t("web.items.list.empty")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0 px-2 py-2">
            {visibleSections.map((section) => (
              <div key={section.key} className="flex flex-col">
                <SidebarGroupLabel className="bg-background px-3 py-1.5">
                  {section.label}
                </SidebarGroupLabel>
                <ul className="flex flex-col gap-0" role="list">
                  {section.rows.map((row) => {
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
                          <ExtensionListRowFavicon
                            row={row}
                            apiBaseUrl={apiBaseUrl}
                            accessToken={accessToken}
                            vaultKey={resolveVaultKey(row.vaultId)}
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
              </div>
            ))}
            <ListScrollSentinel
              scrollAreaRef={scrollAreaRef}
              disabled={!hasMore}
              onVisible={loadMore}
            />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export { getActiveCategoryLabel };
