import {
  Button,
  ChevronDownGlyph,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FilterIconAllRecords,
  FilterIconArchived,
  FilterIconDeleted,
  FilterIconFavorites,
  FilterIconFrame,
  FilterIconMonitoring,
  FolderClosedGlyph,
  KeyFieldCopyIcon,
  ScrollArea,
  SearchGlyph,
  SidebarGroupLabel,
  Skeleton,
  SortIconAlphaAsc,
  SortIconAlphaDesc,
  SortIconNewestFirst,
  SortIconOldestFirst,
  Spinner,
  mutedSurfaceHoverBgClassName,
  mutedSurfaceHoverBgImportantClassName,
  mutedSurfaceOpenBgClassName,
  mutedSurfaceOpenBgImportantClassName,
  sortIconForValue,
  type OkkeySidebarFolderTreeNode,
} from "@okkey/ui";
import type { WebLocale } from "@okkey/i18n";
import { useEffect, useMemo, useRef, useState, type ReactNode, type SVGProps } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useLocale } from "../../locale/LocaleContext";
import { useWorkspaceFolders } from "../../folders/WorkspaceFoldersContext";
import { findWorkspaceFolderPathById } from "../../folders/workspaceFolderTree";
import { useRadixScrollAreaScrolled, useRadixScrollAreaScrollEdges } from "../../hooks/useRadixScrollAreaScrolled";
import ListScrollSentinel from "../../lists/ListScrollSentinel";
import { useListWindow } from "../../lists/useListWindow";
import { windowListSections } from "../../lists/windowListSections";
import { formatTagSearchQuery, parseTagSearchNeedle, scoreItemsListRecordSearch } from "../../items/workspaceItemSearch";
import { LazyItemRecordFavicon } from "../items/ItemRecordFavicon";
import DeleteItemsConfirmPopup from "../items/DeleteItemsConfirmPopup";
import { vaultDisplayIcon } from "./settings/vaults/vaultIcons";
import { getItemCategoryDefinition, isItemCategoryId, itemCategoryIdToPopupSlug } from "../items/itemCategoryCatalog";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import { useWorkspaceVaultProfiles } from "../../items/WorkspaceVaultProfilesContext";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { useSectionReauth } from "../../auth/SectionReauthContext";
import { useItemFaviconAttachmentUrl } from "../../items/useItemFaviconAttachmentUrl";
import { useResolvedVaultEncryptionKey } from "../../items/useResolvedVaultEncryptionKey";
import { EDIT_ITEM_POPUP_ID, NEW_CAPSULE_POPUP_ID, NEW_ITEM_POPUP_ID, buildPopupQueryValue, popupQuerySearch } from "../../routes/popupQuery";
import { stickyHeaderShadowClassName, stickyHeaderSurfaceClassName, stickyFooterShadowClassName, stickyFooterSurfaceClassName } from "./stickyHeaderShadow";
import {
  getActiveCategoryLabel,
  CategoryIconBadge,
  FilterTagsIcon,
  ItemsListFilterScopeSubmenus,
  ScopeRowCloseButton,
} from "@okkey/vault-ui";
import {
  applyWorkspaceSearchToParams,
  FILTER_QUERY_ARCHIVED,
  FILTER_QUERY_COMPROMISED,
  FILTER_QUERY_DELETED,
  FILTER_QUERY_FAVOURITES,
  FILTER_QUERY_MEDIUM,
  FILTER_QUERY_PARAM,
  FILTER_QUERY_PASSKEY_GAP,
  FILTER_QUERY_REUSED,
  FILTER_QUERY_STALE,
  FILTER_QUERY_STRONG,
  FILTER_QUERY_TWO_FACTOR_GAP,
  FILTER_QUERY_WEAK,
  FOLDER_QUERY_PARAM,
  CATEGORY_QUERY_PARAM,
  ITEM_QUERY_PARAM,
  SEARCH_QUERY_PARAM,
  SORT_QUERY_ALPH_ASC,
  SORT_QUERY_ALPH_DESC,
  SORT_QUERY_DATE_ASC,
  SORT_QUERY_DATE_DESC,
  SORT_QUERY_PARAM,
  VAULT_KIND_QUERY_PARAM,
  VAULT_QUERY_PARAM,
  WORKSPACE_QUERY_PARAM,
  isItemsVaultKind,
  itemsPathWithCategoryMerged,
  itemsPathWithFolderMerged,
  itemsPathWithVaultMerged,
  withoutOpenItemQueryParam,
  type ItemsVaultKind,
} from "../../routes/paths";
import { monitoringIssueItemIds } from "../../monitoring/analytics";
import { useMonitoringReport } from "../../monitoring/useMonitoringReport";

const itemsPanelSelectTriggerClassName = cn(
  "h-9 min-h-9 rounded-lg border-0 bg-slate-100 shadow-none dark:bg-muted",
  "px-2 text-sm text-foreground",
  mutedSurfaceHoverBgClassName,
  "focus:border-transparent focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)] focus-visible:border-transparent",
  mutedSurfaceOpenBgClassName,
  "data-[state=open]:border-transparent data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)]",
);

export type ItemsListRecordWire = {
  id: string;
  vaultId?: string;
  vaultSlot?: number;
  folderId?: string | null;
  categoryId?: string;
  urls: string[];
  title: string;
  description: string;
  tags?: string[];
  date: string;
  favorite?: boolean;
  archived?: boolean;
  deleted?: boolean;
};

