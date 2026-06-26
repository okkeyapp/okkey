import { ApiRequestError } from "@okkey/api";
import type { Vault, Workspace } from "@okkey/types";
import {
  cn,
  DropdownMenuItem,
  okkeyWorkspaceShellNavItems,
  PersonalWorkspaceMark,
  Spinner,
  type OkkeyAppSidebarAccountMenu,
  type OkkeySidebarFolderTreeNode,
  type OkkeySidebarVaultItem,
  workspaceSwitcherActiveItemClassName,
} from "@okkey/ui";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import AppShellNavLink from "../components/workspace/AppShellNavLink";
import { useAuthVault, useAuthenticatedCoreClient } from "../auth/AuthVaultContext";
import SettingsPopup from "../components/settings/SettingsPopup";
import NewItemPopup from "../components/items/NewItemPopup";
import {
  clearStoredCurrentWorkspaceId,
  readStoredCurrentWorkspaceId,
  writeStoredCurrentWorkspaceId,
} from "../auth/workspaceStorage";
import WorkspaceSidebarLayout from "../components/workspace/WorkspaceSidebarLayout";
import { useItemsMobileListView } from "../hooks/useItemsMobileListView";
import { useLocale } from "../locale/LocaleContext";
import {
  CAPSULES_PATH,
  FOLDER_QUERY_PARAM,
  ITEMS_PATH,
  itemsPathAllWorkspaceMerged,
  itemsPathWithFolderMerged,
  itemsPathWithVaultMerged,
  MONITORING_PATH,
  SEARCH_QUERY_PARAM,
  SETTINGS_PATH,
  TOOLS_PATH,
  VAULT_QUERY_PARAM,
  WORKSPACE_QUERY_PARAM,
  WORKSPACES_PATH,
  type WorkspaceAppShellPath,
} from "../routes/paths";
import { NEW_ITEM_POPUP_ID, popupQuerySearch } from "../routes/popupQuery";
import { planTierLabel } from "./planTierLabel";

const PERSONAL_WORKSPACE_TILE_COLOR = "#3B82F6";

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

function WorkspaceTileAvatar({ workspace, sizeClass }: { workspace?: Workspace; sizeClass: string }) {
  if (!workspace) {
    return <div className={cn("shrink-0 rounded-lg bg-muted", sizeClass)} />;
  }
  const isFree = workspace.planTier === "FREE";
  if (isFree) {
    return (
      <div className={cn("shrink-0 overflow-hidden rounded-lg", sizeClass)}>
        <PersonalWorkspaceMark fillColor={PERSONAL_WORKSPACE_TILE_COLOR} className="block size-full" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-lg leading-none",
        sizeClass,
      )}
      aria-hidden
    >
      💼
    </div>
  );
}

function shellTitleKey(pathname: WorkspaceAppShellPath): string {
  switch (pathname) {
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
  const { userId, profile, logout } = useAuthVault();
  const core = useAuthenticatedCoreClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname as WorkspaceAppShellPath;

  const workspaceParam = searchParams.get(WORKSPACE_QUERY_PARAM)?.trim() ?? "";
  const vaultQ = searchParams.get(VAULT_QUERY_PARAM)?.trim() ?? "";
  const folderQ = searchParams.get(FOLDER_QUERY_PARAM)?.trim() ?? "";
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
      settings: SETTINGS_PATH,
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
          isActive: pathname === ITEMS_PATH && !vaultQ && !folderQ && !searchQ,
          onAddPointerDown: (e) => {
            e.preventDefault();
            openNewItemPopup();
          },
        };
      }
      return {
        ...item,
        isActive: item.to === pathname,
      };
    });
  }, [navPaths, pathname, t, vaultQ, folderQ, searchQ, searchParams, openNewItemPopup, itemsPathMergeOptions]);

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
      isActive: pathname === ITEMS_PATH && vaultQ === v.id && !folderQ && !searchQ,
    }));
  }, [vaults, pathname, vaultQ, folderQ, searchQ, searchParams, itemsPathMergeOptions]);

  const itemsDemoFolderDocsId = "fld-docs";
  const itemsDemoFolderCardsId = "fld-cards";

  const folderTreeForItems: OkkeySidebarFolderTreeNode[] = useMemo(
    () => [
      {
        id: itemsDemoFolderDocsId,
        label: "Documents",
        to: itemsPathWithFolderMerged(searchParams, itemsDemoFolderDocsId, itemsPathMergeOptions),
        isActive: pathname === ITEMS_PATH && folderQ === itemsDemoFolderDocsId && !vaultQ && !searchQ,
      },
      {
        id: itemsDemoFolderCardsId,
        label: "Cards",
        to: itemsPathWithFolderMerged(searchParams, itemsDemoFolderCardsId, itemsPathMergeOptions),
        isActive: pathname === ITEMS_PATH && folderQ === itemsDemoFolderCardsId && !vaultQ && !searchQ,
      },
    ],
    [pathname, folderQ, vaultQ, searchQ, searchParams, itemsPathMergeOptions],
  );

  const currentWorkspace = useMemo(
    () => workspaceList.find((w) => w.id === resolvedWorkspaceId),
    [workspaceList, resolvedWorkspaceId],
  );

  /**
   * `/items`: at most one of `vault`, `folder`, or `search`. If `search` is set with vault/folder,
   * drop vault and folder (search scope). If both vault and folder, drop folder (vault wins).
   */
  useEffect(() => {
    const conflictSearch = Boolean(searchQ && (vaultQ || folderQ));
    const conflictVaultFolder = Boolean(vaultQ && folderQ);
    if (!conflictSearch && !conflictVaultFolder) {
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (searchQ) {
          next.delete(VAULT_QUERY_PARAM);
          next.delete(FOLDER_QUERY_PARAM);
        } else if (vaultQ && folderQ) {
          next.delete(FOLDER_QUERY_PARAM);
        }
        return next;
      },
      { replace: true },
    );
  }, [vaultQ, folderQ, searchQ, setSearchParams]);

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

  const title = t(shellTitleKey(pathname));
  const description = currentWorkspace?.name ?? t("workspaces.shellId", { id: resolvedWorkspaceId });

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
          <>
            <NewItemPopup t={t} workspaceId={resolvedWorkspaceId} />
            <WorkspaceSidebarLayout
            title={title}
            description={description}
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
            footerPlainLinkLabels={{
              documentation: t("web.nav.documentation"),
              help: t("web.nav.help"),
            }}
            vaultHeaderPlusAriaLabel={t("web.nav.createVault")}
            folderHeaderPlusAriaLabel={t("web.nav.createFolder")}
            itemsListVaults={vaults}
            itemsListVaultsLoaded={vaultsListReady}
            itemsListFolderTree={folderTreeForItems}
          >
            <Outlet context={{ workspaceId: resolvedWorkspaceId }} />
          </WorkspaceSidebarLayout>
          </>
        );
      }}
    </SettingsPopup>
  );
}
