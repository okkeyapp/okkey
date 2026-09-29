import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CoreApiClient } from "@okkey/api";
import type { ItemPlaintextV2, Workspace } from "@okkey/types";
import type { UnlockWithMasterPasswordResult } from "@okkey/vault";
import {
  createWorkspaceVaultItemsReadController,
  extractReadableItemFields,
  itemPlaintextToExtensionListRecord,
  itemUrlsMatchTab,
  scoreItemsListRecordSearch,
  type ExtensionItemListRecord,
} from "@okkey/vault";
import {
  AccountUserBar,
  Button,
  Input,
  KeyField,
  KeyForm,
  Popup,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  cn,
} from "@okkey/ui";
import { toast } from "sonner";

import {
  buildCapsulesDeepLink,
  buildDevicesSettingsDeepLink,
  buildEditItemDeepLink,
  buildItemsDeepLink,
  openWebDeepLink,
  readActiveTabUrl,
} from "../../lib/deepLinks";
import {
  readStoredCurrentWorkspaceId,
  writeStoredCurrentWorkspaceId,
} from "../../lib/vaultStorage";

type FilterMode = "all" | "active" | "favorites" | "archived";

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
  onLock: () => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
};

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
    onLock,
    t,
  } = props;

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemPlaintextV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tabUrl, setTabUrl] = useState<string | null>(null);
  const [copyConfirm, setCopyConfirm] = useState<{ value: string; label: string } | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);

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
        const vaults = await core.listWorkspaceVaults(wsId);
        const controller = createWorkspaceVaultItemsReadController({
          core,
          userId,
          workspaceId: wsId,
          vaults,
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
    void loadItems(workspaceId);
  }, [workspaceId, loadItems]);

  const listRecords = useMemo(() => {
    const records = items
      .filter((item) => !(item.deleted ?? false))
      .map(itemPlaintextToExtensionListRecord);

    const filtered = records.filter((row) => {
      if (filter === "archived") {
        return row.archived;
      }
      if (filter === "active") {
        return !row.archived;
      }
      return true;
    });

    const needle = search.trim();
    if (!needle) {
      return filtered.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    }

    return filtered
      .map((row) => ({ row, score: scoreItemsListRecordSearch(row, needle) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.row.updatedAtMs - a.row.updatedAtMs)
      .map((entry) => entry.row);
  }, [filter, items, search]);

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

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Select
          value={workspaceId ?? undefined}
          onValueChange={(id) => void onSelectWorkspace(id)}
          disabled={workspaces.length === 0}
        >
          <SelectTrigger className="h-8 min-w-0 flex-1 truncate text-left text-sm">
            <SelectValue placeholder={t("extension.vault.workspace")} />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((ws) => (
              <SelectItem key={ws.id} value={ws.id}>
                {ws.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="shrink-0">{localeSelect}</div>
        <Button type="button" variant="ghost" className="h-8 shrink-0 px-2 text-sm" onClick={onLock}>
          {t("extension.vault.lock")}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-border">
          <div className="flex flex-col gap-2 border-b border-border p-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("extension.vault.search")}
              className="h-8"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex gap-1">
              {(
                [
                  ["active", "extension.vault.filterActive"],
                  ["all", "extension.vault.filterAll"],
                  ["archived", "extension.vault.filterArchived"],
                ] as const
              ).map(([mode, key]) => (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium",
                    filter === mode
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setFilter(mode)}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-10" role="status" aria-busy="true">
                <Spinner className="size-5" />
              </div>
            ) : error ? (
              <p className="p-3 text-sm text-destructive">{error}</p>
            ) : listRecords.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">{t("extension.vault.empty")}</p>
            ) : (
              <ul className="flex flex-col py-1">
                {listRecords.map((row) => (
                  <ItemListRow
                    key={row.id}
                    row={row}
                    selected={row.id === selectedId}
                    onSelect={() => setSelectedId(row.id)}
                  />
                ))}
              </ul>
            )}
          </ScrollArea>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <Button
              type="button"
              variant="outline"
              className="h-8 px-2 text-sm"
              disabled={!selectedItem || !workspaceId}
              onClick={() => {
                if (!selectedItem || !workspaceId) return;
                void openWebDeepLink(
                  buildEditItemDeepLink({
                    webBaseUrl,
                    workspaceId,
                    itemId: selectedItem.itemId,
                  }),
                );
              }}
            >
              {t("extension.vault.editInWeb")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2 text-sm"
              onClick={() => void openWebDeepLink(buildCapsulesDeepLink(webBaseUrl))}
            >
              {t("extension.vault.capsules")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2 text-sm"
              onClick={() => void openWebDeepLink(buildDevicesSettingsDeepLink(webBaseUrl))}
            >
              {t("extension.vault.settings")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2 text-sm"
              onClick={() =>
                void openWebDeepLink(
                  buildItemsDeepLink({
                    webBaseUrl,
                    workspaceId: workspaceId ?? undefined,
                    itemId: selectedId ?? undefined,
                  }),
                )
              }
            >
              {t("extension.vault.openWeb")}
            </Button>
          </div>

          <ScrollArea className="min-h-0 flex-1 p-3">
            {!selectedItem ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <p>{currentWorkspace?.name ?? t("extension.vault.workspace")}</p>
                <p>{t("extension.vault.selectItem")}</p>
              </div>
            ) : (
              <ItemReadCard
                item={selectedItem}
                onCopy={(value, label) =>
                  void copyWithGuard(value, label, itemPlaintextToExtensionListRecord(selectedItem).urls)
                }
                t={t}
              />
            )}
          </ScrollArea>

          <footer className="shrink-0 border-t border-border px-3 py-2">
            {identity ? (
              <AccountUserBar
                email={identity.email}
                firstName={identity.firstName}
                lastName={identity.lastName}
                signOutLabel={signOutLabel}
                onSignOut={onSignOut}
              />
            ) : null}
          </footer>
        </main>
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
    </div>
  );
}

function ItemListRow(props: {
  row: ExtensionItemListRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  const { row, selected, onSelect } = props;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
          selected ? "bg-secondary" : "hover:bg-secondary/60",
        )}
      >
        <span className="truncate text-sm font-medium text-foreground">{row.title || "—"}</span>
        {row.description ? (
          <span className="truncate text-xs text-muted-foreground">{row.description}</span>
        ) : null}
      </button>
    </li>
  );
}

function ItemReadCard(props: {
  item: ItemPlaintextV2;
  onCopy: (value: string, label: string) => void;
  t: (key: string) => string;
}) {
  const fields = extractReadableItemFields(props.item);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="truncate text-base font-semibold">{props.item.title || "—"}</h2>
      <KeyForm mode="view">
        {fields.map((field) => (
          <KeyField
            key={field.id}
            mode="view"
            label={field.label}
            value={field.conceal ? undefined : field.value}
            concealValue={field.conceal}
            copyValue={field.copyable ? field.value : undefined}
            copyLabel={props.t("extension.vault.copy")}
            copySuccessLabel={props.t("extension.vault.copied")}
            onCopyAction={
              field.copyable
                ? async (value) => {
                    props.onCopy(value, field.label);
                  }
                : undefined
            }
          />
        ))}
      </KeyForm>
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">{props.t("extension.vault.noFields")}</p>
      ) : null}
    </div>
  );
}
