import { ApiRequestError } from "@okkey/api";
import type { Vault, Workspace, WorkspacePermissionsMatrixDto } from "@okkey/types";
import {
  hasPlanFeature,
  normalizeWorkspacePermissionsMatrix,
  permissionAllowsPost,
} from "@okkey/types";
import {
  DEFAULT_ALLOWED_FILE_EXTENSIONS,
  DEFAULT_DELETED_ITEMS_RETENTION_DAYS,
  DEFAULT_MAX_FILE_SIZE_MB,
  DEFAULT_WORKSPACE_CAPSULE_POLICIES,
  isCapsuleAllowedForMember,
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
import { useEffect, useMemo, useRef, useState, useCallback, type ComponentProps, type PointerEvent } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import workspaceTenancyModule from "@okkey-enterprise/workspace-tenancy";
import { tryCompletePendingVaultWraps } from "@okkey-enterprise/workspace-members";
import { refreshWorkspaceFoldersCachesForIds } from "@okkey/vault";

import AppShellNavLink from "../components/workspace/AppShellNavLink";
import { useAuthVault, useAuthenticatedCoreClient } from "../auth/AuthVaultContext";
import { WorkspaceFoldersProvider, useWorkspaceFolders, useWorkspaceFoldersState } from "../folders/WorkspaceFoldersContext";
import { WorkspaceItemsProvider, useWorkspaceItemsState } from "../items/WorkspaceItemsContext";
import {
  WorkspaceVaultProfilesProvider,
  useWorkspaceVaultProfilesState,
} from "../items/WorkspaceVaultProfilesContext";
import { WorkspaceItemTemplatesProvider } from "../items/WorkspaceItemTemplatesContext";
import { ItemCategoryPreferencesProvider } from "../components/items/ItemCategoryPreferencesContext";
import { toSidebarFolderTree, workspaceFolderIdExists } from "../folders/workspaceFolderTree";
import { isItemCategoryId } from "../components/items/itemCategoryCatalog";
import FoldersSettingsPopup from "../components/folders/FoldersSettingsPopup";
import SettingsPopup from "../components/settings/SettingsPopup";
import DeviceSettingsIcon from "../components/settings/DeviceSettingsIcon";
import { SectionReauthProvider, useSectionReauth } from "../auth/SectionReauthContext";
import WorkspaceErrorState from "../pages/workspace/WorkspaceErrorState";
import CreateWorkspacePopup from "../pages/workspaces/CreateWorkspacePopup";
import { createWorkspaceRequest, toastWorkspaceCreated } from "../pages/workspaces/createWorkspaceFlow";
import NewItemPopup from "../components/items/NewItemPopup";
import EditItemPopup from "../components/items/EditItemPopup";
import NewCapsulePopup from "../components/capsules/NewCapsulePopup";
import CapsuleApprovalController from "../components/capsules/CapsuleApprovalController";
import DeviceApprovalController from "../components/devices/DeviceApprovalController";
import DeviceRecoveryApprovalController from "../components/devices/DeviceRecoveryApprovalController";
import TrustedContactInviteController from "../components/devices/TrustedContactInviteController";
import ContactsShareReleaseController from "../components/devices/ContactsShareReleaseController";
import accountRecoveryModule from "@okkey-enterprise/account-recovery";
import NewVaultPopup from "../components/workspace/settings/vaults/NewVaultPopup";
import enterpriseSharedVaultsModule from "@okkey-enterprise/workspace-shared-vaults";
import {
  buildPopupQueryValue,
  FOLDERS_POPUP_ID,
  NEW_ITEM_POPUP_ID,
  NEW_CAPSULE_POPUP_ID,
  NEW_VAULT_POPUP_ID,
  popupQuerySearch,
} from "../routes/popupQuery";
import {
  clearStoredCurrentWorkspaceId,
  readStoredCurrentWorkspaceId,
  writeStoredCurrentWorkspaceId,
} from "../auth/workspaceStorage";
import WorkspaceSidebarLayout from "../components/workspace/WorkspaceSidebarLayout";
import WorkspaceTileAvatar from "../components/workspace/WorkspaceTileAvatar";
import { vaultDisplayIcon } from "../components/workspace/settings/vaults/vaultIcons";
import {
  firstAllowedSettingsSection,
  settingsSectionPermissionCell,
} from "../components/workspace/settings/settingsPermissions";
import { useItemsMobileListView } from "../hooks/useItemsMobileListView";
import { useLocale } from "../locale/LocaleContext";
import {
  CAPSULES_PATH,
  CATEGORY_QUERY_PARAM,
  FOLDER_QUERY_PARAM,
  isItemsVaultKind,
  ITEMS_PATH,
  itemsPathAllWorkspaceMerged,
  itemsPathWithFolderMerged,
  itemsPathWithVaultMerged,
  MONITORING_PATH,
  SEARCH_QUERY_PARAM,
  SETTINGS_PATH,
  settingsPath,
  isSettingsPathname,
  isToolsPathname,
  TOOLS_PATH,
  toolsPath,
  VAULT_KIND_QUERY_PARAM,
  VAULT_QUERY_PARAM,
  WORKSPACE_APP_SHELL_PATHS,
  WORKSPACE_QUERY_PARAM,
  WORKSPACES_PATH,
  type WorkspaceAppShellPath,
} from "../routes/paths";
import { planTierLabel } from "./planTierLabel";

function SharedVaultMembersIcon({ className }: { className?: string }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <path
        d="M10.6667 14V12.6667C10.6667 11.9594 10.3857 11.2811 9.88565 10.781C9.38555 10.281 8.70728 10 8.00003 10H4.00003C3.29279 10 2.61451 10.281 2.11441 10.781C1.61432 11.2811 1.33337 11.9594 1.33337 12.6667V14M14.6667 13.9999V12.6666C14.6662 12.0757 14.4696 11.5018 14.1076 11.0348C13.7456 10.5678 13.2388 10.2343 12.6667 10.0866M10.6667 2.08659C11.2403 2.23346 11.7487 2.56706 12.1118 3.0348C12.4748 3.50254 12.6719 4.07781 12.6719 4.66992C12.6719 5.26204 12.4748 5.83731 12.1118 6.30505C11.7487 6.77279 11.2403 7.10639 10.6667 7.25326M8.6667 4.66667C8.6667 6.13943 7.47279 7.33333 6.00003 7.33333C4.52727 7.33333 3.33337 6.13943 3.33337 4.66667C3.33337 3.19391 4.52727 2 6.00003 2C7.47279 2 8.6667 3.19391 8.6667 4.66667Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  if (isToolsPathname(pathname)) {
    return TOOLS_PATH;
  }
  return null;
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

const ContactsShareAutoEnrollController = accountRecoveryModule.ContactsShareAutoEnrollController;

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
  const vaultKindQ = searchParams.get(VAULT_KIND_QUERY_PARAM)?.trim() ?? "";
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
  const [workspacePermissions, setWorkspacePermissions] = useState<WorkspacePermissionsMatrixDto | null>(
    null,
  );
  const [workspacePermissionsReady, setWorkspacePermissionsReady] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [createWorkspaceSubmitting, setCreateWorkspaceSubmitting] = useState(false);
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null);
  const navigateRef = useRef(navigate);
  const setSearchParamsRef = useRef(setSearchParams);

  const refreshWorkspaces = useCallback(async () => {
    if (!core) {
      return;
    }
    const list = await core.listWorkspaces();
    setWorkspaceList(list);
  }, [core]);

  useEffect(() => {
    if (!core || !userId || !vaultKey || !vaultUnlocked || !resolvedWorkspaceId) {
      return;
    }
    void tryCompletePendingVaultWraps({
      core,
      workspaceId: resolvedWorkspaceId,
      userId,
      accountVaultKey: vaultKey,
    }).catch(() => undefined);
  }, [core, resolvedWorkspaceId, userId, vaultKey, vaultUnlocked]);

  // API-first rematerialize personal folders for every workspace after unlock
  // (personal-events from version 0 → decrypt → tree). Same path as active
  // workspace refresh; IndexedDB is only written after a successful API sync.
  const workspaceIdsKey = workspaceList.map((workspace) => workspace.id).join("\0");
  useEffect(() => {
    if (!core || !userId || !vaultUnlocked || !passwordShareC || !workspaceIdsKey) {
      return;
    }
    let cancelled = false;
    const shareC = new Uint8Array(passwordShareC);
    const workspaceIds = workspaceIdsKey.split("\0").filter(Boolean);
    void (async () => {
      try {
        if (cancelled) {
          return;
        }
        await refreshWorkspaceFoldersCachesForIds({
          core,
          userId,
          passwordShareC: shareC,
          workspaceIds,
        });
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, userId, vaultUnlocked, passwordShareC, workspaceIdsKey]);

  const patchWorkspace = useCallback((workspaceId: string, patch: Partial<Workspace>) => {
    setWorkspaceList((previous) =>
      previous.map((workspace) => (workspace.id === workspaceId ? { ...workspace, ...patch } : workspace)),
    );
  }, []);

  useEffect(() => {
    navigateRef.current = navigate;
    setSearchParamsRef.current = setSearchParams;
  }, [navigate, setSearchParams]);

  const navPaths = useMemo(() => {
    const firstSettings = firstAllowedSettingsSection(workspacePermissions);
    return {
      items: ITEMS_PATH,
      capsules: CAPSULES_PATH,
      monitoring: MONITORING_PATH,
      tools: toolsPath(),
      settings: firstSettings ? settingsPath(firstSettings) : settingsPath("general"),
    };
  }, [workspacePermissions]);

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

  const openNewCapsulePopup = useCallback(() => {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, NEW_CAPSULE_POPUP_ID),
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
    const firstSettings = firstAllowedSettingsSection(workspacePermissions);
    const hideSettings = workspacePermissionsReady && !firstSettings;
    const workspaceForNav = workspaceList.find((workspace) => workspace.id === resolvedWorkspaceId);
    const capsulesAllowed = isCapsuleAllowedForMember(
      workspaceForNav?.capsulePolicies ?? DEFAULT_WORKSPACE_CAPSULE_POLICIES,
      userId,
    );
    return base
      .filter((item) => !(hideSettings && item.id === "set"))
      .filter((item) => !(item.to === CAPSULES_PATH && !capsulesAllowed))
      .map((item) => {
        const isItemsEntry = item.to === ITEMS_PATH;
        if (isItemsEntry) {
          return {
            ...item,
            to: itemsPathAllWorkspaceMerged(searchParams, itemsPathMergeOptions),
            isActive: pathname === ITEMS_PATH && !vaultQ && !vaultKindQ && !folderQ && !categoryQ && !searchQ,
            onAddPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
              e.preventDefault();
              openNewItemPopup();
            },
          };
        }
        if (item.to === CAPSULES_PATH) {
          return {
            ...item,
            isActive: pathname === CAPSULES_PATH,
            onAddPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
              event.preventDefault();
              openNewCapsulePopup();
            },
          };
        }
        return {
          ...item,
          isActive: item.to?.startsWith(SETTINGS_PATH)
            ? isSettingsPathname(pathname)
            : item.to?.startsWith(TOOLS_PATH)
              ? isToolsPathname(pathname)
              : item.to === pathname,
        };
      });
  }, [
    navPaths,
    pathname,
    t,
    vaultQ,
    vaultKindQ,
    folderQ,
    categoryQ,
    searchQ,
    searchParams,
    openNewItemPopup,
    openNewCapsulePopup,
    itemsPathMergeOptions,
    workspacePermissions,
    workspacePermissionsReady,
    workspaceList,
    resolvedWorkspaceId,
    userId,
  ]);

  // Vault rows: each link is `/items?vault=…`. Active when that vault id matches the query and we are not in folder-only mode (`folder` is cleared if both were set).
  const vaultSidebarItems: OkkeySidebarVaultItem[] = useMemo(() => {
    return vaults.map((v) => ({
      id: v.id,
      leading: (
        <span className="text-base leading-none" aria-hidden>
          {vaultDisplayIcon(v)}
        </span>
      ),
      label: v.name,
      rightIcon: v.isPersonal ? undefined : <SharedVaultMembersIcon className="size-4" />,
      to: itemsPathWithVaultMerged(searchParams, v.id, itemsPathMergeOptions),
      isActive: pathname === ITEMS_PATH && vaultQ === v.id && !folderQ && !categoryQ && !searchQ,
    }));
  }, [vaults, pathname, vaultQ, folderQ, categoryQ, searchQ, searchParams, itemsPathMergeOptions]);

  const openNewVaultPopup = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      navigate({
        pathname: location.pathname,
        search: popupQuerySearch(location.search, NEW_VAULT_POPUP_ID),
        hash: location.hash,
      });
    },
    [location.hash, location.pathname, location.search, navigate],
  );

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
   * `/items`: at most one of `vault`/`vaultKind`, `folder`, `category`, or `search`. If `search` is set with other scopes,
   * drop them (search scope). If both vault and folder, drop folder (vault wins). Vault/folder drop category.
   * Prefer concrete `vault` over `vaultKind` when both are present.
   */
  useEffect(() => {
    const conflictSearch = Boolean(searchQ && (vaultQ || vaultKindQ || folderQ || categoryQ));
    const conflictVaultFolder = Boolean((vaultQ || vaultKindQ) && folderQ);
    const conflictCategoryWithVaultOrFolder = Boolean(categoryQ && (vaultQ || vaultKindQ || folderQ));
    const conflictVaultAndKind = Boolean(vaultQ && vaultKindQ);
    if (
      !conflictSearch &&
      !conflictVaultFolder &&
      !conflictCategoryWithVaultOrFolder &&
      !conflictVaultAndKind
    ) {
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (searchQ) {
          next.delete(VAULT_QUERY_PARAM);
          next.delete(VAULT_KIND_QUERY_PARAM);
          next.delete(FOLDER_QUERY_PARAM);
          next.delete(CATEGORY_QUERY_PARAM);
        } else if (vaultQ && vaultKindQ) {
          next.delete(VAULT_KIND_QUERY_PARAM);
        } else if ((vaultQ || vaultKindQ) && folderQ) {
          next.delete(FOLDER_QUERY_PARAM);
        } else if (categoryQ && (vaultQ || vaultKindQ || folderQ)) {
          next.delete(CATEGORY_QUERY_PARAM);
        }
        // Returning a new URLSearchParams with the same string still retriggers navigation
        // and can freeze the page in a setSearchParams loop.
        if (next.toString() === prev.toString()) {
          return prev;
        }
        return next;
      },
      { replace: true },
    );
  }, [vaultQ, vaultKindQ, folderQ, categoryQ, searchQ, setSearchParams]);

  /** Drop stale `vault` / `folder` / `category` query params when the id is unknown in the current workspace. */
  useEffect(() => {
    if (pathname !== ITEMS_PATH) {
      return;
    }

    const unknownVault = Boolean(vaultQ && vaultsListReady && !vaults.some((vault) => vault.id === vaultQ));
    const unknownVaultKind = Boolean(vaultKindQ && !isItemsVaultKind(vaultKindQ));
    const foldersReady =
      vaultUnlocked && workspaceFoldersState.bootstrapped && !workspaceFoldersState.loading;
    const unknownFolder = Boolean(
      folderQ &&
        foldersReady &&
        !workspaceFolderIdExists(workspaceFoldersState.folderTree, folderQ),
    );
    const unknownCategory = Boolean(categoryQ && !isItemCategoryId(categoryQ));

    if (!unknownVault && !unknownVaultKind && !unknownFolder && !unknownCategory) {
      return;
    }

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (unknownVault) {
          next.delete(VAULT_QUERY_PARAM);
        }
        if (unknownVaultKind) {
          next.delete(VAULT_KIND_QUERY_PARAM);
        }
        if (unknownFolder) {
          next.delete(FOLDER_QUERY_PARAM);
        }
        if (unknownCategory) {
          next.delete(CATEGORY_QUERY_PARAM);
        }
        if (next.toString() === prev.toString()) {
          return prev;
        }
        return next;
      },
      { replace: true },
    );
  }, [
    pathname,
    vaultQ,
    vaultKindQ,
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
        const resolved =
          (candidate && list.some((w) => w.id === candidate) ? candidate : "") || pickSingle;

        if (!resolved) {
          clearStoredCurrentWorkspaceId(userId);
          if (workspaceTenancyModule.canCreateWorkspace) {
            navigateRef.current(WORKSPACES_PATH, { replace: true });
          }
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
          if (workspaceTenancyModule.canCreateWorkspace) {
            navigateRef.current(WORKSPACES_PATH, { replace: true });
          }
        } else if (workspaceTenancyModule.canCreateWorkspace) {
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

  useEffect(() => {
    if (!core || !resolvedWorkspaceId) {
      setWorkspacePermissions(null);
      setWorkspacePermissionsReady(false);
      return;
    }
    let cancelled = false;
    setWorkspacePermissionsReady(false);
    void (async () => {
      try {
        const result = await core.getWorkspaceMePermissions(resolvedWorkspaceId);
        if (!cancelled) {
          setWorkspacePermissions(normalizeWorkspacePermissionsMatrix(result.permissions));
        }
      } catch {
        if (!cancelled) {
          setWorkspacePermissions(null);
        }
      } finally {
        if (!cancelled) {
          setWorkspacePermissionsReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, resolvedWorkspaceId]);

  const refreshVaults = useCallback(async () => {
    if (!core || !resolvedWorkspaceId) {
      return;
    }
    try {
      const list = await core.listWorkspaceVaults(resolvedWorkspaceId);
      setVaults(list);
    } catch {
      /* keep previous list */
    }
  }, [core, resolvedWorkspaceId]);

  const isMultiWorkspaceUi = workspaceTenancyModule.canCreateWorkspace;

  const workspaceSwitcherTrigger = useMemo(() => {
    return ({ expanded }: { expanded: boolean }) => (
      <>
        <WorkspaceTileAvatar workspace={currentWorkspace} sizeClass={expanded ? "size-8" : "size-9"} />
        {expanded ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-5 text-foreground">
              {currentWorkspace?.name ?? "…"}
            </p>
            <p className="truncate text-xs font-normal leading-4 text-muted-foreground">
              {currentWorkspace ? planTierLabel(currentWorkspace.planTier, t) : ""}
            </p>
          </div>
        ) : null}
        {expanded && isMultiWorkspaceUi ? <ShellChevrons /> : null}
      </>
    );
  }, [currentWorkspace, isMultiWorkspaceUi, t]);

  const workspaceSwitcherDropdown = useMemo(() => {
    if (!userId || !isMultiWorkspaceUi) {
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
          {workspaceTenancyModule.canCreateWorkspace ? (
            <DropdownMenuItem
              className="cursor-pointer justify-center gap-2"
              onClick={() => {
                setCreateWorkspaceError(null);
                setCreateWorkspaceOpen(true);
              }}
            >
              <span className="text-sm">+</span>
              <span>{t("workspaces.createLine1")}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className="cursor-pointer justify-center gap-2 text-muted-foreground" disabled>
              <span className="text-sm">+</span>
              <span>{t("workspaces.createLine1")}</span>
            </DropdownMenuItem>
          )}
        </div>
      </>
    );
  }, [
    workspaceList,
    resolvedWorkspaceId,
    userId,
    navigate,
    t,
    setResolvedWorkspaceId,
    setPhase,
    isMultiWorkspaceUi,
  ]);

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
    <SectionReauthProvider>
      <CreateWorkspacePopup
        open={createWorkspaceOpen}
        submitting={createWorkspaceSubmitting}
        errorMessage={createWorkspaceError}
        t={t}
        onClose={() => {
          if (!createWorkspaceSubmitting) {
            setCreateWorkspaceOpen(false);
            setCreateWorkspaceError(null);
          }
        }}
        onSubmit={(name) => {
          void (async () => {
            if (!core || createWorkspaceSubmitting) {
              return;
            }
            setCreateWorkspaceSubmitting(true);
            setCreateWorkspaceError(null);
            try {
              const created = await createWorkspaceRequest(
                core,
                name,
                t("web.workspaceSettings.vaults.personal.title"),
              );
              if (userId) {
                writeStoredCurrentWorkspaceId(userId, created.id);
              }
              await refreshWorkspaces();
              setResolvedWorkspaceId(created.id);
              setPhase("ready");
              toastWorkspaceCreated(t("workspaces.createPopup.toastCreated", { name: created.name }));
              setCreateWorkspaceOpen(false);
              navigate(ITEMS_PATH);
            } catch {
              setCreateWorkspaceError(t("workspaces.createError"));
            } finally {
              setCreateWorkspaceSubmitting(false);
            }
          })();
        }}
      />
      <SettingsPopup t={t} workspaceIds={workspaceList.map((workspace) => workspace.id)}>
        {({ openSettingsPopup }) => {
          const email = profile?.email?.trim();
          const accountMenu: OkkeyAppSidebarAccountMenu | undefined = email
            ? {
                firstName: profile?.firstName,
                lastName: profile?.lastName,
                email,
                settingsLabel: t("web.accountMenu.settings"),
                deviceSettingsLabel: t("web.accountMenu.deviceSettings"),
                logoutLabel: t("web.accountMenu.logout"),
                onSettings: () => openSettingsPopup(),
                onDeviceSettings: () => openSettingsPopup("deviceSettings"),
                deviceSettingsIcon: <DeviceSettingsIcon className="size-4" />,
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
                workspaceSwitcherDropdown={isMultiWorkspaceUi ? workspaceSwitcherDropdown : undefined}
                workspaceSwitcherTo={isMultiWorkspaceUi ? undefined : ITEMS_PATH}
                vaultSidebarItems={vaultSidebarItems}
                folderTreeForItems={folderTreeForItems}
                accountMenu={accountMenu}
                footerPlainLinkLabels={{
                  documentation: t("web.nav.documentation"),
                  help: t("web.nav.help"),
                }}
                openFoldersSettingsPopup={openFoldersSettingsPopup}
                openNewVaultPopup={openNewVaultPopup}
                core={core}
                userId={userId ?? ""}
                vaultKey={vaultKey}
                vaultUnlocked={vaultUnlocked}
                workspaceFoldersBootstrapped={workspaceFoldersState.bootstrapped}
                refreshWorkspaces={refreshWorkspaces}
                patchWorkspace={patchWorkspace}
                refreshVaults={refreshVaults}
                workspacePermissions={workspacePermissions}
                workspacePermissionsReady={workspacePermissionsReady}
              />
            </WorkspaceFoldersProvider>
          );
        }}
      </SettingsPopup>
    </SectionReauthProvider>
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
  workspaceSwitcherTo: ComponentProps<typeof WorkspaceSidebarLayout>["workspaceSwitcherTo"];
  vaultSidebarItems: OkkeySidebarVaultItem[];
  folderTreeForItems: OkkeySidebarFolderTreeNode[];
  accountMenu: OkkeyAppSidebarAccountMenu | undefined;
  footerPlainLinkLabels: { documentation: string; help: string };
  openFoldersSettingsPopup: () => void;
  openNewVaultPopup: (event: PointerEvent<HTMLButtonElement>) => void;
  core: ReturnType<typeof useAuthenticatedCoreClient>;
  userId: string;
  vaultKey: Uint8Array | null;
  vaultUnlocked: boolean;
  workspaceFoldersBootstrapped: boolean;
  refreshWorkspaces: () => Promise<void>;
  patchWorkspace: (workspaceId: string, patch: Partial<Workspace>) => void;
  refreshVaults: () => Promise<void>;
  workspacePermissions: WorkspacePermissionsMatrixDto | null;
  workspacePermissionsReady: boolean;
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
  workspaceSwitcherTo,
  vaultSidebarItems,
  folderTreeForItems,
  accountMenu,
  footerPlainLinkLabels,
  openFoldersSettingsPopup,
  openNewVaultPopup,
  core,
  userId,
  vaultKey,
  vaultUnlocked,
  workspaceFoldersBootstrapped,
  refreshWorkspaces,
  patchWorkspace,
  refreshVaults,
  workspacePermissions,
  workspacePermissionsReady,
}: WorkspaceShellWithItemsProps) {
  const { itemFolderByItemId, itemFavoriteByItemId } = useWorkspaceFolders();
  const { isContentBlocked, requestAccess } = useSectionReauth();
  const canShowVaultHeaderPlus = useMemo(() => {
    if (!hasPlanFeature(currentWorkspace?.planTier, "sharedVaults")) {
      return false;
    }
    if (!enterpriseSharedVaultsModule.SharedVaultCardPopup) {
      return false;
    }
    const vaultPermissions = settingsSectionPermissionCell(workspacePermissions, "vaults");
    return permissionAllowsPost(vaultPermissions?.post ?? 0);
  }, [currentWorkspace?.planTier, workspacePermissions]);
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
  const workspaceVaultProfilesState = useWorkspaceVaultProfilesState({
    workspaceId: resolvedWorkspaceId,
    core,
    vaultUnlocked,
    userId,
    vaults,
  });
  const canCreateCapsules =
    isCapsuleAllowedForMember(
      currentWorkspace?.capsulePolicies ?? DEFAULT_WORKSPACE_CAPSULE_POLICIES,
      userId,
    ) &&
    vaults.some((vault) => workspaceVaultProfilesState.canUseFunction(vault.id, "create_capsules"));
  const permittedWorkspaceNavItems = workspaceNavItems.map((item) =>
    item.to === CAPSULES_PATH && !canCreateCapsules
      ? { ...item, onAddPointerDown: undefined }
      : item,
  );

  return (
    <WorkspaceItemTemplatesProvider workspaceId={resolvedWorkspaceId}>
      <ItemCategoryPreferencesProvider workspaceId={resolvedWorkspaceId}>
        <WorkspaceVaultProfilesProvider value={workspaceVaultProfilesState}>
        <WorkspaceItemsProvider value={workspaceItemsState}>
          <NewItemPopup
            t={t}
            workspaceId={resolvedWorkspaceId}
            workspaceName={currentWorkspaceName}
            vaults={vaults}
            vaultsListReady={vaultsListReady}
          />
          <NewCapsulePopup
            t={t}
            workspaceId={resolvedWorkspaceId}
            workspace={currentWorkspace}
          />
          <CapsuleApprovalController />
          <DeviceApprovalController />
          <DeviceRecoveryApprovalController />
          <TrustedContactInviteController />
          <ContactsShareReleaseController />
          {ContactsShareAutoEnrollController ? <ContactsShareAutoEnrollController /> : null}
          <EditItemPopup
            t={t}
            workspaceId={resolvedWorkspaceId}
            workspaceName={currentWorkspaceName}
            vaults={vaults}
            vaultsListReady={vaultsListReady}
          />
          <FoldersSettingsPopup t={t} />
          <NewVaultPopup
            workspaceId={resolvedWorkspaceId}
            workspace={currentWorkspace}
            workspacePermissions={workspacePermissions}
            t={t}
            onVaultsChanged={refreshVaults}
          />
          <WorkspaceSidebarLayout
            title={title}
            description={description}
            hideShellMainHeader={
              isShellNotFound ||
              isSettingsPathname(pathname) ||
              isToolsPathname(pathname) ||
              pathname === CAPSULES_PATH ||
              pathname === MONITORING_PATH
            }
            mainColumnLayout={pathname === ITEMS_PATH ? "items-two-pane" : "single"}
            workspaceNavItems={permittedWorkspaceNavItems}
            workspaceNavLink={AppShellNavLink}
            workspaceNavGroupLabel={t("workspaces.shellTitle")}
            workspaceSwitcherTrigger={workspaceSwitcherTrigger}
            workspaceSwitcherDropdown={workspaceSwitcherDropdown}
            workspaceSwitcherTo={workspaceSwitcherTo}
            workspaceSwitcherLink={AppShellNavLink}
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
            showVaultHeaderPlus={canShowVaultHeaderPlus}
            onVaultHeaderPlusPointerDown={canShowVaultHeaderPlus ? openNewVaultPopup : undefined}
            onFolderHeaderActionClick={openFoldersSettingsPopup}
            itemsListVaults={vaults}
            itemsListVaultsLoaded={vaultsListReady}
            itemsListFolderTree={folderTreeForItems}
            itemsListFoldersLoaded={workspaceFoldersBootstrapped}
            itemsListRecords={workspaceItemsState.records.filter((record) =>
              workspaceVaultProfilesState.canViewItem(
                record.vaultId,
                record.categoryId,
                workspaceItemsState.getItemCreatedByUserId(record.id),
              ),
            )}
            itemsListRecordsLoaded={workspaceItemsState.bootstrapped}
            monitoringCardSettings={currentWorkspace?.monitoringCardSettings}
          >
            {isContentBlocked ? (
              <WorkspaceErrorState
                titleKey="web.forbidden.title"
                descriptionKey="web.settingsPopup.vault.reauth.deniedDescription"
                action={{
                  label: t("web.settingsPopup.vault.reauth.requestAccess"),
                  onClick: requestAccess,
                }}
              />
            ) : (
              <Outlet
                context={{
                  workspaceId: resolvedWorkspaceId,
                  vaults,
                  vaultsListReady,
                  workspace: currentWorkspace,
                  refreshWorkspaces,
                  patchWorkspace,
                  refreshVaults,
                  workspacePermissions,
                  workspacePermissionsReady,
                }}
              />
            )}
          </WorkspaceSidebarLayout>
        </WorkspaceItemsProvider>
        </WorkspaceVaultProfilesProvider>
      </ItemCategoryPreferencesProvider>
    </WorkspaceItemTemplatesProvider>
  );
}
