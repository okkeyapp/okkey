import type { WebMessageValues } from "@okkey/i18n";
import type { Vault } from "@okkey/types";
import {
  cn,
  SearchableSelect,
  SearchableSelectContent,
  SearchableSelectItem,
  SearchableSelectTrigger,
  useSearchableSelectContext,
} from "@okkey/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useWorkspaceFolders } from "../../folders/WorkspaceFoldersContext";
import { NO_FOLDER_VALUE, folderPathExists, type FlatWorkspaceFolder } from "../../folders/workspaceFolderTree";

type NewItemSaveLocationSectionProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  workspaceName: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
  vaultId: string;
  onVaultIdChange: (vaultId: string) => void;
  folderId: string;
  onFolderIdChange: (folderId: string) => void;
};

const saveLocationTriggerClassName = cn(
  "!w-auto inline-flex h-7 min-h-7 max-h-7 max-w-full shrink-0 items-center gap-2 rounded-md bg-background px-2 py-0 text-sm leading-5 text-foreground shadow-none",
  "hover:!bg-background",
  "focus-visible:!shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
  "data-[state=open]:!shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
  "[&>span:first-child]:flex-none [&>span:first-child]:truncate [&>span:first-child]:leading-5",
);

function FolderSelectLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex h-5 min-w-0 items-center gap-2">
      <FolderClosedIcon />
      <span className="truncate leading-5">{label}</span>
    </span>
  );
}

function FolderClosedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={cn("size-4 shrink-0 text-foreground", className)}>
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

function vaultLeadingEmoji(vault: Vault | undefined): string {
  if (!vault) {
    return "💼";
  }
  return vault.isPersonal ? "🏠" : "💼";
}

function VaultSelectLabel({ vault }: { vault: Vault | undefined }) {
  return (
    <span className="inline-flex h-5 min-w-0 items-center gap-2">
      <span className="inline-flex size-4 shrink-0 items-center justify-center text-base leading-none" aria-hidden>
        {vaultLeadingEmoji(vault)}
      </span>
      <span className="truncate leading-5">{vault?.name ?? "…"}</span>
    </span>
  );
}

function FolderSelectCreateRow({
  flatFolders,
  createFolderLabel,
  onCreateFolder,
}: {
  flatFolders: readonly FlatWorkspaceFolder[];
  createFolderLabel: (name: string) => string;
  onCreateFolder: (name: string) => string | Promise<string>;
}) {
  const ctx = useSearchableSelectContext("FolderSelectCreateRow");
  const query = ctx.searchQuery.trim();
  const showCreate = query.length > 0 && !folderPathExists(flatFolders, query);

  const applyCreated = (id: string | Promise<string>) => {
    void Promise.resolve(id).then((resolved) => {
      if (resolved) {
        ctx.setValue(resolved);
      }
    });
  };

  if (!showCreate) {
    return null;
  }

  return (
    <div
      role="option"
      className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-2 text-sm text-foreground outline-none hover:bg-secondary hover:text-foreground"
      onClick={() => {
        applyCreated(onCreateFolder(query));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          applyCreated(onCreateFolder(query));
        }
      }}
      tabIndex={0}
    >
      {createFolderLabel(query)}
    </div>
  );
}

