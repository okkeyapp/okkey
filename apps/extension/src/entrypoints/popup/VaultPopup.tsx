import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ForwardedRef } from "react";
import type { CoreApiClient } from "@okkey/api";
import type { ItemPlaintextV2, Vault, Workspace } from "@okkey/types";
import type { UnlockWithMasterPasswordResult } from "@okkey/vault";
import {
  copyTextWithVaultClipboardPolicy,
  createWorkspaceVaultItemsReadController,
  itemPlaintextToExtensionListRecord,
  itemUrlsMatchTab,
  scoreItemsListRecordSearch,
  type ExtensionItemListRecord,
} from "@okkey/vault";
import {
  Button,
  DropdownMenuItem,
  OkkeyAppSidebar,
  OkkeyAppSidebarToolbar,
  Popup,
  WorkspaceSearchField,
  cn,
  useOkkeyAppShellLayout,
  type OkkeySidebarVaultItem,
  type OkkeyWorkspaceNavLinkComponent,
} from "@okkey/ui";
import { toast } from "sonner";

import {
  ExtensionItemDetailEmpty,
  ExtensionItemDetailPane,
} from "../../components/vault/ExtensionItemDetailPane";
import {
  ExtensionItemsListPane,
  type ExtensionListFilter,
  type ExtensionListSort,
} from "../../components/vault/ExtensionItemsListPane";
import {
  buildEditItemDeepLink,
  buildItemsDeepLink,
  buildNewCapsuleDeepLink,
  buildNewItemDeepLink,
  openWebDeepLink,
  readActiveTabUrl,
} from "../../lib/deepLinks";
import {
  readExtensionDevicePrefs,
  touchExtensionUnlockSession,
} from "../../lib/extensionVaultSession";
import {
  readStoredCurrentWorkspaceId,
  writeStoredCurrentWorkspaceId,
} from "../../lib/vaultStorage";

