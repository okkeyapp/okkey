import { ApiRequestError } from "@okkey/api";
import type { Vault, Workspace } from "@okkey/types";
import {
  DEFAULT_ALLOWED_FILE_EXTENSIONS,
  DEFAULT_DELETED_ITEMS_RETENTION_DAYS,
  DEFAULT_MAX_FILE_SIZE_MB,
} from "@okkey/types";
import {
  cn,
  DropdownMenuItem,
  okkeyWorkspaceShellNavItems,
  Spinner,
  type OkkeyAppSidebarAccountMenu,
  type OkkeySidebarFolderTreeNode,
  type OkkeySidebarVaultItem,
  workspaceSwitcherActiveItemClassName,
} from "@okkey/ui";
import { useEffect, useMemo, useRef, useState, useCallback, type ComponentProps } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import AppShellNavLink from "../components/workspace/AppShellNavLink";
import { useAuthVault, useAuthenticatedCoreClient } from "../auth/AuthVaultContext";
import { WorkspaceFoldersProvider, useWorkspaceFolders, useWorkspaceFoldersState } from "../folders/WorkspaceFoldersContext";
import { WorkspaceItemsProvider, useWorkspaceItemsState } from "../items/WorkspaceItemsContext";
import { WorkspaceItemTemplatesProvider } from "../items/WorkspaceItemTemplatesContext";
import { ItemCategoryPreferencesProvider } from "../components/items/ItemCategoryPreferencesContext";
import { toSidebarFolderTree, workspaceFolderIdExists } from "../folders/workspaceFolderTree";
import { isItemCategoryId } from "../components/items/itemCategoryCatalog";
import FoldersSettingsPopup from "../components/folders/FoldersSettingsPopup";
import SettingsPopup from "../components/settings/SettingsPopup";
import NewItemPopup from "../components/items/NewItemPopup";
import EditItemPopup from "../components/items/EditItemPopup";
import {
  buildPopupQueryValue,
  FOLDERS_POPUP_ID,
  NEW_ITEM_POPUP_ID,
  popupQuerySearch,
} from "../routes/popupQuery";
import {
  clearStoredCurrentWorkspaceId,
  readStoredCurrentWorkspaceId,
  writeStoredCurrentWorkspaceId,
} from "../auth/workspaceStorage";
import WorkspaceSidebarLayout from "../components/workspace/WorkspaceSidebarLayout";
import WorkspaceTileAvatar from "../components/workspace/WorkspaceTileAvatar";
import { useItemsMobileListView } from "../hooks/useItemsMobileListView";
import { useLocale } from "../locale/LocaleContext";
import {
  CAPSULES_PATH,
  CATEGORY_QUERY_PARAM,
  FOLDER_QUERY_PARAM,
  ITEMS_PATH,
  itemsPathAllWorkspaceMerged,
  itemsPathWithFolderMerged,
  itemsPathWithVaultMerged,
  MONITORING_PATH,
  SEARCH_QUERY_PARAM,
  SETTINGS_PATH,
  settingsPath,
  isSettingsPathname,
  TOOLS_PATH,
  VAULT_QUERY_PARAM,
  WORKSPACE_APP_SHELL_PATHS,
  WORKSPACE_QUERY_PARAM,
  WORKSPACES_PATH,
  type WorkspaceAppShellPath,
} from "../routes/paths";
import { planTierLabel } from "./planTierLabel";