export type ItemsListRecord = {
  id: string;
  vaultId: string;
  folderId: string | null;
  categoryId: string;
  urls: string[];
  faviconId?: string;
  title: string;
  description: string;
  tags: string[];
  date: Date;
  favorite: boolean;
  archived: boolean;
  deleted: boolean;
  deletedAtMs?: number;
};

function filterRowsByVault(
  rows: readonly ItemsListRecord[],
  vaultId: string,
): ItemsListRecord[] {
  if (!vaultId) {
    return [...rows];
  }
  return rows.filter((row) => row.vaultId === vaultId);
}

function filterRowsByVaultIds(
  rows: readonly ItemsListRecord[],
  vaultIds: ReadonlySet<string> | undefined,
): ItemsListRecord[] {
  if (!vaultIds) {
    return [...rows];
  }
  return rows.filter((row) => vaultIds.has(row.vaultId));
}

function resolveVaultIdsForKind(
  vaults: readonly ItemsListPaneVault[],
  kind: ItemsVaultKind | null,
): ReadonlySet<string> | undefined {
  if (!kind) {
    return undefined;
  }
  return new Set(
    vaults
      .filter((vault) => (kind === "personal" ? vault.isPersonal : !vault.isPersonal))
      .map((vault) => vault.id),
  );
}

function filterRowsByFolder(rows: readonly ItemsListRecord[], folderId: string): ItemsListRecord[] {
  if (!folderId) {
    return [...rows];
  }
  return rows.filter((r) => r.folderId === folderId);
}