type VaultPopupProps = {
  core: CoreApiClient;
  userId: string;
  webBaseUrl: string;
  secrets: UnlockWithMasterPasswordResult;
  encryptedPrivateKeyPayload: string;
  identity: { email: string; firstName: string; lastName: string } | null;
  localeSelect: React.ReactNode;
  signOutLabel: string;
  onSignOut: () => void;
  onChangeServer: () => void;
  onLock: () => void;
  /** Optional idle lock interval (ms); activity is tracked via session storage. */
  idleLockMs?: number;
  /** Optional activity callback (parent idle timer); session touch runs regardless. */
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

function WorkspaceCheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path d="M3.33337 8.00004L6.66671 11.3334L12.6667 4.66671" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function vaultEmoji(vault: Vault): string {
  return vault.isPersonal ? "🏠" : "💼";
}

function compareRows(a: ExtensionItemListRecord, b: ExtensionItemListRecord, sort: ExtensionListSort): number {
  if (sort === "name_asc") {
    return a.title.localeCompare(b.title) || b.updatedAtMs - a.updatedAtMs;
  }
  if (sort === "name_desc") {
    return b.title.localeCompare(a.title) || b.updatedAtMs - a.updatedAtMs;
  }
  if (sort === "date_asc") {
    return a.updatedAtMs - b.updatedAtMs || a.title.localeCompare(b.title);
  }
  return b.updatedAtMs - a.updatedAtMs || a.title.localeCompare(b.title);
}

function filterRows(
  rows: readonly ExtensionItemListRecord[],
  filter: ExtensionListFilter,
): ExtensionItemListRecord[] {
  switch (filter) {
    case "all":
      return rows.filter((r) => !r.deleted && !r.archived);
    case "favorites":
      // Favorites sync is E3; keep filter UI parity with web (empty until wired).
      return [];
    case "archived":
      return rows.filter((r) => !r.deleted && r.archived);
    case "recently_deleted":
      return rows.filter((r) => r.deleted);
    case "reused":
    case "strong":
    case "medium":
    case "weak":
    case "stale":
    case "compromised":
    case "2fa-gap":
    case "passkey-gap":
      // Monitoring analytics not available in extension yet.
      return [];
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

function WorkspaceSwitcherPanel(props: {
  workspaces: readonly Workspace[];
  workspaceId: string | null;
  localeSelect: React.ReactNode;
  onPick: (id: string) => void;
}) {
  const shell = useOkkeyAppShellLayout();
  return (
    <div className="p-1">
      {props.workspaces.map((ws) => (
        <DropdownMenuItem
          key={ws.id}
          className={cn("cursor-pointer gap-2", ws.id === props.workspaceId && "bg-muted/80")}
          onSelect={() => {
            props.onPick(ws.id);
            shell.setMobileDrawerOpen(false);
          }}
        >
          <span className="min-w-0 flex-1 truncate">{ws.name}</span>
          {ws.id === props.workspaceId ? <WorkspaceCheckIcon className="size-4 shrink-0" /> : null}
        </DropdownMenuItem>
      ))}
      <div className="mx-1 my-1 h-px bg-border" role="separator" />
      <div className="px-2 py-1">{props.localeSelect}</div>
    </div>
  );
}

export function VaultPopup(props: VaultPopupProps) {
  const {
    core,
    userId,
    webBaseUrl,
    secrets,
    encryptedPrivateKeyPayload,
    identity,
    localeSelect,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ExtensionListFilter>("all");
  const [sort, setSort] = useState<ExtensionListSort>("date_desc");
  const [vaultFilterId, setVaultFilterId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tabUrl, setTabUrl] = useState<string | null>(null);
  const [copyConfirm, setCopyConfirm] = useState<{ value: string; label: string } | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const noteActivity = useCallback(() => {
    void touchExtensionUnlockSession(userId);
    onActivity?.();
  }, [onActivity, userId]);

  useEffect(() => {
    void readActiveTabUrl().then(setTabUrl);
  }, []);

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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setItems([]);
        setVaults([]);
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
    };
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setVaultFilterId(null);
    setSelectedId(null);
    void loadItems(workspaceId);
  }, [workspaceId, loadItems]);

  const listRecords = useMemo(() => {
    const records = items.map(itemPlaintextToExtensionListRecord);
    const scoped = vaultFilterId ? records.filter((row) => row.vaultId === vaultFilterId) : records;
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
  }, [filter, items, search, sort, vaultFilterId]);

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

  const performCopy = async (value: string, label: string) => {
    noteActivity();
    const prefs = await readExtensionDevicePrefs(userId);
    await copyTextWithVaultClipboardPolicy({
      clipboardClearSeconds: prefs.clipboardClearSeconds,
      text: value,
    });
    toast.message(t("extension.vault.copied"), { description: label });
  };

  const copyWithGuard = async (value: string, label: string, itemUrls: readonly string[]) => {
    const matches = itemUrlsMatchTab(tabUrl, itemUrls, "entire-site");
    if (!matches) {
      setCopyConfirm({ value, label });
      return;
    }
    await performCopy(value, label);
  };

  const confirmCopy = async () => {
    if (!copyConfirm) return;
    await performCopy(copyConfirm.value, copyConfirm.label);
    setCopyConfirm(null);
  };

  const currentWorkspace = workspaces.find((w) => w.id === workspaceId) ?? null;
  const vaultScopeMeta = vaultFilterId ? vaults.find((v) => v.id === vaultFilterId) : null;

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

  const sidebarVaultItems: OkkeySidebarVaultItem[] = vaults.map((vault) => ({
    id: vault.id,
    leading: <span className="text-base leading-none">{vaultEmoji(vault)}</span>,
    label: vault.name,
    to: `vault:${vault.id}`,
    isActive: vaultFilterId === vault.id,
  }));

  const vaultOptions = vaults.map((vault) => ({
    id: vault.id,
    name: vault.name,
    emoji: vaultEmoji(vault),
  }));

  const VaultNavLink = useMemo(() => {
    const onPickVault = (id: string) => {
      setVaultFilterId(id);
      setSelectedId(null);
    };
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
      return <ExtensionVaultFilterLink ref={ref} {...linkProps} onPickVault={onPickVault} />;
    });
    return Link as OkkeyWorkspaceNavLinkComponent;
  }, []);

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

  return (
    <OkkeyAppSidebar
      workspaceNavItems={[]}
      showVaultHeaderPlus={false}
      showFolderHeaderPlus={false}
      showFooterPlainLinks={false}
      folderTree={[]}
      folderEmptyLabel={t("web.nav.foldersEmpty")}
      vaultSectionTitle={t("web.nav.vaultsSection")}
      folderSectionTitle={t("web.nav.foldersSection")}
      vaultItems={sidebarVaultItems}
      vaultNavLink={VaultNavLink}
      mobileNavCloseLabel={t("web.nav.closeMobileNav")}
      workspaceSwitcherTrigger={({ expanded }) => (
        <>
          <div className={cn("flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-sm font-semibold", !expanded && "size-9")}>
            {(currentWorkspace?.name ?? "O").trim().slice(0, 1).toUpperCase() || "O"}
          </div>
          {expanded ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-5 text-foreground">
                  {currentWorkspace?.name ?? t("extension.vault.workspace")}
                </p>
                <p className="truncate text-xs font-normal leading-4 text-muted-foreground">
                  {identity?.email ?? ""}
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
          localeSelect={localeSelect}
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
              vaultScopeLabel={vaultScopeMeta?.name ?? null}
              vaultOptions={vaultOptions}
              onFilterChange={setFilter}
              onSortChange={setSort}
              onSelect={onSelectItem}
              onClearVaultScope={() => setVaultFilterId(null)}
              onPickVault={(id) => {
                setVaultFilterId(id);
                setSelectedId(null);
              }}
              t={t}
            />
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            {!selectedItem ? (
              <ExtensionItemDetailEmpty
                workspaceName={currentWorkspace?.name}
                selectLabel={t("extension.vault.selectItem")}
                workspaceFallback={t("extension.vault.workspace")}
              />
            ) : (
              <ExtensionItemDetailPane
                item={selectedItem}
                vault={selectedVault}
                emptyLabel={t("extension.vault.noFields")}
                onCopy={(value, label) =>
                  void copyWithGuard(value, label, itemPlaintextToExtensionListRecord(selectedItem).urls)
                }
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

      {copyConfirm ? (
        <Popup
          header={t("extension.vault.copyGuardTitle")}
          description={t("extension.vault.copyGuardBody")}
          width={360}
          onClose={() => setCopyConfirm(null)}
          footer={
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setCopyConfirm(null)}>
                {t("extension.vault.copyGuardCancel")}
              </Button>
              <Button type="button" onClick={() => void confirmCopy()}>
                {t("extension.vault.copyGuardConfirm")}
              </Button>
            </div>
          }
        />
      ) : null}
    </OkkeyAppSidebar>
  );
}
