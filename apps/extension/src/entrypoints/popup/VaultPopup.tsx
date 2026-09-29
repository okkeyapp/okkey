import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ForwardedRef } from "react";
import type { CoreApiClient } from "@okkey/api";
import type { ItemPlaintextV2, Vault, Workspace } from "@okkey/types";
import type { UnlockWithMasterPasswordResult } from "@okkey/vault";
import {
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

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 14L11.1 11.1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
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

  const onSelectWorkspace = async (id: string) => {
    setSelectedId(null);
    setWorkspaceId(id);
    await writeStoredCurrentWorkspaceId(userId, id);
  };

  const copyWithGuard = async (value: string, label: string, itemUrls: readonly string[]) => {
    const matches = itemUrlsMatchTab(tabUrl, itemUrls, "entire-site");
    if (!matches) {
      setCopyConfirm({ value, label });
      return;
    }
    await navigator.clipboard.writeText(value);
    toast.message(t("extension.vault.copied"), { description: label });
  };

  const confirmCopy = async () => {
    if (!copyConfirm) return;
    await navigator.clipboard.writeText(copyConfirm.value);
    toast.message(t("extension.vault.copied"), { description: copyConfirm.label });
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
        <div className="p-1">
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              className={cn("cursor-pointer gap-2", ws.id === workspaceId && "bg-muted/80")}
              onSelect={() => void onPickWorkspace(ws.id)}
            >
              <span className="min-w-0 flex-1 truncate">{ws.name}</span>
              {ws.id === workspaceId ? <WorkspaceCheckIcon className="size-4 shrink-0" /> : null}
            </DropdownMenuItem>
          ))}
          <div className="mx-1 my-1 h-px bg-border" role="separator" />
          <div className="px-2 py-1">{localeSelect}</div>
        </div>
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
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-1 pb-2 pt-0">
          <OkkeyAppSidebarToolbar
            openMobileNavLabel={t("web.nav.openMobileNav")}
            className="!p-0"
          />
          <div className="flex min-w-0 flex-1 justify-center px-0">
            <div
              className={cn(
                "flex h-9 w-full max-w-[420px] shrink-0 items-stretch rounded-md border border-transparent",
                "bg-[rgba(0,0,0,0.05)] text-sm text-foreground shadow-none transition-[color,box-shadow,border-color,background-color]",
                "dark:bg-white/[0.06]",
                "hover:border-[color-mix(in_hsl,hsl(var(--input))_82%,hsl(var(--accent))_18%)]",
                "focus-within:border-accent focus-within:bg-background focus-within:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
              )}
            >
              <div className="flex shrink-0 items-center ps-3 pe-2 py-1.5 text-muted-foreground">
                <SearchIcon />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                role="searchbox"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("web.items.searchPlaceholder")}
                aria-label={t("web.items.searchPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                className={cn(
                  "min-w-0 flex-1 border-0 bg-transparent py-1.5 text-sm leading-5 text-foreground outline-none",
                  "placeholder:text-muted-foreground",
                  "focus-visible:outline-none",
                )}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 pe-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 min-h-9 min-w-9 shrink-0 rounded-lg"
              aria-label={t("extension.vault.lock")}
              onClick={onLock}
            >
              <LockIcon />
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
              onFilterChange={setFilter}
              onSortChange={setSort}
              onSelect={setSelectedId}
              onClearVaultScope={() => setVaultFilterId(null)}
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
                emptyLabel={t("extension.vault.noFields")}
                onCopy={(value, label) =>
                  void copyWithGuard(value, label, itemPlaintextToExtensionListRecord(selectedItem).urls)
                }
                onEdit={() => openItemInWeb(selectedItem.itemId, { popup: "editItem" })}
                onCreateCapsule={() => openItemInWeb(selectedItem.itemId, { popup: "newCapsule" })}
                onFavoriteInWeb={() => openItemInWeb(selectedItem.itemId)}
                onArchiveInWeb={() => openItemInWeb(selectedItem.itemId)}
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
