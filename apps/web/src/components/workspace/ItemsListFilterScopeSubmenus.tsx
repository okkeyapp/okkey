import type { WebMessageValues } from "@okkey/i18n";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Input,
  ScrollArea,
  SearchIcon,
  cn,
  type OkkeySidebarFolderTreeNode,
} from "@okkey/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { flattenWorkspaceFolders } from "../../folders/workspaceFolderTree";
import { itemsPathWithFolderMerged, itemsPathWithVaultMerged } from "../../routes/paths";
import { ITEM_CATEGORY_DEFINITIONS, getItemCategoryDefinition, type ItemCategoryId } from "../items/itemCategoryCatalog";
import { ItemCategoryIcon } from "../items/itemCategoryIcons";
import type { ItemsListPaneVault, ItemsListRecord } from "./ItemsListLeftPane";
import { vaultDisplayIcon } from "./settings/vaults/vaultIcons";

function FilterVaultsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M5.2666 5.2666L7.0666 7.0666M8.93327 7.0666L10.7333 5.2666M5.2666 10.7333L7.0666 8.93327M8.93327 8.93327L10.7333 10.7333M3.33333 2H12.6667C13.403 2 14 2.59695 14 3.33333V12.6667C14 13.403 13.403 14 12.6667 14H3.33333C2.59695 14 2 13.403 2 12.6667V3.33333C2 2.59695 2.59695 2 3.33333 2ZM5.33333 5C5.33333 5.1841 5.1841 5.33333 5 5.33333C4.81591 5.33333 4.66667 5.1841 4.66667 5C4.66667 4.81591 4.81591 4.66667 5 4.66667C5.1841 4.66667 5.33333 4.81591 5.33333 5ZM11.3333 5C11.3333 5.1841 11.1841 5.33333 11 5.33333C10.8159 5.33333 10.6667 5.1841 10.6667 5C10.6667 4.81591 10.8159 4.66667 11 4.66667C11.1841 4.66667 11.3333 4.81591 11.3333 5ZM5.33333 11C5.33333 11.1841 5.1841 11.3333 5 11.3333C4.81591 11.3333 4.66667 11.1841 4.66667 11C4.66667 10.8159 4.81591 10.6667 5 10.6667C5.1841 10.6667 5.33333 10.8159 5.33333 11ZM11.3333 11C11.3333 11.1841 11.1841 11.3333 11 11.3333C10.8159 11.3333 10.6667 11.1841 10.6667 11C10.6667 10.8159 10.8159 10.6667 11 10.6667C11.1841 10.6667 11.3333 10.8159 11.3333 11ZM9.33333 8C9.33333 8.73638 8.73638 9.33333 8 9.33333C7.26362 9.33333 6.66667 8.73638 6.66667 8C6.66667 7.26362 7.26362 6.66667 8 6.66667C8.73638 6.66667 9.33333 7.26362 9.33333 8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterFoldersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", props.className)} {...props}>
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

function FilterCategoriesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M2.66663 2.6665H6.66663V6.6665H2.66663V2.6665Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.33337 2.6665H13.3334V6.6665H9.33337V2.6665Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.66663 9.3335H6.66663V13.3335H2.66663V9.3335Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M9.33337 11.3335C9.33337 11.8639 9.54409 12.3726 9.91916 12.7477C10.2942 13.1228 10.8029 13.3335 11.3334 13.3335C11.8638 13.3335 12.3725 13.1228 12.7476 12.7477C13.1227 12.3726 13.3334 11.8639 13.3334 11.3335C13.3334 10.8031 13.1227 10.2944 12.7476 9.91928C12.3725 9.54421 11.8638 9.3335 11.3334 9.3335C10.8029 9.3335 10.2942 9.54421 9.91916 9.91928C9.54409 10.2944 9.33337 10.8031 9.33337 11.3335Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FilterTagsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M4.33337 5.00016C4.33337 5.17697 4.40361 5.34654 4.52864 5.47157C4.65366 5.59659 4.82323 5.66683 5.00004 5.66683C5.17685 5.66683 5.34642 5.59659 5.47145 5.47157C5.59647 5.34654 5.66671 5.17697 5.66671 5.00016C5.66671 4.82335 5.59647 4.65378 5.47145 4.52876C5.34642 4.40373 5.17685 4.3335 5.00004 4.3335C4.82323 4.3335 4.65366 4.40373 4.52864 4.52876C4.40361 4.65378 4.33337 4.82335 4.33337 5.00016Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 4V7.448C2.00008 7.80159 2.1406 8.14068 2.39067 8.39067L7.53067 13.5307C7.83197 13.8319 8.24059 14.0012 8.66667 14.0012C9.09274 14.0012 9.50137 13.8319 9.80267 13.5307L13.5307 9.80267C13.8319 9.50137 14.0012 9.09274 14.0012 8.66667C14.0012 8.24059 13.8319 7.83197 13.5307 7.53067L8.39067 2.39067C8.14068 2.1406 7.80159 2.00008 7.448 2H4C3.46957 2 2.96086 2.21071 2.58579 2.58579C2.21071 2.96086 2 3.46957 2 4Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterChevronRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M6 12L10 8L6 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const filterScopeSubTriggerClassName = cn(
  "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
  "data-[highlighted]:bg-secondary data-[highlighted]:text-foreground",
  "hover:bg-secondary hover:text-foreground",
  "data-[state=open]:bg-secondary",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0",
);

