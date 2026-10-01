import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ForwardedRef } from "react";
import type { CoreApiClient } from "@okkey/api";
import { getWebLocaleNativeName, WEB_LOCALES, type WebLocale } from "@okkey/i18n";
import type { ItemPlaintextV2, MeVaultProfileEntryDto, Vault, Workspace } from "@okkey/types";
import {
  DEFAULT_DELETED_ITEMS_RETENTION_DAYS,
  createEmptyProfilePermissions,
  createFullAccessProfilePermissions,
  ensureProfilePermissions,
  profileAllowsEntriesDelete,
  profileAllowsFunction,
  type ProfileFunctionActionId,
  type ProfilePermitsContext,
} from "@okkey/types";
import type { UnlockWithMasterPasswordResult } from "@okkey/vault";
import {
  createWorkspaceFoldersSyncController,
  createWorkspaceVaultItemsReadController,
  findWorkspaceFolderPathById,
  formatTagSearchQuery,
  itemPlaintextToExtensionListRecord,
  refreshWorkspaceFoldersCachesForIds,
  resolveVaultItemEncryptionKey,
  scoreItemsListRecordSearch,
  toSidebarFolderTree,
  withItemArchivedState,
  withItemDeletedState,
  type ExtensionItemListRecord,
  type WorkspaceFolderNode,
  type WorkspaceFoldersSyncController,
  type WorkspaceVaultItemsReadController,
} from "@okkey/vault";
import {
  Button,
  DropdownMenuItem,
  OkkeyAppSidebar,
  OkkeyAppSidebarToolbar,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  WorkspaceLogoTile,
  WorkspaceSearchField,
  cn,
  planTierLabel,
  useOkkeyAppShellLayout,
  vaultDisplayIcon,
  workspaceSwitcherActiveItemClassName,
  type OkkeySidebarVaultItem,
  type OkkeyWorkspaceNavLinkComponent,
} from "@okkey/ui";
import { useWorkspaceLogoUrl } from "@okkey/vault-ui";
import { toast } from "sonner";

import {
  ExtensionItemDetailEmpty,
  ExtensionItemDetailPane,
} from "../../components/vault/ExtensionItemDetailPane";
import {
  ExtensionItemsListPane,
  getActiveCategoryLabel,
  type ExtensionListFilter,
  type ExtensionListRow,
  type ExtensionListSort,
} from "../../components/vault/ExtensionItemsListPane";
import { ExtensionDeviceSettingsPanel } from "../../components/settings/ExtensionDeviceSettingsPanel";
import { SettingsGearIcon } from "../../components/icons/SettingsGearIcon";
import {
  buildEditItemDeepLink,
  buildItemsDeepLink,
  buildNewCapsuleDeepLink,
  buildNewItemDeepLink,
  buildSettingsMainDeepLink,
  openWebDeepLink,
} from "../../lib/deepLinks";
import { touchExtensionUnlockSession } from "../../lib/extensionVaultSession";
import { initExtensionCrypto } from "../../lib/initExtensionCrypto";
import {
  readStoredCurrentWorkspaceId,
  writeStoredCurrentWorkspaceId,
} from "../../lib/vaultStorage";