function filterRowsByCategory(rows: readonly ItemsListRecord[], categoryId: string): ItemsListRecord[] {
  if (!categoryId) {
    return [...rows];
  }
  return rows.filter((row) => row.categoryId === categoryId);
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

function IconCapsule16({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path
        d="M6.33333 2.66667C7.23949 1.76051 8.4685 1.25144 9.75 1.25144C11.0315 1.25144 12.2605 1.76051 13.1667 2.66667C14.0728 3.57282 14.5819 4.80184 14.5819 6.08333C14.5819 7.36483 14.0728 8.59384 13.1667 9.5L9.75 12.9167C8.84384 13.8228 7.61483 14.3319 6.33333 14.3319C5.05183 14.3319 3.82282 13.8228 2.91667 12.9167C2.01051 12.0105 1.50144 10.7815 1.50144 9.5C1.50144 8.2185 2.01051 6.98949 2.91667 6.08333L6.33333 2.66667Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="4.85355" y1="4.14645" x2="11.8536" y2="11.1464" stroke="currentColor" />
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

export type ItemsListFilter =
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
export type ItemsListSort = "name_asc" | "name_desc" | "date_asc" | "date_desc";

function isMonitoringListFilter(
  filter: ItemsListFilter,
): filter is Extract<
  ItemsListFilter,
  "reused" | "strong" | "medium" | "weak" | "stale" | "compromised" | "2fa-gap" | "passkey-gap"
> {
  return (
    filter === "reused" ||
    filter === "strong" ||
    filter === "medium" ||
    filter === "weak" ||
    filter === "stale" ||
    filter === "compromised" ||
    filter === "2fa-gap" ||
    filter === "passkey-gap"
  );
}

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
    case "reused":
    case "strong":
    case "medium":
    case "weak":
    case "stale":
    case "compromised":
    case "2fa-gap":
    case "passkey-gap":
      return <FilterIconMonitoring className={c} />;
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
    case "reused":
    case "strong":
    case "medium":
    case "weak":
    case "stale":
    case "compromised":
    case "2fa-gap":
    case "passkey-gap":
      return <FilterIconMonitoring className={c} />;
    case "all":
      return null;
    default: {
      const _ex: never = filter;
      return _ex;
    }
  }
}

function monitoringFilterLabelKey(filter: ItemsListFilter): string {
  switch (filter) {
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
    default:
      return `web.items.filter.${filter === "recently_deleted" ? "recentlyDeleted" : filter}`;
  }
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
  if (x === FILTER_QUERY_REUSED) {
    return "reused";
  }
  if (x === FILTER_QUERY_STRONG) {
    return "strong";
  }
  if (x === FILTER_QUERY_MEDIUM) {
    return "medium";
  }
  if (x === FILTER_QUERY_WEAK) {
    return "weak";
  }
  if (x === FILTER_QUERY_STALE) {
    return "stale";
  }
  if (x === FILTER_QUERY_COMPROMISED) {
    return "compromised";
  }
  if (x === FILTER_QUERY_TWO_FACTOR_GAP) {
    return "2fa-gap";
  }
  if (x === FILTER_QUERY_PASSKEY_GAP) {
    return "passkey-gap";
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
    case "reused":
      return FILTER_QUERY_REUSED;
    case "strong":
      return FILTER_QUERY_STRONG;
    case "medium":
      return FILTER_QUERY_MEDIUM;
    case "weak":
      return FILTER_QUERY_WEAK;
    case "stale":
      return FILTER_QUERY_STALE;
    case "compromised":
      return FILTER_QUERY_COMPROMISED;
    case "2fa-gap":
      return FILTER_QUERY_TWO_FACTOR_GAP;
    case "passkey-gap":
      return FILTER_QUERY_PASSKEY_GAP;
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

function filterItems(
  items: readonly ItemsListRecord[],
  filter: ItemsListFilter,
  monitoringItemIds?: ReadonlySet<string>,
): ItemsListRecord[] {
  switch (filter) {
    case "all":
      return items.filter((r) => !r.deleted && !r.archived);
    case "favorites":
      return items.filter((r) => !r.deleted && !r.archived && r.favorite);
    case "archived":
      return items.filter((r) => !r.deleted && r.archived);
    case "recently_deleted":
      return items.filter((r) => r.deleted);
    case "reused":
    case "strong":
    case "medium":
    case "weak":
    case "stale":
    case "compromised":
    case "2fa-gap":
    case "passkey-gap":
      return items.filter((r) => !r.deleted && !r.archived && (monitoringItemIds?.has(r.id) ?? false));
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

export type ItemsListPaneVault = { id: string; name: string; isPersonal: boolean; icon?: string };

const ITEMS_LIST_SKELETON_ROW_WIDTHS = [
  { title: "w-28", subtitle: "w-40" },
  { title: "w-36", subtitle: "w-24" },
  { title: "w-24", subtitle: "w-44" },
  { title: "w-32", subtitle: "w-28" },
  { title: "w-40", subtitle: "w-36" },
] as const;

function ItemsListRecordsSkeleton({ label }: { label: string }) {
  return (
    <div className="pt-2" role="status" aria-busy="true" aria-label={label}>
      <section className="pb-2">
        <div className="px-5 py-2">
          <Skeleton className="h-5 w-24" />
        </div>
        <ul className="flex flex-col gap-0 px-2" role="presentation">
          {ITEMS_LIST_SKELETON_ROW_WIDTHS.map((widths, index) => (
            <li key={index}>
              <div className="flex h-[60px] w-full items-center gap-4 rounded-lg px-3">
                <Skeleton className="size-8 shrink-0 rounded-md" />
                <span className="flex min-h-10 min-w-0 flex-1 flex-col justify-center gap-1">
                  <Skeleton className={cn("h-5 max-w-[55%]", widths.title)} />
                  <Skeleton className={cn("h-5 max-w-[70%]", widths.subtitle)} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ItemsListRecordFavicon({
  row,
}: {
  row: ItemsListRecord;
  vaults: readonly ItemsListPaneVault[];
}) {
  const { accessToken } = useAuthVault();
  const itemEncryptionKey = useResolvedVaultEncryptionKey(row.vaultId);
  const faviconUrl = useItemFaviconAttachmentUrl({
    accessToken,
    vaultKey: itemEncryptionKey,
    vaultId: row.vaultId,
    itemId: row.id,
    faviconId: row.faviconId,
    enabled: Boolean(itemEncryptionKey),
  });

  return (
    <LazyItemRecordFavicon
      categoryId={row.categoryId}
      title={row.title}
      faviconId={row.faviconId}
      previewImageSrc={faviconUrl.imageSrc}
      previewLoading={faviconUrl.loading}
      size={32}
      className="shrink-0 bg-background"
    />
  );
}

type ItemsListLeftPaneProps = {
  vaults: readonly ItemsListPaneVault[];
  folderTree: readonly OkkeySidebarFolderTreeNode[];
  records: readonly ItemsListRecord[];
  /** False until the workspace vault list has been fetched at least once (avoids vault ID flash in the filter trigger). */
  itemsListVaultsLoaded?: boolean;
  /** False until workspace folder sync bootstrap completes (avoids folder ID flash in the filter trigger). */
  itemsListFoldersLoaded?: boolean;
  /** False until workspace item sync bootstrap completes. */
  itemsListRecordsLoaded?: boolean;
  monitoringCardSettings?: import("@okkey/types").WorkspaceMonitoringCardSettings;
};

export default function ItemsListLeftPane({
  vaults,
  folderTree,
  records,
  itemsListVaultsLoaded = true,
  itemsListFoldersLoaded = true,
  itemsListRecordsLoaded = true,
  monitoringCardSettings,
}: ItemsListLeftPaneProps) {
  const { locale, t } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const { requestZoneUnlock } = useSectionReauth();
  const { setItemFavorite, setItemsFavorite } = useWorkspaceFolders();
  const {
    setItemArchived,
    setItemsArchived,
    setItemDeleted,
    setItemsDeleted,
    deletedItemsRetentionDays,
    getItemCreatedByUserId,
  } = useWorkspaceItems();
  const { canPutItem, canDeleteItem, canUseFunction } = useWorkspaceVaultProfiles();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceId = searchParams.get(WORKSPACE_QUERY_PARAM)?.trim() ?? "";
  const vaultQ = searchParams.get(VAULT_QUERY_PARAM)?.trim() ?? "";
  const vaultKindRaw = searchParams.get(VAULT_KIND_QUERY_PARAM)?.trim() ?? "";
  const vaultKind: ItemsVaultKind | null = isItemsVaultKind(vaultKindRaw) ? vaultKindRaw : null;
  const vaultsScopeKey = useMemo(
    () => vaults.map((vault) => `${vault.id}:${vault.isPersonal ? "1" : "0"}`).join("|"),
    [vaults],
  );
  const vaultKindIds = useMemo(() => {
    if (vaultQ || !vaultKind) {
      return undefined;
    }
    return resolveVaultIdsForKind(vaults, vaultKind);
    // vaultsScopeKey gates identity churn of the `vaults` array from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by vaultsScopeKey
  }, [vaultQ, vaultKind, vaultsScopeKey]);
  const monitoringVaultIds = useMemo(() => {
    if (vaultKindIds) {
      return vaultKindIds;
    }
    if (vaultQ) {
      return new Set([vaultQ]);
    }
    return undefined;
  }, [vaultKindIds, vaultQ]);
  const monitoringReport = useMonitoringReport(workspaceId, {
    enabledCards: monitoringCardSettings,
    vaultIds: monitoringVaultIds,
  });
  const activeItemId = searchParams.get(ITEM_QUERY_PARAM)?.trim() ?? "";
  const folderQ = searchParams.get(FOLDER_QUERY_PARAM)?.trim() ?? "";
  const categoryQ = searchParams.get(CATEGORY_QUERY_PARAM)?.trim() ?? "";
  const filter = filterFromSearchParam(searchParams.get(FILTER_QUERY_PARAM) ?? "");
  const sort = sortFromSearchParam(searchParams.get(SORT_QUERY_PARAM) ?? "");
  const searchQ = searchParams.get(SEARCH_QUERY_PARAM)?.trim() ?? "";

  const monitoringItemIds = useMemo(() => {
    if (!isMonitoringListFilter(filter)) {
      return undefined;
    }
    return new Set(monitoringIssueItemIds(monitoringReport.report, filter));
  }, [filter, monitoringReport.report]);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [bulkActionsMenuOpen, setBulkActionsMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: "single"; row: ItemsListRecord } | { kind: "bulk" } | null>(
    null,
  );

  const vaultMeta = vaultQ ? vaults.find((v) => v.id === vaultQ) : undefined;
  const folderPath = folderQ ? findWorkspaceFolderPathById(folderTree, folderQ) : "";
  const folderScopeLoading = Boolean(folderQ && !itemsListFoldersLoaded && !folderPath);
  const folderTitle = folderPath || (folderScopeLoading ? "" : folderQ);
  const categoryLabel = categoryQ ? getActiveCategoryLabel(categoryQ, t) : undefined;
  const categoryDefinition = categoryQ ? getItemCategoryDefinition(categoryQ) : undefined;

  const categoryScopeActive = Boolean(categoryQ && categoryDefinition && !searchQ && !vaultQ && !vaultKind && !folderQ);
  const tagSearchActive = Boolean(searchQ && parseTagSearchNeedle(searchQ) !== null);
  const searchScopeLabel = tagSearchActive ? (parseTagSearchNeedle(searchQ) ?? searchQ) : searchQ;
  const hasListScope = Boolean(searchQ || vaultQ || vaultKind || folderQ || categoryQ);
  const monitoringFilterActive = isMonitoringListFilter(filter);
  const secondaryFilterInTrigger =
    hasListScope && filterToSearchParam(filter) !== null && !monitoringFilterActive;
  const categoryWithSecondaryFilter = categoryScopeActive && secondaryFilterInTrigger;
  const vaultScopeLoading = Boolean(vaultQ && !itemsListVaultsLoaded && !vaultMeta);
  const vaultKindScopeLoading = Boolean(vaultKind && !itemsListVaultsLoaded);
  const scopeTriggerLoading = vaultScopeLoading || vaultKindScopeLoading || folderScopeLoading;

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
        n.delete(VAULT_KIND_QUERY_PARAM);
        n.delete(FOLDER_QUERY_PARAM);
        n.delete(CATEGORY_QUERY_PARAM);
        n.delete(SEARCH_QUERY_PARAM);
        n.delete(FILTER_QUERY_PARAM);
        return n;
      },
      { replace: true },
    );
    setFilterMenuOpen(false);
  };

  const navigateToItemsPath = (to: string) => {
    navigate(to, { replace: true });
    setFilterMenuOpen(false);
  };

  const pickVault = (vaultId: string) => {
    navigateToItemsPath(itemsPathWithVaultMerged(searchParams, vaultId));
  };

  const pickFolder = (folderId: string) => {
    navigateToItemsPath(itemsPathWithFolderMerged(searchParams, folderId));
  };

  const pickCategory = (categoryId: string) => {
    navigateToItemsPath(itemsPathWithCategoryMerged(searchParams, categoryId));
  };

  const pickTag = (tag: string) => {
    setSearchParams((prev) => applyWorkspaceSearchToParams(prev, formatTagSearchQuery(tag)), { replace: true });
    setFilterMenuOpen(false);
  };

  const sections = useMemo(() => {
    const searchTrim = searchQ.trim();
    let pool: ItemsListRecord[];
    if (searchTrim) {
      pool = records.filter((r) => scoreItemsListRecordSearch(r, searchTrim) > 0);
    } else if (categoryQ) {
      pool = filterRowsByCategory(records, categoryQ);
    } else {
      const inVault = vaultQ
        ? filterRowsByVault(records, vaultQ)
        : filterRowsByVaultIds(records, vaultKindIds);
      pool = filterRowsByFolder(inVault, folderQ);
    }
    const filtered = filterItems(pool, filter, monitoringItemIds);
    const sorted = searchTrim
      ? [...filtered].sort((a, b) => {
          const ds = scoreItemsListRecordSearch(b, searchTrim) - scoreItemsListRecordSearch(a, searchTrim);
          if (ds !== 0) {
            return ds;
          }
          return compareTwoItemsSort(a, b, sort);
        })
      : sortItems(filtered, sort);
    return buildSections(sorted, sort, locale);
  }, [
    categoryQ,
    filter,
    sort,
    locale,
    vaultQ,
    vaultKindIds,
    folderQ,
    records,
    searchQ,
    monitoringItemIds,
  ]);

  const totalRows = useMemo(() => sections.reduce((n, s) => n + s.rows.length, 0), [sections]);
  /** Scope/filter/sort/search only — never active item (Q1: no deep-link list expand). */
  const listWindowResetKey = [
    workspaceId,
    filter,
    sort,
    searchQ,
    vaultQ,
    vaultKind ?? "",
    folderQ,
    categoryQ,
  ].join("|");
  const { visibleCount, hasMore: listHasMore, loadMore: loadMoreListRows } = useListWindow({
    total: totalRows,
    resetKey: listWindowResetKey,
  });
  const visibleSections = useMemo(
    () => windowListSections(sections, visibleCount),
    [sections, visibleCount],
  );
  const listLoading =
    !itemsListRecordsLoaded ||
    Boolean(vaultKind && !itemsListVaultsLoaded) ||
    Boolean(vaultQ && !itemsListVaultsLoaded && !vaultMeta) ||
    Boolean(folderQ && !itemsListFoldersLoaded && !folderPath) ||
    (monitoringFilterActive && monitoringReport.loading);
  const selectedRows = useMemo(() => records.filter((row) => selectedIds.has(row.id)), [records, selectedIds]);

  const rowActionPermits = (row: ItemsListRecord) => {
    const createdBy = getItemCreatedByUserId(row.id);
    return {
      canEdit: canPutItem(row.vaultId, createdBy),
      canCopy: canUseFunction(row.vaultId, "save_to_personal"),
      canFavorite: canUseFunction(row.vaultId, "favorite"),
      canCreateCapsule: canUseFunction(row.vaultId, "create_capsules"),
      canArchive: canUseFunction(row.vaultId, "archive"),
      canDelete: canDeleteItem(row.vaultId, createdBy),
    };
  };

  const selectedActions = useMemo(() => {
    const rowsWithPermits = selectedRows.map((row) => ({ row, ...rowActionPermits(row) }));
    return {
      canFavorite: rowsWithPermits.some(
        ({ row, canFavorite }) => canFavorite && !row.favorite && !row.archived && !row.deleted,
      ),
      canUnfavorite: rowsWithPermits.some(
        ({ row, canFavorite }) => canFavorite && row.favorite && !row.archived && !row.deleted,
      ),
      canArchive: rowsWithPermits.some(
        ({ row, canArchive }) => canArchive && !row.archived && !row.deleted,
      ),
      canUnarchive: rowsWithPermits.some(
        ({ row, canArchive }) => canArchive && row.archived && !row.deleted,
      ),
      canDelete: rowsWithPermits.some(({ row, canDelete }) => canDelete && !row.deleted),
      canRestore: rowsWithPermits.some(({ row, canDelete }) => canDelete && row.deleted),
    };
  }, [selectedRows, canPutItem, canDeleteItem, canUseFunction, getItemCreatedByUserId]);

  useEffect(() => {
    if (selectionMode && selectedIds.size === 0) {
      setSelectionMode(false);
    }
  }, [selectionMode, selectedIds]);

  const exitSelectionMode = () => {
    setBulkActionsMenuOpen(false);
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const finishBulkSelection = async (action: () => Promise<void>) => {
    try {
      await action();
    } finally {
      exitSelectionMode();
    }
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

  const favoriteSelectedItems = (favorite: boolean) => {
    const itemIds = selectedRows
      .filter((row) => {
        const permits = rowActionPermits(row);
        return permits.canFavorite && !row.archived && !row.deleted && row.favorite !== favorite;
      })
      .map((row) => row.id);
    if (!itemIds.length) {
      return;
    }
    void finishBulkSelection(() => setItemsFavorite(itemIds, favorite));
  };

  const archiveRow = (row: ItemsListRecord, archived: boolean) => {
    if (row.deleted || !rowActionPermits(row).canArchive) {
      return;
    }
    void (async () => {
      await setItemArchived(row.id, archived);
      if (archived && row.favorite) {
        await setItemFavorite(row.id, false);
      }
    })();
  };

  const deleteRow = (row: ItemsListRecord, deleted: boolean) => {
    void (async () => {
      await setItemDeleted(row.id, deleted);
      if (deleted) {
        setSearchParams((prev) => withoutOpenItemQueryParam(prev, [row.id]), { replace: true });
        if (row.favorite) {
          await setItemFavorite(row.id, false);
        }
        if (row.archived) {
          await setItemArchived(row.id, false);
        }
      }
    })();
  };

  const requestDeleteRow = (row: ItemsListRecord) => {
    if (!rowActionPermits(row).canDelete) {
      return;
    }
    if (row.deleted) {
      deleteRow(row, false);
      return;
    }
    setDeleteConfirm({ kind: "single", row });
  };

  const requestDeleteSelectedItems = () => {
    const rows = selectedRows.filter((row) => rowActionPermits(row).canDelete && !row.deleted);
    if (!rows.length) {
      return;
    }
    setDeleteConfirm({ kind: "bulk" });
  };

  const confirmPendingDelete = () => {
    if (!deleteConfirm) {
      return;
    }
    void (async () => {
      if (!(await requestZoneUnlock("deletion", { persist: false }))) {
        return;
      }
      if (deleteConfirm.kind === "single") {
        deleteRow(deleteConfirm.row, true);
      } else {
        deleteSelectedItems(true);
      }
      setDeleteConfirm(null);
    })();
  };

  const archiveSelectedItems = (archived: boolean) => {
    const rows = selectedRows.filter((row) => {
      const permits = rowActionPermits(row);
      return permits.canArchive && row.archived !== archived;
    });
    const itemIds = rows.map((row) => row.id);
    if (!itemIds.length) {
      return;
    }
    void finishBulkSelection(async () => {
      await setItemsArchived(itemIds, archived);
      if (archived) {
        const favoriteIds = rows.filter((row) => row.favorite).map((row) => row.id);
        if (favoriteIds.length) {
          await setItemsFavorite(favoriteIds, false);
        }
      }
    });
  };

  const deleteSelectedItems = (deleted: boolean) => {
    const rows = selectedRows.filter((row) => {
      const permits = rowActionPermits(row);
      return permits.canDelete && row.deleted !== deleted;
    });
    const itemIds = rows.map((row) => row.id);
    if (!itemIds.length) {
      return;
    }
    void finishBulkSelection(async () => {
      await setItemsDeleted(itemIds, deleted);
      if (deleted) {
        setSearchParams((prev) => withoutOpenItemQueryParam(prev, itemIds), { replace: true });
        const favoriteIds = rows.filter((row) => row.favorite).map((row) => row.id);
        if (favoriteIds.length) {
          await setItemsFavorite(favoriteIds, false);
        }
        const archivedIds = rows.filter((row) => row.archived).map((row) => row.id);
        if (archivedIds.length) {
          await setItemsArchived(archivedIds, false);
        }
      }
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

  const openEditPopup = (itemId: string) => {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(EDIT_ITEM_POPUP_ID, itemId)),
        hash: location.hash,
      },
      { replace: false },
    );
  };

  const openCopyPopup = (row: ItemsListRecord) => {
    if (!isItemCategoryId(row.categoryId)) {
      return;
    }
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(NEW_ITEM_POPUP_ID, itemCategoryIdToPopupSlug(row.categoryId)), {
          copyFromItemId: row.id,
        }),
        hash: location.hash,
      },
      { replace: false },
    );
  };

  const openCapsulePopup = (itemId: string) => {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, NEW_CAPSULE_POPUP_ID, {
          capsuleFromItemId: itemId,
        }),
        hash: location.hash,
      },
      { replace: false },
    );
  };

  const listScrollRef = useRef<HTMLDivElement>(null);
  const listHeaderScrolled = useRadixScrollAreaScrolled(listScrollRef);
  const listScrollEdges = useRadixScrollAreaScrollEdges(listScrollRef);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea ref={listScrollRef} className="min-h-0 min-w-0 flex-1">
        <div
          className={cn(
            stickyHeaderSurfaceClassName,
            stickyHeaderShadowClassName(listHeaderScrolled),
            "border-b border-border p-2",
          )}
        >
        <div className="flex w-full items-center gap-2">
          <DropdownMenu open={filterMenuOpen} onOpenChange={setFilterMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-busy={scopeTriggerLoading}
                aria-label={t("web.items.list.filterAria")}
                className={cn(
                  itemsPanelSelectTriggerClassName,
                  "flex min-h-9 min-w-0 flex-1 cursor-default items-center justify-start gap-2 text-left outline-none",
                )}
              >
                <FilterIconFrame wide={secondaryFilterInTrigger} flush={categoryScopeActive}>
                  {monitoringFilterActive ? (
                    <FilterIconMonitoring />
                  ) : hasListScope ? (
                    <span
                      className={cn(
                        "flex items-center",
                        categoryScopeActive ? "h-full w-full" : "h-4 gap-1",
                        categoryWithSecondaryFilter && "gap-0",
                      )}
                    >
                      {searchQ ? (
                        tagSearchActive ? (
                          <FilterTagsIcon className="size-4 shrink-0 text-foreground" />
                        ) : (
                          <SearchGlyph />
                        )
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
                      ) : vaultQ ? (
                        vaultScopeLoading ? (
                          <Spinner size="small" className="size-4 shrink-0" />
                        ) : (
                          <span className="flex size-4 shrink-0 items-center justify-center leading-none" aria-hidden>
                            <span className="text-[14px] leading-none">{vaultMeta ? vaultDisplayIcon(vaultMeta) : "💼"}</span>
                          </span>
                        )
                      ) : vaultKind ? (
                        vaultKindScopeLoading ? (
                          <Spinner size="small" className="size-4 shrink-0" />
                        ) : (
                          <span className="flex size-4 shrink-0 items-center justify-center leading-none" aria-hidden>
                            <span className="text-[14px] leading-none">
                              {vaultDisplayIcon({ isPersonal: vaultKind === "personal" })}
                            </span>
                          </span>
                        )
                      ) : folderQ ? (
                        folderScopeLoading ? (
                          <Spinner size="small" className="size-4 shrink-0" />
                        ) : (
                          <FolderClosedGlyph />
                        )
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
                  {monitoringFilterActive
                    ? t(monitoringFilterLabelKey(filter))
                    : searchQ
                      ? searchScopeLabel
                      : vaultQ
                        ? vaultScopeLoading
                          ? null
                          : (vaultMeta?.name ?? vaultQ)
                        : vaultKind
                          ? vaultKindScopeLoading
                            ? null
                            : t(`web.monitoring.vaultScope.${vaultKind}`)
                          : folderQ
                            ? folderScopeLoading
                              ? null
                              : folderTitle
                            : categoryQ
                              ? (categoryLabel ?? categoryQ)
                              : t(
                                  `web.items.filter.${
                                    filter === "recently_deleted"
                                      ? "recentlyDeleted"
                                      : filter
                                  }`,
                                )}
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
                    {tagSearchActive ? (
                      <FilterTagsIcon className="size-4 shrink-0 text-foreground" />
                    ) : (
                      <SearchGlyph className="size-4 shrink-0 text-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-left">{searchScopeLabel}</span>
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
                      {vaultMeta ? vaultDisplayIcon(vaultMeta) : "💼"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">{vaultMeta?.name ?? vaultQ}</span>
                    <ScopeRowCloseButton locale={locale} onClear={clearWorkspaceScopeFromUrl} />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="mx-1 my-1" />
                </>
              ) : null}
              {!vaultQ && vaultKind ? (
                <>
                  <DropdownMenuItem
                    className={cn(
                      "relative gap-2 whitespace-nowrap py-2 ps-2 pe-7",
                      "bg-muted/80 data-[highlighted]:bg-secondary",
                    )}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="text-base leading-none" aria-hidden>
                      {vaultDisplayIcon({ isPersonal: vaultKind === "personal" })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">
                      {t(`web.monitoring.vaultScope.${vaultKind}`)}
                    </span>
                    <ScopeRowCloseButton locale={locale} onClear={clearWorkspaceScopeFromUrl} />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="mx-1 my-1" />
                </>
              ) : null}
              {!vaultQ && !vaultKind && folderQ ? (
                <>
                  <DropdownMenuItem
                    className={cn(
                      "relative gap-2 whitespace-nowrap py-2 ps-2 pe-7",
                      "bg-muted/80 data-[highlighted]:bg-secondary",
                    )}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <FolderClosedGlyph />
                    <span className="min-w-0 flex-1 truncate text-left">
                      {folderScopeLoading ? null : folderTitle}
                    </span>
                    <ScopeRowCloseButton locale={locale} onClear={clearWorkspaceScopeFromUrl} />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="mx-1 my-1" />
                </>
              ) : null}
              {!searchQ && !vaultQ && !vaultKind && !folderQ && categoryQ && categoryDefinition ? (
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
                    <span className="min-w-0 flex-1 truncate text-left">{categoryLabel ?? categoryQ}</span>
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
              <ItemsListFilterScopeSubmenus
                t={t}
                vaults={vaults}
                folderTree={folderTree}
                records={records}
                activeVaultId={vaultQ}
                activeFolderId={folderQ}
                activeCategoryId={categoryQ}
                onPickVault={pickVault}
                onPickFolder={pickFolder}
                onPickCategory={pickCategory}
                onPickTag={pickTag}
                onCloseMenu={() => setFilterMenuOpen(false)}
                menuOpen={filterMenuOpen}
              />
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

        {listLoading ? (
          <ItemsListRecordsSkeleton label={t("web.items.list.loading")} />
        ) : totalRows === 0 ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center px-4 py-10">
            <p className="okkey-body text-center text-sm text-muted-foreground">{t("web.items.list.empty")}</p>
          </div>
        ) : (
          <div className="pt-2">
            {visibleSections.map((section) => (
              <section key={section.key} className="pb-2">
                <h2 className="okkey-body px-5 py-2 text-sm font-medium text-foreground">{section.label}</h2>
                <ul className="flex flex-col gap-0 px-2" role="list">
                  {section.rows.map((row) => {
                    const rowSelected = selectedIds.has(row.id);
                    const rowActive = activeItemId === row.id;
                    const rowSubtitle = row.description.trim();
                    return (
                      <li key={row.id}>
                        <div
                          className={cn(
                            "group relative z-0 flex h-[60px] w-full items-center gap-0 rounded-lg transition-colors",
                            "hover:bg-muted/60",
                            rowActive && "z-[1] bg-muted/80 shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
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
                            className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-4 px-3 text-left"
                          >
                            <ItemsListRecordFavicon row={row} vaults={vaults} />
                            {rowSubtitle ? (
                              <span className="flex min-h-10 min-w-0 flex-1 flex-col justify-center">
                                <span className="block truncate text-sm font-medium leading-5 text-foreground">{row.title}</span>
                                <span className="block min-h-5 truncate text-sm leading-5 text-muted-foreground">{rowSubtitle}</span>
                              </span>
                            ) : (
                              <span className="min-w-0 flex-1 truncate text-sm font-medium leading-5 text-foreground">{row.title}</span>
                            )}
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
                                      mutedSurfaceHoverBgImportantClassName,
                                      "hover:text-foreground group-hover:opacity-100",
                                      "data-[state=open]:opacity-100 data-[state=open]:text-foreground",
                                      mutedSurfaceOpenBgImportantClassName,
                                    )}
                                    aria-label={t("web.items.list.rowMenuAria")}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreVerticalIcon />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52 p-1">
                                  {(() => {
                                    const permits = rowActionPermits(row);
                                    const showPrimaryActions = !row.archived && !row.deleted;
                                    const showEdit = showPrimaryActions && permits.canEdit;
                                    const showCopy = showPrimaryActions && permits.canCopy;
                                    const showFavorite = showPrimaryActions && permits.canFavorite;
                                    const showCapsule = showPrimaryActions && permits.canCreateCapsule;
                                    const showPrimaryGroup = showEdit || showCopy || showFavorite || showCapsule;
                                    const showArchive = !row.deleted && permits.canArchive;
                                    const showDelete = permits.canDelete;
                                    return (
                                      <>
                                        {showPrimaryGroup ? (
                                          <>
                                            {showEdit ? (
                                              <DropdownMenuItem className="gap-2" onSelect={() => openEditPopup(row.id)}>
                                                <IconEdit16 />
                                                <span>{t("web.items.menu.edit")}</span>
                                              </DropdownMenuItem>
                                            ) : null}
                                            {showCopy ? (
                                              <DropdownMenuItem className="gap-2" onSelect={() => openCopyPopup(row)}>
                                                <KeyFieldCopyIcon className="size-4 shrink-0 text-foreground" />
                                                <span>{t("web.items.menu.copy")}</span>
                                              </DropdownMenuItem>
                                            ) : null}
                                            {showFavorite ? (
                                              <DropdownMenuItem
                                                className="gap-2"
                                                onSelect={() => {
                                                  void setItemFavorite(row.id, !row.favorite);
                                                }}
                                              >
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
                                            ) : null}
                                            {showCapsule ? (
                                              <DropdownMenuItem className="gap-2" onSelect={() => openCapsulePopup(row.id)}>
                                                <IconCapsule16 />
                                                <span>{t("web.nav.addCapsule")}</span>
                                              </DropdownMenuItem>
                                            ) : null}
                                            <DropdownMenuSeparator className="mx-1 my-1" />
                                          </>
                                        ) : null}
                                        <DropdownMenuItem className="gap-2" onSelect={() => enterSelectionModeWith(row.id)}>
                                          <IconSelect16 />
                                          <span>{t("web.items.menu.select")}</span>
                                        </DropdownMenuItem>
                                        {showArchive || showDelete ? (
                                          <DropdownMenuSeparator className="mx-1 my-1" />
                                        ) : null}
                                        {showArchive ? (
                                          <DropdownMenuItem className="gap-2" onSelect={() => archiveRow(row, !row.archived)}>
                                            {row.archived ? (
                                              <IconUnarchive16 className="text-foreground" />
                                            ) : (
                                              <FilterIconArchived className="size-4 shrink-0 text-foreground" />
                                            )}
                                            <span>
                                              {row.archived ? t("web.items.menu.unarchive") : t("web.items.menu.archive")}
                                            </span>
                                          </DropdownMenuItem>
                                        ) : null}
                                        {showDelete ? (
                                          <DropdownMenuItem
                                            className={cn(
                                              "gap-2",
                                              !row.deleted &&
                                                "text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive",
                                            )}
                                            onSelect={() => requestDeleteRow(row)}
                                          >
                                            {row.deleted ? (
                                              <IconRestore16 className="text-foreground" />
                                            ) : (
                                              <IconDelete16 />
                                            )}
                                            <span>
                                              {row.deleted ? t("web.items.menu.restore") : t("web.items.menu.delete")}
                                            </span>
                                          </DropdownMenuItem>
                                        ) : null}
                                      </>
                                    );
                                  })()}
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
            {listHasMore ? (
              <ListScrollSentinel
                scrollAreaRef={listScrollRef}
                onVisible={loadMoreListRows}
              />
            ) : null}
          </div>
        )}
      </ScrollArea>

      {selectionMode ? (
        <div
          className={cn(
            stickyFooterSurfaceClassName,
            stickyFooterShadowClassName(listScrollEdges.fromBottom),
            "flex shrink-0 items-center border-t border-border px-2 py-2",
          )}
        >
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
          <DropdownMenu open={bulkActionsMenuOpen} onOpenChange={setBulkActionsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="secondary" size="sm" className="ms-auto shrink-0 gap-2">
                {t("web.items.list.actions")}
                <IconActions16 className="size-4 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1">
              {selectedActions.canFavorite ? (
                <DropdownMenuItem className="gap-2" onSelect={() => favoriteSelectedItems(true)}>
                  <FilterIconFavorites className="size-4 shrink-0 text-foreground" />
                  <span>{t("web.items.menu.addToFavorites")}</span>
                </DropdownMenuItem>
              ) : null}
              {selectedActions.canUnfavorite ? (
                <DropdownMenuItem className="gap-2" onSelect={() => favoriteSelectedItems(false)}>
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
                <DropdownMenuItem className="gap-2" onSelect={() => archiveSelectedItems(true)}>
                  <FilterIconArchived className="size-4 shrink-0 text-foreground" />
                  <span>{t("web.items.menu.archive")}</span>
                </DropdownMenuItem>
              ) : null}
              {selectedActions.canUnarchive ? (
                <DropdownMenuItem className="gap-2" onSelect={() => archiveSelectedItems(false)}>
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
                  onSelect={() => requestDeleteSelectedItems()}
                >
                  <IconDelete16 />
                  <span>{t("web.items.menu.delete")}</span>
                </DropdownMenuItem>
              ) : null}
              {selectedActions.canRestore ? (
                <DropdownMenuItem className="gap-2" onSelect={() => deleteSelectedItems(false)}>
                  <IconRestore16 />
                  <span>{t("web.items.menu.restore")}</span>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <DeleteItemsConfirmPopup
        open={deleteConfirm !== null}
        multiple={deleteConfirm?.kind === "bulk"}
        retentionDays={deletedItemsRetentionDays}
        t={t}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmPendingDelete}
      />
    </div>
  );
}