type FilterScopeSubmenuId = "vaults" | "folders" | "categories" | "tags";

function FilterScopeSubmenu({
  id,
  openSubmenu,
  onOpenSubmenuChange,
  contentClassName,
  children,
  trigger,
}: {
  id: FilterScopeSubmenuId;
  openSubmenu: FilterScopeSubmenuId | null;
  onOpenSubmenuChange: (next: FilterScopeSubmenuId | null) => void;
  contentClassName?: string;
  children: ReactNode;
  trigger: ReactNode;
}) {
  const isOpen = openSubmenu === id;
  const openedByClickRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      openedByClickRef.current = false;
    }
  }, [isOpen]);

  return (
    <DropdownMenuSub
      open={isOpen}
      onOpenChange={(open) => {
        if (open) {
          return;
        }
        if (openedByClickRef.current) {
          return;
        }
        if (openSubmenu === id) {
          onOpenSubmenuChange(null);
        }
      }}
    >
      <DropdownMenuSubTrigger
        className={filterScopeSubTriggerClassName}
        onClick={(event) => {
          event.preventDefault();
          if (isOpen) {
            openedByClickRef.current = false;
            onOpenSubmenuChange(null);
            return;
          }
          openedByClickRef.current = true;
          onOpenSubmenuChange(id);
        }}
      >
        {trigger}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className={contentClassName}>{children}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

const filterScopeMenuItemClassName = cn(
  "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
  "hover:bg-secondary hover:text-foreground",
);

function filterScopeMenuItemActiveClassName(isActive: boolean) {
  return isActive ? "bg-muted/80 data-[highlighted]:bg-secondary" : undefined;
}

export function CategoryIconBadge({
  categoryId,
  iconColor,
  size,
}: {
  categoryId: ItemCategoryId;
  iconColor: string;
  size: 20 | 24;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[4px] text-white"
      style={{ backgroundColor: iconColor, width: size, height: size }}
    >
      <ItemCategoryIcon categoryId={categoryId} pixelSize={16} className="text-white" />
    </span>
  );
}

function FilterScopeSearchPanel({
  searchQuery,
  onSearchQueryChange,
  placeholder,
  children,
}: {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  placeholder: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="border-b border-border p-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder={placeholder}
            className="h-8 pl-9"
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          />
        </div>
      </div>
      <ScrollArea className="max-h-[360px]">
        <div className="p-1">{children}</div>
      </ScrollArea>
    </>
  );
}

function collectUniqueTags(records: readonly ItemsListRecord[]): string[] {
  const tags = new Set<string>();
  for (const record of records) {
    for (const tag of record.tags) {
      const trimmed = tag.trim();
      if (trimmed) {
        tags.add(trimmed);
      }
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }));
}

function categoriesWithRecords(records: readonly ItemsListRecord[]) {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.categoryId, (counts.get(record.categoryId) ?? 0) + 1);
  }
  return ITEM_CATEGORY_DEFINITIONS.filter((category) => (counts.get(category.id) ?? 0) > 0);
}

export type ItemsListFilterScopeSubmenusProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  vaults: readonly ItemsListPaneVault[];
  folderTree: readonly OkkeySidebarFolderTreeNode[];
  records: readonly ItemsListRecord[];
  searchParams: URLSearchParams;
  activeVaultId: string;
  activeFolderId: string;
  activeCategoryId: string;
  onNavigateTo: (to: string) => void;
  onPickCategory: (categoryId: string) => void;
  onPickTag: (tag: string) => void;
  onCloseMenu: () => void;
  menuOpen: boolean;
};

export function ItemsListFilterScopeSubmenus({
  t,
  vaults,
  folderTree,
  records,
  searchParams,
  activeVaultId,
  activeFolderId,
  activeCategoryId,
  onNavigateTo,
  onPickCategory,
  onPickTag,
  onCloseMenu,
  menuOpen,
}: ItemsListFilterScopeSubmenusProps) {
  const [openSubmenu, setOpenSubmenu] = useState<FilterScopeSubmenuId | null>(null);
  const [vaultSearchQuery, setVaultSearchQuery] = useState("");
  const [folderSearchQuery, setFolderSearchQuery] = useState("");
  const [tagSearchQuery, setTagSearchQuery] = useState("");

  useEffect(() => {
    if (!menuOpen) {
      setOpenSubmenu(null);
      setVaultSearchQuery("");
      setFolderSearchQuery("");
      setTagSearchQuery("");
    }
  }, [menuOpen]);

  const openScopeSubmenu = (next: FilterScopeSubmenuId | null) => {
    setOpenSubmenu(next);
    if (next !== "vaults") {
      setVaultSearchQuery("");
    }
    if (next !== "folders") {
      setFolderSearchQuery("");
    }
    if (next !== "tags") {
      setTagSearchQuery("");
    }
  };

  const flatFolders = useMemo(() => flattenWorkspaceFolders(folderTree), [folderTree]);

  const filteredVaults = useMemo(() => {
    const query = vaultSearchQuery.trim().toLowerCase();
    if (!query) {
      return vaults;
    }
    return vaults.filter((vault) => vault.name.toLowerCase().includes(query));
  }, [vaultSearchQuery, vaults]);

  const filteredFolders = useMemo(() => {
    const query = folderSearchQuery.trim().toLowerCase();
    if (!query) {
      return flatFolders;
    }
    return flatFolders.filter((folder) => folder.path.toLowerCase().includes(query));
  }, [flatFolders, folderSearchQuery]);

  const categoryItems = useMemo(() => categoriesWithRecords(records), [records]);
  const allTags = useMemo(() => collectUniqueTags(records), [records]);
  const filteredTags = useMemo(() => {
    const query = tagSearchQuery.trim().toLowerCase();
    if (!query) {
      return allTags;
    }
    return allTags.filter((tag) => tag.toLowerCase().includes(query));
  }, [allTags, tagSearchQuery]);

  return (
    <>
      <DropdownMenuSeparator className="mx-1 my-1" />

      <FilterScopeSubmenu
        id="vaults"
        openSubmenu={openSubmenu}
        onOpenSubmenuChange={openScopeSubmenu}
        contentClassName="min-w-[14rem] p-0"
        trigger={
          <>
            <FilterVaultsIcon className="size-4 shrink-0 text-foreground" />
            <span className="min-w-0 flex-1 truncate text-left">{t("web.items.filter.vaults")}</span>
            <FilterChevronRightIcon className="ml-auto size-4 text-muted-foreground" />
          </>
        }
      >
        <FilterScopeSearchPanel
          searchQuery={vaultSearchQuery}
          onSearchQueryChange={setVaultSearchQuery}
          placeholder={t("web.newItemPopup.vaultSearch")}
        >
          {filteredVaults.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">{t("web.newItemPopup.vaultSearchEmpty")}</div>
          ) : (
            filteredVaults.map((vault) => (
              <DropdownMenuItem
                key={vault.id}
                className={cn(filterScopeMenuItemClassName, filterScopeMenuItemActiveClassName(vault.id === activeVaultId))}
                onSelect={() => onNavigateTo(itemsPathWithVaultMerged(searchParams, vault.id))}
              >
                <span className="flex size-4 shrink-0 items-center justify-center text-[14px] leading-none" aria-hidden>
                  {vaultDisplayIcon(vault)}
                </span>
                <span className="min-w-0 flex-1 truncate text-left">{vault.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </FilterScopeSearchPanel>
      </FilterScopeSubmenu>

      <FilterScopeSubmenu
        id="folders"
        openSubmenu={openSubmenu}
        onOpenSubmenuChange={openScopeSubmenu}
        contentClassName="min-w-[16rem] p-0"
        trigger={
          <>
            <FilterFoldersIcon />
            <span className="min-w-0 flex-1 truncate text-left">{t("web.items.filter.folders")}</span>
            <FilterChevronRightIcon className="ml-auto size-4 text-muted-foreground" />
          </>
        }
      >
        <FilterScopeSearchPanel
          searchQuery={folderSearchQuery}
          onSearchQueryChange={setFolderSearchQuery}
          placeholder={t("web.newItemPopup.folderSearch")}
        >
          {filteredFolders.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">{t("web.newItemPopup.folderSearchEmpty")}</div>
          ) : (
            filteredFolders.map((folder) => (
              <DropdownMenuItem
                key={folder.id}
                className={cn(filterScopeMenuItemClassName, filterScopeMenuItemActiveClassName(folder.id === activeFolderId))}
                onSelect={() => onNavigateTo(itemsPathWithFolderMerged(searchParams, folder.id))}
              >
                <FilterFoldersIcon />
                <span className="min-w-0 flex-1 truncate text-left">{folder.path}</span>
              </DropdownMenuItem>
            ))
          )}
        </FilterScopeSearchPanel>
      </FilterScopeSubmenu>

      <FilterScopeSubmenu
        id="categories"
        openSubmenu={openSubmenu}
        onOpenSubmenuChange={openScopeSubmenu}
        contentClassName="min-w-[14rem] p-0"
        trigger={
          <>
            <FilterCategoriesIcon className="size-4 shrink-0 text-foreground" />
            <span className="min-w-0 flex-1 truncate text-left">{t("web.items.filter.categories")}</span>
            <FilterChevronRightIcon className="ml-auto size-4 text-muted-foreground" />
          </>
        }
      >
        <ScrollArea className="max-h-[360px]">
          <div className="p-1">
            {categoryItems.length === 0 ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">{t("web.items.filter.categoriesEmpty")}</div>
            ) : (
              categoryItems.map((category) => (
                <DropdownMenuItem
                  key={category.id}
                  className={cn(
                    filterScopeMenuItemClassName,
                    filterScopeMenuItemActiveClassName(category.id === activeCategoryId),
                  )}
                  onSelect={() => onPickCategory(category.id)}
                >
                  <CategoryIconBadge categoryId={category.id} iconColor={category.iconColor} size={24} />
                  <span className="min-w-0 flex-1 truncate text-left">{t(category.labelKey)}</span>
                </DropdownMenuItem>
              ))
            )}
          </div>
        </ScrollArea>
      </FilterScopeSubmenu>

      <FilterScopeSubmenu
        id="tags"
        openSubmenu={openSubmenu}
        onOpenSubmenuChange={openScopeSubmenu}
        contentClassName="min-w-[14rem] p-0"
        trigger={
          <>
            <FilterTagsIcon className="size-4 shrink-0 text-foreground" />
            <span className="min-w-0 flex-1 truncate text-left">{t("web.items.filter.tags")}</span>
            <FilterChevronRightIcon className="ml-auto size-4 text-muted-foreground" />
          </>
        }
      >
        <FilterScopeSearchPanel
          searchQuery={tagSearchQuery}
          onSearchQueryChange={setTagSearchQuery}
          placeholder={t("web.items.filter.tagSearch")}
        >
          {filteredTags.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">{t("web.items.filter.tagSearchEmpty")}</div>
          ) : (
            filteredTags.map((tag) => (
              <DropdownMenuItem
                key={tag}
                className={filterScopeMenuItemClassName}
                onSelect={() => onPickTag(tag)}
              >
                <FilterTagsIcon className="size-4 shrink-0 text-foreground" />
                <span className="min-w-0 flex-1 truncate text-left">{tag}</span>
              </DropdownMenuItem>
            ))
          )}
        </FilterScopeSearchPanel>
      </FilterScopeSubmenu>
    </>
  );
}

export function getActiveCategoryLabel(
  categoryId: string,
  t: (messageKey: string, values?: WebMessageValues) => string,
): string | undefined {
  const definition = getItemCategoryDefinition(categoryId);
  return definition ? t(definition.labelKey) : undefined;
}
