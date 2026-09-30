import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ForwardedRef } from "react";
import type { CoreApiClient } from "@okkey/api";
import { getWebLocaleNativeName, WEB_LOCALES, type WebLocale } from "@okkey/i18n";
import type { ItemPlaintextV2, Vault, Workspace } from "@okkey/types";
import type { UnlockWithMasterPasswordResult } from "@okkey/vault";
import {
  createWorkspaceFoldersSyncController,
  createWorkspaceVaultItemsReadController,
  findWorkspaceFolderPathById,
  formatTagSearchQuery,
  itemPlaintextToExtensionListRecord,
  resolveVaultItemEncryptionKey,
  scoreItemsListRecordSearch,
  toSidebarFolderTree,
  type ExtensionItemListRecord,
  type WorkspaceFolderNode,
} from "@okkey/vault";
import {
  Button,
  DropdownMenuItem,
  OkkeyAppSidebar,
  OkkeyAppSidebarToolbar,
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
import {
  buildEditItemDeepLink,
  buildItemsDeepLink,
  buildNewCapsuleDeepLink,
  buildNewItemDeepLink,
  openWebDeepLink,
} from "../../lib/deepLinks";
import { touchExtensionUnlockSession } from "../../lib/extensionVaultSession";
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
  idleLockMs?: number;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ExtensionListFilter>("all");
  const [sort, setSort] = useState<ExtensionListSort>("date_desc");
  const [vaultFilterId, setVaultFilterId] = useState<string | null>(null);
  const [folderFilterId, setFolderFilterId] = useState<string | null>(null);
  const [categoryFilterId, setCategoryFilterId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  const foldersDisposeRef = useRef<(() => void) | null>(null);
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
  }, [core, userId]);

  const loadFolders = useCallback(
    async (wsId: string) => {
      const gen = ++foldersLoadGenRef.current;
      foldersDisposeRef.current?.();
      foldersDisposeRef.current = null;
      const controller = createWorkspaceFoldersSyncController({
        core,
        userId,
        workspaceId: wsId,
        passwordShareC: secrets.passwordShareC,
      });
      foldersDisposeRef.current = () => controller.dispose();
      try {
        await controller.refresh();
        if (gen !== foldersLoadGenRef.current) {
          return;
        }
        setFolderNodes(controller.toFolderTree());
        setItemFolderByItemId(new Map(controller.getState().itemFolder));
        setItemFavoriteByItemId(new Set(controller.getState().itemFavorite));
      } catch (err: unknown) {
        if (gen !== foldersLoadGenRef.current) {
          return;
        }
        console.error("[extension] folder sync failed", err);
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
        disposeRef.current = () => controller.dispose();
        await controller.refresh();
        setItems(controller.getAllItems());

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
        await loadFolders(wsId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setItems([]);
        setVaults([]);
        setFolderNodes([]);
        setVaultKeyById(new Map());
      } finally {
        setLoading(false);
      }
    },
    [core, encryptedPrivateKeyPayload, loadFolders, secrets.vaultKey, userId],
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
    if (vaultFilterId) {
      scoped = scoped.filter((row) => row.vaultId === vaultFilterId);
    }
    if (folderFilterId) {
      scoped = scoped.filter((row) => row.folderId === folderFilterId);
    }
    if (categoryFilterId) {
      scoped = scoped.filter((row) => row.categoryId === categoryFilterId);
    }

    const filtered = filterRows(scoped, filter);
    const needle = search.trim();
    if (!needle) {
      return [...filtered].sort((a, b) => compareRows(a, b, sort));
    }
    return filtered
      .map((row) => ({ row, score: scoreItemsListRecordSearch(row, needle) }))
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

  const pickVaultScope = useCallback((id: string) => {
    setVaultFilterId(id);
    setFolderFilterId(null);
    setCategoryFilterId(null);
    setFilter("all");
    setSelectedId(null);
  }, []);

  const pickFolderScope = useCallback((id: string) => {
    setFolderFilterId(id);
    setVaultFilterId(null);
    setCategoryFilterId(null);
    setFilter("all");
    setSelectedId(null);
  }, []);

  const pickCategoryScope = useCallback((id: string) => {
    setCategoryFilterId(id);
    setVaultFilterId(null);
    setFolderFilterId(null);
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
    if (!workspaceId) return;
    if (extra?.popup === "editItem") {
      void openWebDeepLink(buildEditItemDeepLink({ webBaseUrl, workspaceId, itemId }));
      return;
    }
    if (extra?.popup === "newCapsule") {
      void openWebDeepLink(buildNewCapsuleDeepLink({ webBaseUrl, workspaceId, itemId }));
      return;
    }
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
              logoutLabel: signOutLabel,
              changeServerLabel: t("web.accountMenu.changeServer"),
              onLogout: onSignOut,
              onChangeServer,
              language: languageMenu,
            }
          : undefined
      }
    >
      <div className="flex h-full min-h-0 w-full flex-col bg-background text-foreground">
        <header className="flex h-[52px] shrink-0 items-center gap-2 bg-[hsl(var(--extension-shell-header))] p-2">
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
              className="h-9 shrink-0 gap-1.5 rounded-lg px-3"
              aria-label={t("extension.vault.lock")}
              onClick={onLock}
            >
              <LockIcon />
              <span className="text-sm font-medium">{t("extension.vault.lock")}</span>
            </Button>
            <Button
              type="button"
              variant="default"
              className="size-9 min-h-9 min-w-9 shrink-0 rounded-lg p-0"
              aria-label={t("web.items.createRecord")}
              onClick={openNewItem}
            >
              <PlusIcon />
            </Button>
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
                clearScope();
              }}
              onSortChange={setSort}
              onSelect={onSelectItem}
              onClearScope={clearScope}
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
                folderLabel={selectedFolderLabel}
                actorLabel={actorLabel}
                apiBaseUrl={apiBaseUrl}
                accessToken={accessToken}
                vaultKey={resolveVaultKey(selectedItem.vaultId)}
                locale={locale}
                onEdit={() => openItemInWeb(selectedItem.itemId, { popup: "editItem" })}
                onCreateCapsule={() => openItemInWeb(selectedItem.itemId, { popup: "newCapsule" })}
                onFavoriteInWeb={() => openItemInWeb(selectedItem.itemId)}
                onArchiveInWeb={() => openItemInWeb(selectedItem.itemId)}
                onDeleteInWeb={() => openItemInWeb(selectedItem.itemId)}
                onOpenInWeb={() => openItemInWeb(selectedItem.itemId)}
                t={t}
              />
            )}
          </main>
        </div>
      </div>
    </OkkeyAppSidebar>
  );
}