export default function NewItemSaveLocationSection({
  t,
  workspaceName,
  vaults,
  vaultsListReady,
  vaultId,
  onVaultIdChange,
  folderId,
  onFolderIdChange,
}: NewItemSaveLocationSectionProps) {
  const { flatFolders, createFolder } = useWorkspaceFolders();
  const selectedVault = vaults.find((vault) => vault.id === vaultId);
  const selectedFolder =
    folderId === NO_FOLDER_VALUE ? null : flatFolders.find((folder) => folder.id === folderId);

  const folderSelectedLabel: ReactNode = (
    <FolderSelectLabel
      label={
        folderId === NO_FOLDER_VALUE
          ? t("web.newItemPopup.noFolder")
          : (selectedFolder?.path ?? "…")
      }
    />
  );

  return (
    <section
      className="overflow-visible rounded-[10px] bg-slate-100 px-4 pb-2 pt-2 dark:bg-muted"
      aria-label={t("web.newItemPopup.saveLocationAria")}
    >
      <p className="text-xs leading-5 text-muted-foreground">{t("web.newItemPopup.saveLocationLabel")}</p>
      <div className="-mx-1 mt-0.5 overflow-x-auto px-1 py-0.5">
        <div className="flex min-w-0 flex-nowrap items-center gap-2">
        <span className="shrink-0 text-sm font-medium text-foreground">{workspaceName}</span>
        <span className="shrink-0 text-sm text-foreground" aria-hidden>
          →
        </span>
        <SearchableSelect
          variant="inline"
          value={vaultId}
          onValueChange={onVaultIdChange}
          disabled={!vaultsListReady || vaults.length === 0}
          selectedLabel={<VaultSelectLabel vault={selectedVault} />}
          placeholder={vaultsListReady ? t("web.newItemPopup.vaultPlaceholder") : "…"}
          searchPlaceholder={t("web.newItemPopup.vaultSearch")}
          searchEmptyMessage={t("web.newItemPopup.vaultSearchEmpty")}
        >
          <SearchableSelectTrigger className={cn(saveLocationTriggerClassName, "max-w-[11rem]")} />
          <SearchableSelectContent align="start" className="min-w-[14rem]">
            {vaults.map((vault) => (
              <SearchableSelectItem
                key={vault.id}
                value={vault.id}
                label={<VaultSelectLabel vault={vault} />}
                searchText={`${vaultLeadingEmoji(vault)} ${vault.name}`}
              >
                <VaultSelectLabel vault={vault} />
              </SearchableSelectItem>
            ))}
          </SearchableSelectContent>
        </SearchableSelect>
        <span className="shrink-0 text-sm text-foreground" aria-hidden>
          •
        </span>
        <SearchableSelect
          variant="inline"
          value={folderId}
          onValueChange={onFolderIdChange}
          selectedLabel={folderSelectedLabel}
          placeholder={t("web.newItemPopup.noFolder")}
          searchPlaceholder={t("web.newItemPopup.folderSearch")}
          searchEmptyMessage={t("web.newItemPopup.folderSearchEmpty")}
        >
          <SearchableSelectTrigger className={cn(saveLocationTriggerClassName, "max-w-[15rem]")} />
          <SearchableSelectContent align="start" className="min-w-[16rem]">
            <SearchableSelectItem
              value={NO_FOLDER_VALUE}
              label={<FolderSelectLabel label={t("web.newItemPopup.noFolder")} />}
              searchText={t("web.newItemPopup.noFolder")}
            >
              <FolderSelectLabel label={t("web.newItemPopup.noFolder")} />
            </SearchableSelectItem>
            {flatFolders.map((folder) => (
              <SearchableSelectItem
                key={folder.id}
                value={folder.id}
                label={<FolderSelectLabel label={folder.path} />}
                searchText={folder.path}
              >
                <FolderSelectLabel label={folder.path} />
              </SearchableSelectItem>
            ))}
            <FolderSelectCreateRow
              flatFolders={flatFolders}
              createFolderLabel={(name) => t("web.newItemPopup.createFolder", { name })}
              onCreateFolder={createFolder}
            />
          </SearchableSelectContent>
        </SearchableSelect>
        </div>
      </div>
    </section>
  );
}

export function useDefaultNewItemVaultId(vaults: readonly Vault[], vaultsListReady: boolean): string {
  const personalVaultId = vaults.find((vault) => vault.isPersonal)?.id ?? "";
  const fallbackVaultId = vaults[0]?.id ?? "";

  return useMemo(() => {
    if (!vaultsListReady) {
      return "";
    }
    return personalVaultId || fallbackVaultId;
  }, [vaultsListReady, personalVaultId, fallbackVaultId]);
}

export function useSyncedNewItemVaultId(
  vaults: readonly Vault[],
  vaultsListReady: boolean,
): [string, (vaultId: string) => void] {
  const defaultVaultId = useDefaultNewItemVaultId(vaults, vaultsListReady);
  const [vaultId, setVaultId] = useState("");

  useEffect(() => {
    if (!defaultVaultId) {
      return;
    }
    setVaultId((current) => {
      if (!current || !vaults.some((vault) => vault.id === current)) {
        return defaultVaultId;
      }
      return current;
    });
  }, [defaultVaultId, vaults]);

  return [vaultId, setVaultId];
}