type VaultPopupProps = {
  core: CoreApiClient;
  userId: string;
  accessToken: string;
  apiBaseUrl: string;
  webBaseUrl: string;
  secrets: UnlockWithMasterPasswordResult;
  encryptedPrivateKeyPayload: string;
  identity: { email: string; firstName: string; lastName: string } | null;
  locale: WebLocale;
  onLocaleChange: (locale: WebLocale) => void;
  signOutLabel: string;
  onSignOut: () => void;
  onChangeServer: () => void;
  onLock: () => void;
  idleLockMs: number;
  onIdleLockMsChange?: (ms: number) => void;
  onActivity?: () => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
};

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M3.33337 8.00004H12.6667M8.00004 3.33337V12.6667"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M4.66663 7.33337V4.66671C4.66663 3.78265 5.01782 2.93481 5.64294 2.30968C6.26806 1.68456 7.1159 1.33337 7.99996 1.33337C8.88402 1.33337 9.73186 1.68456 10.357 2.30968C10.9821 2.93481 11.3333 3.78265 11.3333 4.66671V7.33337M3.33329 7.33337H12.6666C13.403 7.33337 14 7.93037 14 8.66671V13.3334C14 14.0697 13.403 14.6667 12.6666 14.6667H3.33329C2.59691 14.6667 1.99996 14.0697 1.99996 13.3334V8.66671C1.99996 7.93037 2.59691 7.33337 3.33329 7.33337Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Header icon between Lock and Create — closes mobile drawer when opening settings. */
function VaultHeaderDeviceSettingsButton(props: { label: string; onOpen: () => void }) {
  const shell = useOkkeyAppShellLayout();
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="size-9 min-h-9 min-w-9 shrink-0 rounded-lg p-0 shadow-none"
            aria-label={props.label}
            onClick={() => {
              shell.setMobileDrawerOpen(false);
              props.onOpen();
            }}
          >
            <SettingsGearIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{props.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Same chevrons as account footer / default workspace switcher in OkkeyAppSidebar. */
function WorkspaceSwitcherChevronsIcon({ className }: { className?: string }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
    >
      <path
        d="M4.66663 10.0001L7.99996 13.3334L11.3333 10.0001M4.66663 6.00008L7.99996 2.66675L11.3333 6.00008"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function compareRows(a: ExtensionItemListRecord, b: ExtensionItemListRecord, sort: ExtensionListSort): number {
  if (sort === "name_asc") {
    return a.title.localeCompare(b.title, "ru", { sensitivity: "base" }) || b.updatedAtMs - a.updatedAtMs;
  }
  if (sort === "name_desc") {
    return b.title.localeCompare(a.title, "ru", { sensitivity: "base" }) || b.updatedAtMs - a.updatedAtMs;
  }
  if (sort === "date_asc") {
    return a.updatedAtMs - b.updatedAtMs || a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
  }
  return b.updatedAtMs - a.updatedAtMs || a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
}

function filterRows(
  rows: readonly ExtensionListRow[],
  filter: ExtensionListFilter,
): ExtensionListRow[] {
  switch (filter) {
    case "all":
      return rows.filter((r) => !r.deleted && !r.archived);
    case "favorites":
      return rows.filter((r) => !r.deleted && !r.archived && r.favorite);
    case "archived":
      return rows.filter((r) => !r.deleted && r.archived);
    case "recently_deleted":
      return rows.filter((r) => r.deleted);
    default: {
      const _ex: never = filter;
      return _ex;
    }
  }
}

const ExtensionVaultFilterLink = forwardRef(function ExtensionVaultFilterLink(
  props: {
    to: string;
    className?: string;
    children: React.ReactNode;
    "aria-current"?: React.ComponentProps<"a">["aria-current"];
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    onPickVault: (vaultId: string) => void;
  },
  ref: ForwardedRef<HTMLAnchorElement>,
) {
  const { to, className, children, onClick, onPickVault, ...rest } = props;
  const shell = useOkkeyAppShellLayout();
  return (
    <a
      ref={ref}
      href={to}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        const id = to.startsWith("vault:") ? to.slice("vault:".length) : "";
        if (id) {
          onPickVault(id);
        }
        shell.setMobileDrawerOpen(false);
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </a>
  );
});

const ExtensionFolderNavLink = forwardRef(function ExtensionFolderNavLink(
  props: {
    to: string;
    className?: string;
    children: React.ReactNode;
    "aria-current"?: React.ComponentProps<"a">["aria-current"];
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    onPickFolder: (folderId: string) => void;
  },
  ref: ForwardedRef<HTMLAnchorElement>,
) {
  const { to, className, children, onClick, onPickFolder, ...rest } = props;
  const shell = useOkkeyAppShellLayout();
  return (
    <a
      ref={ref}
      href={to}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        const id = to.startsWith("folder:") ? to.slice("folder:".length) : "";
        if (id) {
          onPickFolder(id);
        }
        shell.setMobileDrawerOpen(false);
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </a>
  );
});

function ExtensionWorkspaceTileAvatar(props: {
  workspace?: Workspace;
  sizeClass: string;
  apiBaseUrl: string;
  accessToken: string;
  vaultKey: Uint8Array | null;
}) {
  const { workspace, sizeClass, apiBaseUrl, accessToken, vaultKey } = props;
  const hasCustomLogo = Boolean(workspace?.logoVaultId && workspace?.logoAttachmentId);
  const logoUrl = useWorkspaceLogoUrl({
    apiBaseUrl,
    accessToken,
    vaultKey,
    vaultId: workspace?.logoVaultId,
    attachmentId: workspace?.logoAttachmentId,
    workspaceId: workspace?.id ?? "",
    enabled: hasCustomLogo,
  });

  if (!workspace) {
    return <div className={cn("shrink-0 rounded-lg bg-muted", sizeClass)} />;
  }

  return (
    <WorkspaceLogoTile
      className={cn("shrink-0", sizeClass)}
      tileColor={workspace.tileColor}
      hasCustomLogo={hasCustomLogo}
      imageSrc={logoUrl.imageSrc}
      loading={logoUrl.loading}
    />
  );
}

function WorkspaceSwitcherPanel(props: {
  workspaces: readonly Workspace[];
  workspaceId: string | null;
  apiBaseUrl: string;
  accessToken: string;
  vaultKey: Uint8Array | null;
  t: VaultPopupProps["t"];
  onPick: (id: string) => void;
}) {
  const shell = useOkkeyAppShellLayout();
  return (
    <div className="p-1">
      {props.workspaces.map((ws) => {
        const active = ws.id === props.workspaceId;
        return (
          <DropdownMenuItem
            key={ws.id}
            className={cn(
              "h-auto cursor-pointer items-center gap-3",
              active ? workspaceSwitcherActiveItemClassName : undefined,
            )}
            onSelect={() => {
              props.onPick(ws.id);
              shell.setMobileDrawerOpen(false);
            }}
          >
            <ExtensionWorkspaceTileAvatar
              workspace={ws}
              sizeClass="size-8"
              apiBaseUrl={props.apiBaseUrl}
              accessToken={props.accessToken}
              vaultKey={props.vaultKey}
            />
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold leading-5 text-foreground">{ws.name}</p>
              <p className="truncate text-xs leading-4 text-muted-foreground">
                {planTierLabel(ws.planTier, props.t)}
              </p>
            </div>
            {active ? <span className="shrink-0 text-primary">✓</span> : null}
          </DropdownMenuItem>
        );
      })}
    </div>
  );
}

export function VaultPopup(props: VaultPopupProps) {
  const {
    core,
    userId,
    accessToken,
    apiBaseUrl,
    webBaseUrl,
    secrets,
    encryptedPrivateKeyPayload,
    identity,
    locale,
    onLocaleChange,
    signOutLabel,
    onSignOut,
    onChangeServer,
    onLock,
    idleLockMs,
    onIdleLockMsChange,
    onActivity,
    t,
  } = props;

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [items, setItems] = useState<ItemPlaintextV2[]>([]);
  const [folderNodes, setFolderNodes] = useState<WorkspaceFolderNode[]>([]);
  const [itemFolderByItemId, setItemFolderByItemId] = useState<ReadonlyMap<string, string | null>>(
    () => new Map(),
  );
  const [itemFavoriteByItemId, setItemFavoriteByItemId] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [vaultKeyById, setVaultKeyById] = useState<ReadonlyMap<string, Uint8Array>>(() => new Map());
  const [profilesByVaultId, setProfilesByVaultId] = useState<
    ReadonlyMap<string, MeVaultProfileEntryDto>
  >(() => new Map());
  const [profilesReady, setProfilesReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ExtensionListFilter>("all");
  const [sort, setSort] = useState<ExtensionListSort>("date_desc");
  const [vaultFilterId, setVaultFilterId] = useState<string | null>(null);
  const [folderFilterId, setFolderFilterId] = useState<string | null>(null);
  const [categoryFilterId, setCategoryFilterId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);
  const disposeRef = useRef<(() => void) | null>(null);
  const itemsControllerRef = useRef<WorkspaceVaultItemsReadController | null>(null);
  const foldersDisposeRef = useRef<(() => void) | null>(null);
  const foldersControllerRef = useRef<WorkspaceFoldersSyncController | null>(null);
  const foldersLoadGenRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const noteActivity = useCallback(() => {
    void touchExtensionUnlockSession(userId);
    onActivity?.();
  }, [onActivity, userId]);

  const loadWorkspaces = useCallback(async () => {
    const list = await core.listWorkspaces();
    setWorkspaces(list);
    const stored = await readStoredCurrentWorkspaceId(userId);
    const next =
      (stored && list.some((w) => w.id === stored) ? stored : null) ??
      list[0]?.id ??
      null;
    setWorkspaceId(next);
    if (next) {
      await writeStoredCurrentWorkspaceId(userId, next);
    }

    // API-first rematerialize for every workspace (same path as web refresh):
    // personal-events from version 0 → decrypt → tree. No local-IDB reseal.
    // Current workspace still loads via loadFolders on open / switch.
    const shareCRaw = secrets.passwordShareC;
    if (shareCRaw && shareCRaw.byteLength === 32 && list.length > 0) {
      const shareC = new Uint8Array(shareCRaw);
      void refreshWorkspaceFoldersCachesForIds({
        core,
        userId,
        passwordShareC: shareC,
        workspaceIds: list.map((workspace) => workspace.id),
      }).catch(() => undefined);
    }
  }, [core, secrets.passwordShareC, userId]);

  const loadFolders = useCallback(
    async (wsId: string) => {
      const gen = ++foldersLoadGenRef.current;
      foldersDisposeRef.current?.();
      foldersDisposeRef.current = null;
      // Clear previous workspace folders immediately so a switch never flashes
      // stale sidebar rows (e.g. repair-probe from another workspace).
      setFolderNodes([]);
      setItemFolderByItemId(new Map());
      setItemFavoriteByItemId(new Set());

      // Copy bytes so an in-place wipe of React state cannot zero the key mid-sync.
      const shareCRaw = secrets.passwordShareC;
      const shareC =
        shareCRaw && shareCRaw.byteLength === 32 ? new Uint8Array(shareCRaw) : null;
      const shareCAllZero = shareC ? shareC.every((b) => b === 0) : true;

      const writeDebug = (payload: Record<string, unknown>) => {
        const body = {
          at: Date.now(),
          workspaceId: wsId,
          userId,
          ...payload,
        };
        console.info("[extension] folder sync debug", body);
        try {
          void browser.storage.local.set({ "okkey.extension.folderSyncDebug": body });
        } catch {
          // ignore
        }
      };

      writeDebug({
        phase: "start",
        passwordShareCBytes: shareC?.byteLength ?? 0,
        shareCAllZero,
      });

      // Popup JS context is destroyed on close; always re-assert WASM before
      // personal-metadata decrypt (shared wasm-init gate + explicit asset URL).
      try {
        await initExtensionCrypto();
        writeDebug({ phase: "wasm_ok", passwordShareCBytes: shareC?.byteLength ?? 0, shareCAllZero });
      } catch (err: unknown) {
        if (gen !== foldersLoadGenRef.current) {
          return;
        }
        console.error("[extension] folder sync crypto init failed", err);
        writeDebug({
          phase: "wasm_failed",
          error: err instanceof Error ? err.message : String(err),
        });
        setFolderNodes([]);
        setItemFolderByItemId(new Map());
        setItemFavoriteByItemId(new Set());
        return;
      }

      if (!shareC || shareCAllZero) {
        if (gen !== foldersLoadGenRef.current) {
          return;
        }
        console.error("[extension] folder sync missing passwordShareC", {
          workspaceId: wsId,
          byteLength: shareC?.byteLength ?? 0,
          shareCAllZero,
        });
        writeDebug({
          phase: "missing_share_c",
          byteLength: shareC?.byteLength ?? 0,
          shareCAllZero,
        });
        setFolderNodes([]);
        setItemFolderByItemId(new Map());
        setItemFavoriteByItemId(new Set());
        return;
      }

      // Direct API sync: personal-events pull + decrypt with current metadata key.
      // No web IndexedDB / scripting seed — same path as web WorkspaceFoldersContext.
      const controller = createWorkspaceFoldersSyncController({
        core,
        userId,
        workspaceId: wsId,
        passwordShareC: shareC,
      });
      foldersControllerRef.current = controller;
      foldersDisposeRef.current = () => {
        if (foldersControllerRef.current === controller) {
          foldersControllerRef.current = null;
        }
        controller.dispose();
      };
      try {
        await controller.refresh();
        if (gen !== foldersLoadGenRef.current) {
          return;
        }
        const tree = controller.toFolderTree();
        const st = controller.getState();
        const diag = controller.getLastRefreshDiagnostics();
        console.info("[extension] folder sync ok", {
          workspaceId: wsId,
          folderCount: tree.length,
          itemFolderCount: st.itemFolder.size,
          favoriteCount: st.itemFavorite.size,
          lastAppliedVersion: st.lastAppliedVersion,
          ...diag,
        });
        writeDebug({
          phase: "ok",
          folderCount: tree.length,
          itemFolderCount: st.itemFolder.size,
          favoriteCount: st.itemFavorite.size,
          lastAppliedVersion: st.lastAppliedVersion,
          mixedKeyStream:
            tree.length === 0 &&
            typeof diag?.probeFolderDecryptFail === "number" &&
            diag.probeFolderDecryptFail > 0,
          ...diag,
        });
        setFolderNodes(tree);
        setItemFolderByItemId(new Map(st.itemFolder));
        setItemFavoriteByItemId(new Set(st.itemFavorite));
      } catch (err: unknown) {
        if (gen !== foldersLoadGenRef.current) {
          return;
        }
        const diag = controller.getLastRefreshDiagnostics();
        console.error("[extension] folder sync failed", {
          workspaceId: wsId,
          err,
          ...diag,
        });
        writeDebug({
          phase: "failed",
          error: err instanceof Error ? err.message : String(err),
          ...diag,
          folderCount: 0,
        });
        // API-first: never paint stale IDB/materialized folders when sync fails.
        setFolderNodes([]);
        setItemFolderByItemId(new Map());
        setItemFavoriteByItemId(new Set());
      }
    },
    [core, secrets.passwordShareC, userId],
  );

  const loadItems = useCallback(
    async (wsId: string) => {
      setLoading(true);
      setError(null);
      disposeRef.current?.();
      disposeRef.current = null;
      try {
        // Same WASM gate as folders — item/favicon decrypt must not start a
        // path-less initWasm race ahead of the explicit extension asset URL.
        await initExtensionCrypto();
        const nextVaults = await core.listWorkspaceVaults(wsId);
        setVaults(nextVaults);
        const controller = createWorkspaceVaultItemsReadController({
          core,
          userId,
          workspaceId: wsId,
          vaults: nextVaults,
          accountVaultKey: secrets.vaultKey,
          encryptedPrivateKeyPayload,
        });
        itemsControllerRef.current = controller;
        disposeRef.current = () => {
          if (itemsControllerRef.current === controller) {
            itemsControllerRef.current = null;
          }
          controller.dispose();
        };
        await controller.refresh();
        setItems(controller.getAllItems());

        try {
          const profiles = await core.getWorkspaceMeVaultProfiles(wsId);
          setProfilesByVaultId(new Map(profiles.vaults.map((entry) => [entry.vaultId, entry])));
          setProfilesReady(true);
        } catch {
          setProfilesByVaultId(new Map());
          setProfilesReady(false);
        }

        const keys = new Map<string, Uint8Array>();
        await Promise.all(
          nextVaults.map(async (vault) => {
            try {
              const key = await resolveVaultItemEncryptionKey({
                vault,
                accountVaultKey: secrets.vaultKey,
                core,
                encryptedPrivateKeyPayload,
              });
              keys.set(vault.id, key);
            } catch {
              // Favicons for this vault stay on category/monogram fallback.
            }
          }),
        );
        setVaultKeyById(keys);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setItems([]);
        setVaults([]);
        setVaultKeyById(new Map());
      } finally {
        setLoading(false);
      }
    },
    [core, encryptedPrivateKeyPayload, secrets.vaultKey, userId],
  );

  useEffect(() => {
    void (async () => {
      try {
        await loadWorkspaces();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    })();
    return () => {
      disposeRef.current?.();
      foldersDisposeRef.current?.();
    };
  }, [loadWorkspaces]);

  // Mirror web WorkspaceFoldersContext: folder sync is independent of item read
  // so an items failure cannot wipe the sidebar, and share-C / crypto are ready
  // before personal-events decrypt.
  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    void loadFolders(workspaceId);
    const onFocus = () => {
      void loadFolders(workspaceId);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      foldersDisposeRef.current?.();
      foldersDisposeRef.current = null;
    };
  }, [workspaceId, loadFolders]);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setVaultFilterId(null);
    setFolderFilterId(null);
    setCategoryFilterId(null);
    setSelectedId(null);
    void loadItems(workspaceId);
  }, [workspaceId, loadItems]);

  const listRecords = useMemo((): ExtensionListRow[] => {
    const records: ExtensionListRow[] = items.map((item) => {
      const base = itemPlaintextToExtensionListRecord(item);
      return {
        ...base,
        date: new Date(item.updatedAtMs),
        favorite: itemFavoriteByItemId.has(item.itemId),
        folderId: itemFolderByItemId.get(item.itemId) ?? null,
      };
    });

    let scoped = records;
    const searchTrim = search.trim();
    if (!searchTrim) {
      if (categoryFilterId) {
        scoped = scoped.filter((row) => row.categoryId === categoryFilterId);
      } else {
        if (vaultFilterId) {
          scoped = scoped.filter((row) => row.vaultId === vaultFilterId);
        }
        if (folderFilterId) {
          scoped = scoped.filter((row) => row.folderId === folderFilterId);
        }
      }
    }

    const filtered = filterRows(scoped, filter);
    if (!searchTrim) {
      return [...filtered].sort((a, b) => compareRows(a, b, sort));
    }
    return filtered
      .map((row) => ({ row, score: scoreItemsListRecordSearch(row, searchTrim) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || compareRows(a.row, b.row, sort))
      .map((entry) => entry.row);
  }, [
    categoryFilterId,
    filter,
    folderFilterId,
    itemFavoriteByItemId,
    itemFolderByItemId,
    items,
    search,
    sort,
    vaultFilterId,
  ]);

  const selectedItem = useMemo(
    () => (selectedId ? items.find((item) => item.itemId === selectedId) ?? null : null),
    [items, selectedId],
  );

  const selectedVault = useMemo(
    () => (selectedItem ? vaults.find((v) => v.id === selectedItem.vaultId) : undefined),
    [selectedItem, vaults],
  );

  const personalVaultIds = useMemo(() => {
    const ids = new Set<string>();
    for (const vault of vaults) {
      if (vault.isPersonal) {
        ids.add(vault.id);
      }
    }
    return ids;
  }, [vaults]);

  const buildPermitsContext = useCallback(
    (vaultId: string, itemCreatedByUserId?: string | null): ProfilePermitsContext | null => {
      const entry = profilesByVaultId.get(vaultId);
      let permissions = entry ? ensureProfilePermissions(entry.permissions) : null;
      if (!permissions) {
        if (personalVaultIds.has(vaultId)) {
          permissions = createFullAccessProfilePermissions();
        } else if (vaults.some((v) => v.id === vaultId)) {
          permissions = createEmptyProfilePermissions();
        } else {
          return null;
        }
      }
      return {
        permissions,
        userId,
        itemCreatedByUserId: itemCreatedByUserId ?? null,
      };
    },
    [personalVaultIds, profilesByVaultId, userId, vaults],
  );

  const canDeleteItem = useCallback(
    (vaultId: string, itemCreatedByUserId?: string | null) => {
      if (!profilesReady) {
        return true;
      }
      const ctx = buildPermitsContext(vaultId, itemCreatedByUserId);
      return ctx ? profileAllowsEntriesDelete(ctx) : false;
    },
    [buildPermitsContext, profilesReady],
  );

  const canUseFunction = useCallback(
    (vaultId: string, action: ProfileFunctionActionId) => {
      if (!profilesReady) {
        return true;
      }
      const ctx = buildPermitsContext(vaultId);
      return ctx ? profileAllowsFunction(ctx, action) : false;
    },
    [buildPermitsContext, profilesReady],
  );

  const syncItemsFromController = useCallback(() => {
    const controller = itemsControllerRef.current;
    if (!controller) {
      return;
    }
    setItems(controller.getAllItems());
  }, []);

  const syncFavoritesFromController = useCallback(() => {
    const controller = foldersControllerRef.current;
    if (!controller) {
      return;
    }
    setItemFavoriteByItemId(new Set(controller.getState().itemFavorite));
  }, []);

  const syncFoldersFromController = useCallback(() => {
    const controller = foldersControllerRef.current;
    if (!controller) {
      return;
    }
    const st = controller.getState();
    setFolderNodes(controller.toFolderTree());
    setItemFolderByItemId(new Map(st.itemFolder));
    setItemFavoriteByItemId(new Set(st.itemFavorite));
  }, []);

  const onAssignFolder = useCallback(
    async (itemId: string, folderId: string | null) => {
      const controller = foldersControllerRef.current;
      if (!controller) {
        throw new Error("Folders controller not ready");
      }
      await controller.assignItemToFolder(itemId, folderId);
      syncFoldersFromController();
    },
    [syncFoldersFromController],
  );

  const onCreateFolder = useCallback(
    async (label: string) => {
      const controller = foldersControllerRef.current;
      if (!controller) {
        throw new Error("Folders controller not ready");
      }
      const id = await controller.createFolder(label);
      syncFoldersFromController();
      return id;
    },
    [syncFoldersFromController],
  );

  const openDeviceSettings = useCallback(() => {
    setDeviceSettingsOpen(true);
  }, []);

  const onToggleFavorite = useCallback(
    async (itemId: string, nextFavorite: boolean) => {
      const controller = foldersControllerRef.current;
      if (!controller) {
        return;
      }
      setItemFavoriteByItemId((prev) => {
        const next = new Set(prev);
        if (nextFavorite) {
          next.add(itemId);
        } else {
          next.delete(itemId);
        }
        return next;
      });
      try {
        await controller.setItemFavorite(itemId, nextFavorite);
        syncFavoritesFromController();
        toast.success(
          t(nextFavorite ? "extension.vault.toast.favoriteAdded" : "extension.vault.toast.favoriteRemoved"),
        );
      } catch (err: unknown) {
        syncFavoritesFromController();
        toast.error(err instanceof Error ? err.message : String(err));
      }
    },
    [syncFavoritesFromController, t],
  );

  const onToggleDelete = useCallback(
    async (item: ItemPlaintextV2, deleted: boolean) => {
      const controller = itemsControllerRef.current;
      if (!controller) {
        return;
      }
      const previous = item;
      setItems((prev) =>
        prev.map((entry) => (entry.itemId === item.itemId ? withItemDeletedState(entry, deleted) : entry)),
      );
      try {
        await controller.updateItem(withItemDeletedState(item, deleted));
        syncItemsFromController();
        if (deleted && itemFavoriteByItemId.has(item.itemId)) {
          const folders = foldersControllerRef.current;
          if (folders) {
            await folders.setItemFavorite(item.itemId, false);
            syncFavoritesFromController();
          }
        }
        if (deleted) {
          setSelectedId(null);
        }
        toast.success(t(deleted ? "extension.vault.toast.deleted" : "extension.vault.toast.restored"));
      } catch (err: unknown) {
        setItems((prev) => prev.map((entry) => (entry.itemId === item.itemId ? previous : entry)));
        toast.error(err instanceof Error ? err.message : String(err));
      }
    },
    [itemFavoriteByItemId, syncFavoritesFromController, syncItemsFromController, t],
  );

  const onToggleArchive = useCallback(
    async (item: ItemPlaintextV2) => {
      const controller = itemsControllerRef.current;
      if (!controller) {
        return;
      }
      const nextArchived = !(item.archived ?? false);
      const previous = item;
      setItems((prev) =>
        prev.map((entry) =>
          entry.itemId === item.itemId ? withItemArchivedState(entry, nextArchived) : entry,
        ),
      );
      try {
        await controller.updateItem(withItemArchivedState(item, nextArchived));
        syncItemsFromController();
        if (nextArchived && itemFavoriteByItemId.has(item.itemId)) {
          const folders = foldersControllerRef.current;
          if (folders) {
            await folders.setItemFavorite(item.itemId, false);
            syncFavoritesFromController();
          }
        }
        toast.success(t(nextArchived ? "extension.vault.toast.archived" : "extension.vault.toast.unarchived"));
      } catch (err: unknown) {
        setItems((prev) => prev.map((entry) => (entry.itemId === item.itemId ? previous : entry)));
        toast.error(err instanceof Error ? err.message : String(err));
      }
    },
    [itemFavoriteByItemId, syncFavoritesFromController, syncItemsFromController, t],
  );

  const onSelectWorkspace = async (id: string) => {
    setSelectedId(null);
    setWorkspaceId(id);
    await writeStoredCurrentWorkspaceId(userId, id);
  };

  const currentWorkspace = workspaces.find((w) => w.id === workspaceId) ?? null;
  const vaultScopeMeta = vaultFilterId ? vaults.find((v) => v.id === vaultFilterId) : null;

  const findFolderLabel = useCallback((nodes: readonly WorkspaceFolderNode[], id: string): string => {
    for (const node of nodes) {
      if (node.id === id) {
        return node.label;
      }
      if (node.children?.length) {
        const nested = findFolderLabel(node.children, id);
        if (nested) {
          return nested;
        }
      }
    }
    return "";
  }, []);

  const folderScopeLabel = folderFilterId
    ? findFolderLabel(folderNodes, folderFilterId) || folderFilterId
    : null;
  const categoryScopeLabel = categoryFilterId
    ? getActiveCategoryLabel(categoryFilterId, t) ?? categoryFilterId
    : null;

  const clearScope = useCallback(() => {
    setVaultFilterId(null);
    setFolderFilterId(null);
    setCategoryFilterId(null);
  }, []);

  /** Web `clearWorkspaceScopeFromUrl`: drop vault/folder/category/search (and keep sort). */
  const clearAllListScope = useCallback(() => {
    clearScope();
    setSearch("");
  }, [clearScope]);

  const pickVaultScope = useCallback((id: string) => {
    setVaultFilterId(id);
    setFolderFilterId(null);
    setCategoryFilterId(null);
    setSearch("");
    setFilter("all");
    setSelectedId(null);
  }, []);

  const pickFolderScope = useCallback((id: string) => {
    setFolderFilterId(id);
    setVaultFilterId(null);
    setCategoryFilterId(null);
    setSearch("");
    setFilter("all");
    setSelectedId(null);
  }, []);

  const pickCategoryScope = useCallback((id: string) => {
    setCategoryFilterId(id);
    setVaultFilterId(null);
    setFolderFilterId(null);
    setSearch("");
    setFilter("all");
    setSelectedId(null);
  }, []);

  const openNewItem = () => {
    void openWebDeepLink(
      buildNewItemDeepLink({
        webBaseUrl,
        workspaceId: workspaceId ?? undefined,
      }),
    );
  };

  const openItemInWeb = (itemId: string, extra?: { popup?: string }) => {
    if (extra?.popup === "editItem") {
      void openWebDeepLink(
        buildEditItemDeepLink({
          webBaseUrl,
          workspaceId: workspaceId ?? undefined,
          itemId,
        }),
      );
      return;
    }
    if (extra?.popup === "newCapsule") {
      void openWebDeepLink(
        buildNewCapsuleDeepLink({
          webBaseUrl,
          workspaceId: workspaceId ?? undefined,
          itemId,
        }),
      );
      return;
    }
    if (!workspaceId) return;
    void openWebDeepLink(buildItemsDeepLink({ webBaseUrl, workspaceId, itemId }));
  };

  const folderTreeForSidebar = useMemo(
    () =>
      toSidebarFolderTree(
        folderNodes,
        (folderId) => `folder:${folderId}`,
        folderFilterId ?? "",
      ),
    [folderFilterId, folderNodes],
  );

  const sidebarVaultItems: OkkeySidebarVaultItem[] = vaults.map((vault) => ({
    id: vault.id,
    leading: (
      <span className="text-base leading-none" aria-hidden>
        {vaultDisplayIcon(vault)}
      </span>
    ),
    label: vault.name,
    to: `vault:${vault.id}`,
    isActive: vaultFilterId === vault.id,
  }));

  const vaultOptions = vaults.map((vault) => ({
    id: vault.id,
    name: vault.name,
    isPersonal: vault.isPersonal,
    icon: vault.icon,
  }));

  const VaultNavLink = useMemo(() => {
    const Link = forwardRef(function VaultFilterLink(
      linkProps: {
        to: string;
        className?: string;
        children: React.ReactNode;
        "aria-current"?: React.ComponentProps<"a">["aria-current"];
        onClick?: React.MouseEventHandler<HTMLAnchorElement>;
      },
      ref: ForwardedRef<HTMLAnchorElement>,
    ) {
      return <ExtensionVaultFilterLink ref={ref} {...linkProps} onPickVault={pickVaultScope} />;
    });
    return Link as OkkeyWorkspaceNavLinkComponent;
  }, [pickVaultScope]);

  const FolderNavLink = useMemo(() => {
    const Link = forwardRef(function FolderFilterLink(
      linkProps: {
        to: string;
        className?: string;
        children: React.ReactNode;
        "aria-current"?: React.ComponentProps<"a">["aria-current"];
        onClick?: React.MouseEventHandler<HTMLAnchorElement>;
      },
      ref: ForwardedRef<HTMLAnchorElement>,
    ) {
      return <ExtensionFolderNavLink ref={ref} {...linkProps} onPickFolder={pickFolderScope} />;
    });
    return Link as OkkeyWorkspaceNavLinkComponent;
  }, [pickFolderScope]);

  const onPickWorkspace = async (id: string) => {
    await onSelectWorkspace(id);
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    noteActivity();
  };

  const onSelectItem = (id: string) => {
    setSelectedId(id);
    noteActivity();
  };

  const onPickTag = (tag: string) => {
    setSearch(formatTagSearchQuery(tag));
    clearScope();
    setFilter("all");
    setSelectedId(null);
  };

  const resolveVaultKey = useCallback(
    (vaultId: string) => vaultKeyById.get(vaultId) ?? null,
    [vaultKeyById],
  );

  const selectedFolderId = selectedItem
    ? (itemFolderByItemId.get(selectedItem.itemId) ?? null)
    : null;
  const selectedFolderLabel = selectedFolderId
    ? findWorkspaceFolderPathById(folderNodes, selectedFolderId) || selectedFolderId
    : t("web.newItemPopup.noFolder");
  const actorLabel = useMemo(() => {
    if (!identity) {
      return "";
    }
    const name = [identity.firstName.trim(), identity.lastName.trim()].filter(Boolean).join(" ");
    return name || identity.email || "";
  }, [identity]);

  const languageMenu = useMemo(
    () => ({
      label: t("web.accountMenu.language", { lang: getWebLocaleNativeName(locale) }),
      currentCode: locale,
      options: WEB_LOCALES.map((code) => ({
        code,
        label: getWebLocaleNativeName(code),
      })),
      onSelect: (code: string) => {
        if (code === "en" || code === "ru") {
          onLocaleChange(code);
        }
      },
    }),
    [locale, onLocaleChange, t],
  );

  return (
    <OkkeyAppSidebar
      workspaceNavItems={[]}
      showVaultHeaderPlus={false}
      showFolderHeaderPlus={false}
      showFooterPlainLinks={false}
      folderTree={folderTreeForSidebar}
      folderNavLink={FolderNavLink}
      folderEmptyLabel={t("web.nav.foldersEmpty")}
      vaultSectionTitle={t("web.nav.vaultsSection")}
      folderSectionTitle={t("web.nav.foldersSection")}
      vaultItems={sidebarVaultItems}
      vaultNavLink={VaultNavLink}
      mobileNavCloseLabel={t("web.nav.closeMobileNav")}
      workspaceSwitcherTrigger={({ expanded }) => (
        <>
          <ExtensionWorkspaceTileAvatar
            workspace={currentWorkspace ?? undefined}
            sizeClass={cn("size-8", !expanded && "size-9")}
            apiBaseUrl={apiBaseUrl}
            accessToken={accessToken}
            vaultKey={secrets.vaultKey}
          />
          {expanded ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-5 text-foreground">
                  {currentWorkspace?.name ?? t("extension.vault.workspace")}
                </p>
                <p className="truncate text-xs font-normal leading-4 text-muted-foreground">
                  {currentWorkspace
                    ? planTierLabel(currentWorkspace.planTier, t)
                    : (identity?.email ?? "")}
                </p>
              </div>
              <WorkspaceSwitcherChevronsIcon className="size-4 shrink-0 text-muted-foreground" />
            </>
          ) : null}
        </>
      )}
      workspaceSwitcherDropdown={
        <WorkspaceSwitcherPanel
          workspaces={workspaces}
          workspaceId={workspaceId}
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          vaultKey={secrets.vaultKey}
          t={t}
          onPick={(id) => void onPickWorkspace(id)}
        />
      }
      accountMenu={
        identity
          ? {
              email: identity.email,
              firstName: identity.firstName,
              lastName: identity.lastName,
              settingsLabel: t("web.accountMenu.settings"),
              deviceSettingsLabel: t("web.accountMenu.deviceSettings"),
              deviceSettingsIcon: <SettingsGearIcon />,
              logoutLabel: signOutLabel,
              changeServerLabel: t("web.accountMenu.changeServer"),
              settingsAsProfileHeader: true,
              onSettings: () => {
                void openWebDeepLink(buildSettingsMainDeepLink(webBaseUrl));
              },
              onDeviceSettings: () => {
                openDeviceSettings();
              },
              onLogout: onSignOut,
              onChangeServer,
              language: languageMenu,
            }
          : undefined
      }
    >
      {deviceSettingsOpen ? (
        <ExtensionDeviceSettingsPanel
          userId={userId}
          secrets={secrets}
          idleLockMs={idleLockMs}
          onIdleLockMsChange={(ms) => onIdleLockMsChange?.(ms)}
          onBack={() => setDeviceSettingsOpen(false)}
          t={t}
        />
      ) : (
      <div className="flex h-full min-h-0 w-full flex-col bg-background text-foreground">
        <header className="flex h-[52px] shrink-0 items-center gap-2 bg-gradient-to-r from-[var(--extension-shell-header-from)] to-[var(--extension-shell-header-to)] p-2">
          <OkkeyAppSidebarToolbar
            openMobileNavLabel={t("web.nav.openMobileNav")}
            className="!p-0"
          />
          <WorkspaceSearchField
            value={search}
            onChange={onSearchChange}
            placeholder={t("web.items.searchPlaceholder")}
            inputRef={searchInputRef}
            clearAriaLabel={t("web.items.searchClear")}
            showShortcutKbd={false}
            wrapClassName="px-0 sm:px-0"
          />
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 gap-1.5 rounded-lg px-3 shadow-none"
              aria-label={t("extension.vault.lock")}
              onClick={onLock}
            >
              <LockIcon />
              <span className="text-sm font-medium">{t("extension.vault.lock")}</span>
            </Button>
            <VaultHeaderDeviceSettingsButton
              label={t("web.accountMenu.deviceSettings")}
              onOpen={openDeviceSettings}
            />
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="default"
                    className="size-9 min-h-9 min-w-9 shrink-0 rounded-lg p-0"
                    aria-label={t("extension.vault.createRecord")}
                    onClick={openNewItem}
                  >
                    <PlusIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("extension.vault.createRecord")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[250px] shrink-0 flex-col border-r border-border">
            <ExtensionItemsListPane
              records={listRecords}
              loading={loading}
              error={error}
              filter={filter}
              sort={sort}
              selectedId={selectedId}
              locale={locale === "ru" ? "ru" : "en"}
              searchQuery={search}
              vaultScopeLabel={vaultScopeMeta?.name ?? null}
              folderScopeLabel={folderScopeLabel}
              categoryScopeLabel={categoryScopeLabel}
              vaultOptions={vaultOptions}
              folderTree={folderTreeForSidebar}
              activeVaultId={vaultFilterId ?? ""}
              activeFolderId={folderFilterId ?? ""}
              activeCategoryId={categoryFilterId ?? ""}
              apiBaseUrl={apiBaseUrl}
              accessToken={accessToken}
              resolveVaultKey={resolveVaultKey}
              onFilterChange={(next) => {
                setFilter(next);
              }}
              onSortChange={setSort}
              onSelect={onSelectItem}
              onClearScope={clearAllListScope}
              onPickVault={pickVaultScope}
              onPickFolder={pickFolderScope}
              onPickCategory={pickCategoryScope}
              onPickTag={onPickTag}
              t={t}
            />
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            {!selectedItem ? (
              <ExtensionItemDetailEmpty
                title={t("web.items.detail.selectItemTitle")}
                description={t("web.items.detail.selectItemDescription")}
              />
            ) : (
              <ExtensionItemDetailPane
                item={selectedItem}
                vault={selectedVault}
                folderId={selectedFolderId}
                folderLabel={selectedFolderLabel}
                folderNodes={folderNodes}
                actorLabel={actorLabel}
                activityWireEntries={
                  itemsControllerRef.current?.getItemActivityById(selectedItem.itemId) ?? []
                }
                apiBaseUrl={apiBaseUrl}
                accessToken={accessToken}
                vaultKey={resolveVaultKey(selectedItem.vaultId)}
                locale={locale}
                userId={userId}
                favorite={itemFavoriteByItemId.has(selectedItem.itemId)}
                canFavorite={canUseFunction(selectedItem.vaultId, "favorite")}
                canDelete={canDeleteItem(
                  selectedItem.vaultId,
                  itemsControllerRef.current?.getItemCreatedByUserId(selectedItem.itemId),
                )}
                canArchive={canUseFunction(selectedItem.vaultId, "archive")}
                canChangeFolder={!selectedItem.deleted}
                deletedItemsRetentionDays={
                  currentWorkspace?.deletedItemsRetentionDays ?? DEFAULT_DELETED_ITEMS_RETENTION_DAYS
                }
                onEdit={() => openItemInWeb(selectedItem.itemId, { popup: "editItem" })}
                onCreateCapsule={() => openItemInWeb(selectedItem.itemId, { popup: "newCapsule" })}
                onToggleFavorite={() => {
                  void onToggleFavorite(
                    selectedItem.itemId,
                    !itemFavoriteByItemId.has(selectedItem.itemId),
                  );
                }}
                onToggleArchive={() => {
                  void onToggleArchive(selectedItem);
                }}
                onToggleDelete={(deleted) => onToggleDelete(selectedItem, deleted)}
                onAssignFolder={(folderId) => onAssignFolder(selectedItem.itemId, folderId)}
                onCreateFolder={onCreateFolder}
                onOpenInWeb={() => openItemInWeb(selectedItem.itemId)}
                t={t}
              />
            )}
          </main>
        </div>
      </div>
      )}
    </OkkeyAppSidebar>
  );
}