function ShellChevrons({ className }: { className?: string }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
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

function resolveWorkspaceShellPath(pathname: string): WorkspaceAppShellPath | null {
  if ((WORKSPACE_APP_SHELL_PATHS as readonly string[]).includes(pathname)) {
    return pathname as WorkspaceAppShellPath;
  }
  if (isSettingsPathname(pathname)) {
    return SETTINGS_PATH;
  }
  return null;
}

function isWorkspaceAppShellPath(pathname: string): pathname is WorkspaceAppShellPath {
  return resolveWorkspaceShellPath(pathname) !== null;
}

function shellTitleKey(pathname: string): string {
  const shellPath = resolveWorkspaceShellPath(pathname);
  if (!shellPath) {
    return "workspaces.shellTitle";
  }
  switch (shellPath) {
    case ITEMS_PATH:
      return "web.shell.itemsTitle";
    case CAPSULES_PATH:
      return "web.shell.capsulesTitle";
    case MONITORING_PATH:
      return "web.shell.monitoringTitle";
    case TOOLS_PATH:
      return "web.shell.toolsTitle";
    case SETTINGS_PATH:
      return "web.shell.settingsTitle";
    default:
      return "workspaces.shellTitle";
  }
}

export default function WorkspaceRoutesLayout() {
  const { t } = useLocale();
  const { userId, profile, logout, passwordShareC, vaultKey, vaultUnlocked } = useAuthVault();
  const core = useAuthenticatedCoreClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  const workspaceParam = searchParams.get(WORKSPACE_QUERY_PARAM)?.trim() ?? "";
  const vaultQ = searchParams.get(VAULT_QUERY_PARAM)?.trim() ?? "";
  const folderQ = searchParams.get(FOLDER_QUERY_PARAM)?.trim() ?? "";
  const categoryQ = searchParams.get(CATEGORY_QUERY_PARAM)?.trim() ?? "";
  const searchQ = searchParams.get(SEARCH_QUERY_PARAM)?.trim() ?? "";
  const isItemsMobileListView = useItemsMobileListView();
  const itemsPathMergeOptions = useMemo(
    () => (isItemsMobileListView ? { clearItem: true as const } : undefined),
    [isItemsMobileListView],
  );

  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState<string | null>(null);
  const [workspaceList, setWorkspaceList] = useState<Workspace[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [vaultsListReady, setVaultsListReady] = useState(false);
  const navigateRef = useRef(navigate);
  const setSearchParamsRef = useRef(setSearchParams);

  const refreshWorkspaces = useCallback(async () => {
    if (!core) {
      return;
    }
    const list = await core.listWorkspaces();
    setWorkspaceList(list);
  }, [core]);

  const patchWorkspace = useCallback((workspaceId: string, patch: Partial<Workspace>) => {
    setWorkspaceList((previous) =>
      previous.map((workspace) => (workspace.id === workspaceId ? { ...workspace, ...patch } : workspace)),
    );
  }, []);

  useEffect(() => {
    navigateRef.current = navigate;
    setSearchParamsRef.current = setSearchParams;
  }, [navigate, setSearchParams]);

  const navPaths = useMemo(
    () => ({
      items: ITEMS_PATH,
      capsules: CAPSULES_PATH,
      monitoring: MONITORING_PATH,
      tools: TOOLS_PATH,
      settings: settingsPath("general"),
    }),
    [],
  );

  const openNewItemPopup = useCallback(() => {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, NEW_ITEM_POPUP_ID),
        hash: location.hash,
      },
      { replace: false },
    );
  }, [navigate, location]);

  const workspaceNavItems = useMemo(() => {
    const labels = {
      allItems: t("web.nav.allItems"),
      capsules: t("web.nav.capsules"),
      monitoring: t("web.nav.monitoring"),
      tools: t("web.nav.tools"),
      settings: t("web.nav.settings"),
      addRecords: t("web.items.createRecord"),
      addCapsule: t("web.nav.addCapsule"),
    };
    const base = okkeyWorkspaceShellNavItems(navPaths, labels);
    return base.map((item) => {
      const isItemsEntry = item.to === ITEMS_PATH;
      if (isItemsEntry) {
        return {
          ...item,
          to: itemsPathAllWorkspaceMerged(searchParams, itemsPathMergeOptions),
          isActive: pathname === ITEMS_PATH && !vaultQ && !folderQ && !categoryQ && !searchQ,
          onAddPointerDown: (e) => {
            e.preventDefault();
            openNewItemPopup();
          },
        };
      }
      return {
        ...item,
        isActive: item.to.startsWith(SETTINGS_PATH) ? isSettingsPathname(pathname) : item.to === pathname,
      };
    });
  }, [navPaths, pathname, t, vaultQ, folderQ, categoryQ, searchQ, searchParams, openNewItemPopup, itemsPathMergeOptions]);

  // Vault rows: each link is `/items?vault=…`. Active when that vault id matches the query and we are not in folder-only mode (`folder` is cleared if both were set).
  const vaultSidebarItems: OkkeySidebarVaultItem[] = useMemo(() => {
    return vaults.map((v) => ({
      id: v.id,
      leading: (
        <span className="text-base leading-none" aria-hidden>
          {v.isPersonal ? "🏠" : "💼"}
        </span>
      ),
      label: v.name,
      to: itemsPathWithVaultMerged(searchParams, v.id, itemsPathMergeOptions),
      isActive: pathname === ITEMS_PATH && vaultQ === v.id && !folderQ && !categoryQ && !searchQ,
    }));
  }, [vaults, pathname, vaultQ, folderQ, categoryQ, searchQ, searchParams, itemsPathMergeOptions]);

  const currentWorkspace = useMemo(
    () => workspaceList.find((w) => w.id === resolvedWorkspaceId),
    [workspaceList, resolvedWorkspaceId],
  );

  const workspaceFoldersState = useWorkspaceFoldersState({
    userId: userId ?? "",
    workspaceId: resolvedWorkspaceId ?? "",
    core,
    passwordShareC,
    vaultUnlocked,
  });

  const openFoldersSettingsPopup = useCallback(() => {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(FOLDERS_POPUP_ID)),
        hash: location.hash,
      },
      { replace: false },
    );
  }, [location.hash, location.pathname, location.search, navigate]);

  const folderTreeForItems: OkkeySidebarFolderTreeNode[] = useMemo(
    () =>
      toSidebarFolderTree(
        workspaceFoldersState.folderTree,
        (folderId) => itemsPathWithFolderMerged(searchParams, folderId, itemsPathMergeOptions),
        folderQ,
      ),
    [workspaceFoldersState.folderTree, searchParams, itemsPathMergeOptions, folderQ],
  );

  /**
   * `/items`: at most one of `vault`, `folder`, `category`, or `search`. If `search` is set with other scopes,
   * drop them (search scope). If both vault and folder, drop folder (vault wins). Vault/folder drop category.
   */
  useEffect(() => {
    const conflictSearch = Boolean(searchQ && (vaultQ || folderQ || categoryQ));
    const conflictVaultFolder = Boolean(vaultQ && folderQ);
    const conflictCategoryWithVaultOrFolder = Boolean(categoryQ && (vaultQ || folderQ));
    if (!conflictSearch && !conflictVaultFolder && !conflictCategoryWithVaultOrFolder) {
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (searchQ) {
          next.delete(VAULT_QUERY_PARAM);
          next.delete(FOLDER_QUERY_PARAM);
          next.delete(CATEGORY_QUERY_PARAM);
        } else if (vaultQ && folderQ) {
          next.delete(FOLDER_QUERY_PARAM);
        } else if (categoryQ && (vaultQ || folderQ)) {
          next.delete(CATEGORY_QUERY_PARAM);
        }
        return next;
      },
      { replace: true },
    );
  }, [vaultQ, folderQ, categoryQ, searchQ, setSearchParams]);

  /** Drop stale `vault` / `folder` / `category` query params when the id is unknown in the current workspace. */
  useEffect(() => {
    if (pathname !== ITEMS_PATH) {
      return;
    }

    const unknownVault = Boolean(vaultQ && vaultsListReady && !vaults.some((vault) => vault.id === vaultQ));
    const foldersReady =
      vaultUnlocked && workspaceFoldersState.bootstrapped && !workspaceFoldersState.loading;
    const unknownFolder = Boolean(
      folderQ &&
        foldersReady &&
        !workspaceFolderIdExists(workspaceFoldersState.folderTree, folderQ),
    );
    const unknownCategory = Boolean(categoryQ && !isItemCategoryId(categoryQ));

    if (!unknownVault && !unknownFolder && !unknownCategory) {
      return;
    }

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (unknownVault) {
          next.delete(VAULT_QUERY_PARAM);
        }
        if (unknownFolder) {
          next.delete(FOLDER_QUERY_PARAM);
        }
        if (unknownCategory) {
          next.delete(CATEGORY_QUERY_PARAM);
        }
        return next;
      },
      { replace: true },
    );
  }, [
    pathname,
    vaultQ,
    folderQ,
    categoryQ,
    vaults,
    vaultsListReady,
    vaultUnlocked,
    workspaceFoldersState.bootstrapped,
    workspaceFoldersState.loading,
    workspaceFoldersState.folderTree,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!core || !userId) {
      return;
    }
    const hasResolvedWorkspace = Boolean(resolvedWorkspaceId && workspaceList.length > 0);
    if (!workspaceParam && hasResolvedWorkspace) {
      return;
    }

    if (!hasResolvedWorkspace) {
      setPhase("loading");
    }
    let cancelled = false;

    void (async () => {
      try {
        const list = await core.listWorkspaces();
        if (cancelled) {
          return;
        }

        const fromQuery = workspaceParam;
        const fromLs = readStoredCurrentWorkspaceId(userId);
        const candidate = fromQuery || fromLs || "";
        const pickSingle = list.length === 1 ? list[0].id : "";
        const resolved = candidate || pickSingle;

        if (!resolved || !list.some((w) => w.id === resolved)) {
          clearStoredCurrentWorkspaceId(userId);
          navigateRef.current(WORKSPACES_PATH, { replace: true });
          return;
        }

        writeStoredCurrentWorkspaceId(userId, resolved);
        setWorkspaceList(list);

        if (fromQuery) {
          setSearchParamsRef.current(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete(WORKSPACE_QUERY_PARAM);
              return next;
            },
            { replace: true },
          );
        }

        setResolvedWorkspaceId(resolved);
        setPhase("ready");
      } catch (e) {
        if (cancelled) {
          return;
        }
        if (e instanceof ApiRequestError) {
          navigateRef.current(WORKSPACES_PATH, { replace: true });
        } else {
          navigateRef.current(WORKSPACES_PATH, { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [core, userId, workspaceParam, resolvedWorkspaceId, workspaceList.length]);

  useEffect(() => {
    if (!core || !resolvedWorkspaceId) {
      setVaultsListReady(false);
      return;
    }
    let cancelled = false;
    setVaultsListReady(false);
    setVaults([]);
    void (async () => {
      try {
        const list = await core.listWorkspaceVaults(resolvedWorkspaceId);
        if (!cancelled) {
          setVaults(list);
        }
      } catch {
        if (!cancelled) {
          setVaults([]);
        }
      } finally {
        if (!cancelled) {
          setVaultsListReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, resolvedWorkspaceId]);

  const workspaceSwitcherTrigger = useMemo(() => {
    return ({ expanded }: { expanded: boolean }) => (
      <>
        <WorkspaceTileAvatar workspace={currentWorkspace} sizeClass={expanded ? "size-8" : "size-9"} />
        {expanded ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-5 text-foreground">
                {currentWorkspace?.name ?? "…"}
              </p>
              <p className="truncate text-xs font-normal leading-4 text-muted-foreground">
                {currentWorkspace ? planTierLabel(currentWorkspace.planTier, t) : ""}
              </p>
            </div>
            <ShellChevrons />
          </>
        ) : null}
      </>
    );
  }, [currentWorkspace, t]);

  const workspaceSwitcherDropdown = useMemo(() => {
    if (!userId) {
      return null;
    }
    return (
      <>
        <div className="p-1">
          {workspaceList.map((ws) => {
            const active = ws.id === resolvedWorkspaceId;
            return (
              <DropdownMenuItem
                key={ws.id}
                className={cn(
                  "h-auto cursor-pointer items-center gap-3",
                  active ? workspaceSwitcherActiveItemClassName : undefined,
                )}
                onClick={() => {
                  writeStoredCurrentWorkspaceId(userId, ws.id);
                  setResolvedWorkspaceId(ws.id);
                  setPhase("ready");
                  navigate(ITEMS_PATH);
                }}
              >
                <WorkspaceTileAvatar workspace={ws} sizeClass="size-8" />
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold leading-5 text-foreground">{ws.name}</p>
                  <p className="truncate text-xs leading-4 text-muted-foreground">{planTierLabel(ws.planTier, t)}</p>
                </div>
                {active ? <span className="shrink-0 text-primary">✓</span> : null}
              </DropdownMenuItem>
            );
          })}
        </div>
        <div className="border-t border-border" role="presentation" />
        <div className="p-1">
          <DropdownMenuItem className="cursor-pointer justify-center gap-2 text-muted-foreground" disabled>
            <span className="text-sm">+</span>
            <span>{t("workspaces.createLine1")}</span>
          </DropdownMenuItem>
        </div>
      </>
    );
  }, [workspaceList, resolvedWorkspaceId, userId, navigate, t]);

  if (phase === "loading" || !resolvedWorkspaceId) {
    return (
      <div
        className="flex min-h-[100dvh] w-full items-center justify-center okkey-body text-copy-secondary"
        role="status"
        aria-busy="true"
      >
        <Spinner />
      </div>
    );
  }

  const isShellNotFound = resolveWorkspaceShellPath(pathname) === null;
  const title = isShellNotFound ? t("web.notFound.title") : t(shellTitleKey(pathname));
  const description = isShellNotFound
    ? ""
    : currentWorkspace?.name ?? t("workspaces.shellId", { id: resolvedWorkspaceId });

  return (
    <SettingsPopup t={t}>
      {({ openSettingsPopup }) => {
        const email = profile?.email?.trim();
        const accountMenu: OkkeyAppSidebarAccountMenu | undefined = email
          ? {
              firstName: profile?.firstName,
              lastName: profile?.lastName,
              email,
              settingsLabel: t("web.accountMenu.settings"),
              logoutLabel: t("web.accountMenu.logout"),
              onSettings: openSettingsPopup,
              onLogout: logout,
            }
          : undefined;

        return (
          <WorkspaceFoldersProvider value={workspaceFoldersState}>
            <WorkspaceShellWithItems
              isShellNotFound={isShellNotFound}
              t={t}
              title={title}
              description={description}
              pathname={pathname}
              resolvedWorkspaceId={resolvedWorkspaceId}
              currentWorkspaceName={currentWorkspace?.name ?? ""}
              deletedItemsRetentionDays={
                currentWorkspace?.deletedItemsRetentionDays ?? DEFAULT_DELETED_ITEMS_RETENTION_DAYS
              }
              allowedFileExtensions={
                currentWorkspace?.allowedFileExtensions ?? DEFAULT_ALLOWED_FILE_EXTENSIONS
              }
              maxFileSizeMb={currentWorkspace?.maxFileSizeMb ?? DEFAULT_MAX_FILE_SIZE_MB}
              filesInItemsEnabled={currentWorkspace?.filesInItemsEnabled ?? true}
              currentWorkspace={currentWorkspace}
              vaults={vaults}
              vaultsListReady={vaultsListReady}
              workspaceNavItems={workspaceNavItems}
              workspaceSwitcherTrigger={workspaceSwitcherTrigger}
              workspaceSwitcherDropdown={workspaceSwitcherDropdown}
              vaultSidebarItems={vaultSidebarItems}
              folderTreeForItems={folderTreeForItems}
              accountMenu={accountMenu}
              footerPlainLinkLabels={{
                documentation: t("web.nav.documentation"),
                help: t("web.nav.help"),
              }}
              openFoldersSettingsPopup={openFoldersSettingsPopup}
              core={core}
              userId={userId ?? ""}
              vaultKey={vaultKey}
              vaultUnlocked={vaultUnlocked}
              workspaceFoldersBootstrapped={workspaceFoldersState.bootstrapped}
              refreshWorkspaces={refreshWorkspaces}
              patchWorkspace={patchWorkspace}
            />
          </WorkspaceFoldersProvider>
        );
      }}
    </SettingsPopup>
  );
}

type WorkspaceShellWithItemsProps = {
  t: (messageKey: string) => string;
  title: string;
  description: string;
  pathname: string;
  isShellNotFound: boolean;
  resolvedWorkspaceId: string;
  currentWorkspaceName: string;
  deletedItemsRetentionDays: number;
  allowedFileExtensions: readonly string[];
  maxFileSizeMb: number;
  filesInItemsEnabled: boolean;
  currentWorkspace?: Workspace;
  vaults: Vault[];
  vaultsListReady: boolean;
  workspaceNavItems: ReturnType<typeof okkeyWorkspaceShellNavItems>;
  workspaceSwitcherTrigger: ComponentProps<typeof WorkspaceSidebarLayout>["workspaceSwitcherTrigger"];
  workspaceSwitcherDropdown: ComponentProps<typeof WorkspaceSidebarLayout>["workspaceSwitcherDropdown"];
  vaultSidebarItems: OkkeySidebarVaultItem[];
  folderTreeForItems: OkkeySidebarFolderTreeNode[];
  accountMenu: OkkeyAppSidebarAccountMenu | undefined;
  footerPlainLinkLabels: { documentation: string; help: string };
  openFoldersSettingsPopup: () => void;
  core: ReturnType<typeof useAuthenticatedCoreClient>;
  userId: string;
  vaultKey: Uint8Array | null;
  vaultUnlocked: boolean;
  workspaceFoldersBootstrapped: boolean;
  refreshWorkspaces: () => Promise<void>;
  patchWorkspace: (workspaceId: string, patch: Partial<Workspace>) => void;
};

function WorkspaceShellWithItems({
  t,
  title,
  description,
  pathname,
  isShellNotFound,
  resolvedWorkspaceId,
  currentWorkspaceName,
  deletedItemsRetentionDays,
  allowedFileExtensions,
  maxFileSizeMb,
  filesInItemsEnabled,
  currentWorkspace,
  vaults,
  vaultsListReady,
  workspaceNavItems,
  workspaceSwitcherTrigger,
  workspaceSwitcherDropdown,
  vaultSidebarItems,
  folderTreeForItems,
  accountMenu,
  footerPlainLinkLabels,
  openFoldersSettingsPopup,
  core,
  userId,
  vaultKey,
  vaultUnlocked,
  workspaceFoldersBootstrapped,
  refreshWorkspaces,
  patchWorkspace,
}: WorkspaceShellWithItemsProps) {
  const { itemFolderByItemId, itemFavoriteByItemId } = useWorkspaceFolders();
  const workspaceItemsState = useWorkspaceItemsState({
    userId,
    workspaceId: resolvedWorkspaceId,
    core,
    vaults,
    vaultsListReady,
    vaultKey,
    vaultUnlocked,
    itemFolderByItemId,
    itemFavoriteByItemId,
    deletedItemsRetentionDays,
    allowedFileExtensions,
    maxFileSizeMb,
    filesInItemsEnabled,
  });

  return (
    <WorkspaceItemTemplatesProvider workspaceId={resolvedWorkspaceId}>
      <ItemCategoryPreferencesProvider workspaceId={resolvedWorkspaceId}>
        <WorkspaceItemsProvider value={workspaceItemsState}>
          <NewItemPopup
            t={t}
            workspaceId={resolvedWorkspaceId}
            workspaceName={currentWorkspaceName}
            vaults={vaults}
            vaultsListReady={vaultsListReady}
          />
          <EditItemPopup
            t={t}
            workspaceId={resolvedWorkspaceId}
            workspaceName={currentWorkspaceName}
            vaults={vaults}
            vaultsListReady={vaultsListReady}
          />
          <FoldersSettingsPopup t={t} />
          <WorkspaceSidebarLayout
            title={title}
            description={description}
            hideShellMainHeader={isShellNotFound || isSettingsPathname(pathname)}
            mainColumnLayout={pathname === ITEMS_PATH ? "items-two-pane" : "single"}
            workspaceNavItems={workspaceNavItems}
            workspaceNavLink={AppShellNavLink}
            workspaceNavGroupLabel={t("workspaces.shellTitle")}
            workspaceSwitcherTrigger={workspaceSwitcherTrigger}
            workspaceSwitcherDropdown={workspaceSwitcherDropdown}
            vaultItems={vaultSidebarItems}
            vaultNavLink={AppShellNavLink}
            vaultSectionTitle={t("web.nav.vaultsSection")}
            folderTree={folderTreeForItems}
            folderNavLink={AppShellNavLink}
            folderSectionTitle={t("web.nav.foldersSection")}
            folderEmptyLabel={t("web.nav.foldersEmpty")}
            accountMenu={accountMenu}
            footerPlainLinkLabels={footerPlainLinkLabels}
            vaultHeaderPlusAriaLabel={t("web.nav.createVault")}
            folderHeaderPlusAriaLabel={t("web.nav.folderSettings")}
            onFolderHeaderActionClick={openFoldersSettingsPopup}
            itemsListVaults={vaults}
            itemsListVaultsLoaded={vaultsListReady}
            itemsListFolderTree={folderTreeForItems}
            itemsListFoldersLoaded={workspaceFoldersBootstrapped}
            itemsListRecords={workspaceItemsState.records}
            itemsListRecordsLoaded={workspaceItemsState.bootstrapped}
          >
            <Outlet
              context={{
                workspaceId: resolvedWorkspaceId,
                vaults,
                workspace: currentWorkspace,
                refreshWorkspaces,
                patchWorkspace,
              }}
            />
          </WorkspaceSidebarLayout>
        </WorkspaceItemsProvider>
      </ItemCategoryPreferencesProvider>
    </WorkspaceItemTemplatesProvider>
  );
}
