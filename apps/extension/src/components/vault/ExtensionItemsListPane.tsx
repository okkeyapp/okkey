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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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
import { ITEM_CATEGORY_LOGIN } from "@okkey/types";

import { AUTOFILL_MSG } from "../../lib/autofillMessages";
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
  suggestionsScopeLabel?: string | null;
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

async function openAndFillItem(itemId: string, url: string): Promise<void> {
  await browser.runtime.sendMessage({
    type: AUTOFILL_MSG.openAndFill,
    itemId,
    url,
  });
}

function IconOpenWebsite({ className }: { className?: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-5 shrink-0", className)}
    >
      <path
        d="M21 9V3H15M21 3L10 14M18 13V19C18 19.5304 17.7893 20.0391 17.4142 20.4142C17.0391 20.7893 16.5304 21 16 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V8C3 7.46957 3.21071 6.96086 3.58579 6.58579C3.96086 6.21071 4.46957 6 5 6H11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
    suggestionsScopeLabel = null,
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
    suggestionsScopeLabel ?? "",
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
            suggestionsScopeLabel={suggestionsScopeLabel}
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
                    const firstUrl = row.urls[0]?.trim() ?? "";
                    const showOpenAndFill =
                      row.categoryId === ITEM_CATEGORY_LOGIN && firstUrl.length > 0;
                    return (
                      <li key={row.id}>
                        <div
                          className={cn(
                            "group relative z-0 rounded-lg transition-colors",
                            "hover:bg-muted/60",
                            rowActive && "z-[1] bg-muted/80 shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
                          )}
                        >
                          <button
                            type="button"
                            aria-current={rowActive ? "true" : undefined}
                            onClick={() => onSelect(row.id)}
                            className="relative flex h-[60px] w-full items-center gap-4 rounded-lg px-3 text-left"
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
                          {showOpenAndFill ? (
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className={cn(
                                      "pointer-events-none absolute inset-y-0 right-0 z-10",
                                      "flex size-[60px] items-center justify-center rounded-l-none rounded-r-lg border-l border-border p-0",
                                      // Solid mid-tone between row bg and hover (no translucent muted/60).
                                      "bg-[color-mix(in_srgb,#e2e8f0_45%,hsl(var(--background))_55%)] dark:bg-[color-mix(in_srgb,hsl(var(--muted))_55%,hsl(var(--background))_45%)] text-foreground",
                                      "opacity-0 transition-[opacity,background-color,border-color]",
                                      "group-hover:pointer-events-auto group-hover:opacity-100",
                                      rowActive && "pointer-events-auto opacity-100",
                                      // Hover: mid (#e2e8f0) — lighter than pressed/focus.
                                      "hover:bg-[color-mix(in_srgb,#e2e8f0_90%,hsl(var(--secondary))_10%)] dark:hover:bg-[color-mix(in_srgb,hsl(var(--muted))_80%,hsl(var(--secondary))_20%)]",
                                      "hover:border-[color-mix(in_srgb,#e2e8f0_90%,hsl(var(--secondary))_10%)] dark:hover:border-[color-mix(in_srgb,hsl(var(--muted))_80%,hsl(var(--secondary))_20%)]",
                                      "focus-visible:pointer-events-auto focus-visible:opacity-100",
                                      // No ring — pressed/focus = one soft step past hover mid (slate-300, not slate-400).
                                      // Mouse click does not set :focus-visible; :active covers press, :focus covers post-click focus.
                                      "focus:outline-none focus-visible:outline-none focus:shadow-none focus-visible:shadow-none",
                                      "active:bg-[color-mix(in_srgb,#cbd5e1_90%,hsl(var(--secondary))_10%)] dark:active:bg-[color-mix(in_srgb,hsl(var(--muted))_70%,hsl(var(--secondary))_30%)]",
                                      "active:border-[color-mix(in_srgb,#cbd5e1_90%,hsl(var(--secondary))_10%)] dark:active:border-[color-mix(in_srgb,hsl(var(--muted))_70%,hsl(var(--secondary))_30%)]",
                                      "focus:bg-[color-mix(in_srgb,#cbd5e1_90%,hsl(var(--secondary))_10%)] dark:focus:bg-[color-mix(in_srgb,hsl(var(--muted))_70%,hsl(var(--secondary))_30%)]",
                                      "focus:border-[color-mix(in_srgb,#cbd5e1_90%,hsl(var(--secondary))_10%)] dark:focus:border-[color-mix(in_srgb,hsl(var(--muted))_70%,hsl(var(--secondary))_30%)]",
                                      "focus-visible:bg-[color-mix(in_srgb,#cbd5e1_90%,hsl(var(--secondary))_10%)] dark:focus-visible:bg-[color-mix(in_srgb,hsl(var(--muted))_70%,hsl(var(--secondary))_30%)]",
                                      "focus-visible:border-[color-mix(in_srgb,#cbd5e1_90%,hsl(var(--secondary))_10%)] dark:focus-visible:border-[color-mix(in_srgb,hsl(var(--muted))_70%,hsl(var(--secondary))_30%)]",
                                      // Hover must not mute active/focus while the pointer stays on the button.
                                      "active:hover:bg-[color-mix(in_srgb,#cbd5e1_90%,hsl(var(--secondary))_10%)] dark:active:hover:bg-[color-mix(in_srgb,hsl(var(--muted))_70%,hsl(var(--secondary))_30%)]",
                                      "active:hover:border-[color-mix(in_srgb,#cbd5e1_90%,hsl(var(--secondary))_10%)] dark:active:hover:border-[color-mix(in_srgb,hsl(var(--muted))_70%,hsl(var(--secondary))_30%)]",
                                      "focus:hover:bg-[color-mix(in_srgb,#cbd5e1_90%,hsl(var(--secondary))_10%)] dark:focus:hover:bg-[color-mix(in_srgb,hsl(var(--muted))_70%,hsl(var(--secondary))_30%)]",
                                      "focus:hover:border-[color-mix(in_srgb,#cbd5e1_90%,hsl(var(--secondary))_10%)] dark:focus:hover:border-[color-mix(in_srgb,hsl(var(--muted))_70%,hsl(var(--secondary))_30%)]",
                                      "focus-visible:hover:bg-[color-mix(in_srgb,#cbd5e1_90%,hsl(var(--secondary))_10%)] dark:focus-visible:hover:bg-[color-mix(in_srgb,hsl(var(--muted))_70%,hsl(var(--secondary))_30%)]",
                                      "focus-visible:hover:border-[color-mix(in_srgb,#cbd5e1_90%,hsl(var(--secondary))_10%)] dark:focus-visible:hover:border-[color-mix(in_srgb,hsl(var(--muted))_70%,hsl(var(--secondary))_30%)]",
                                      "[&_svg]:size-5",
                                    )}
                                    aria-label={t("extension.vault.openAndFill")}
                                    onClick={(event) => {
                                      // Do not preventDefault on mousedown — that would block focus.
                                      event.stopPropagation();
                                      void openAndFillItem(row.id, firstUrl);
                                    }}
                                  >
                                    <IconOpenWebsite />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                  {t("extension.vault.openAndFill")}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : null}
                        </div>
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
