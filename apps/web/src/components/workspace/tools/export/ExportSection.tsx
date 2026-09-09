import type { Vault } from "@okkey/types";
import {
  getExportFormatOption,
  listExportFormatOptions,
} from "@okkey/import";
import {
  Button,
  Input,
  SearchableSelect,
  SearchableSelectContent,
  SearchableSelectItem,
  SearchableSelectTrigger,
  Switch,
} from "@okkey/ui";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAuthVault } from "../../../../auth/AuthVaultContext";
import { downloadExportBlob, runVaultExport } from "../../../../export/exportOrchestrator";
import { useWorkspaceFolders } from "../../../../folders/WorkspaceFoldersContext";
import { findWorkspaceFolderPathById, NO_FOLDER_VALUE } from "../../../../folders/workspaceFolderTree";
import { useWorkspaceItems } from "../../../../items/WorkspaceItemsContext";
import { useWorkspaceVaultProfiles } from "../../../../items/WorkspaceVaultProfilesContext";
import { useLocale } from "../../../../locale/LocaleContext";
import NewItemSaveLocationSection, {
  useSyncedNewItemVaultId,
} from "../../../items/NewItemSaveLocationSection";
import { GeneratorExternalLinkIcon } from "../generator/generatorIcons";

type ExportSectionProps = {
  workspaceName: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
};

export default function ExportSection({
  workspaceName,
  vaults,
  vaultsListReady,
}: ExportSectionProps) {
  const { t } = useLocale();
  const { accessToken } = useAuthVault();
  const { canViewItem } = useWorkspaceVaultProfiles();
  const { items, resolveVaultEncryptionKey } = useWorkspaceItems();
  const { folderTree, itemFolderByItemId, itemFavoriteByItemId } = useWorkspaceFolders();

  const formatOptions = useMemo(() => listExportFormatOptions(), []);
  const [formatId, setFormatId] = useState(formatOptions[0]?.id ?? "okkeyjson");
  const [vaultId, setVaultId] = useSyncedNewItemVaultId(vaults, vaultsListReady);
  const [folderId] = useState(NO_FOLDER_VALUE);
  const [includeFolders, setIncludeFolders] = useState(true);
  const [protectWithPassword, setProtectWithPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [exporting, setExporting] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");

  const selectedFormat = getExportFormatOption(formatId);
  const supportsPassword = Boolean(selectedFormat?.supportsExportPassword);
  const supportsFolders = Boolean(selectedFormat?.supportsFolders);

  useEffect(() => {
    if (!supportsPassword) {
      setProtectWithPassword(false);
      setPassword("");
    }
  }, [supportsPassword]);

  const exportableCount = useMemo(
    () =>
      items.filter(
        (item) =>
          item.vaultId === vaultId &&
          !item.deleted &&
          canViewItem(item.vaultId, item.categoryId),
      ).length,
    [items, vaultId, canViewItem],
  );

  const canExport =
    !exporting &&
    Boolean(vaultId) &&
    exportableCount > 0 &&
    (!protectWithPassword || password.trim().length > 0);

  async function handleExport() {
    if (!accessToken || !vaultId || !canExport) {
      toast.error(t("web.tools.export.errors.noVaultAccess"));
      return;
    }

    setExporting(true);
    setProgressLabel(t("web.tools.export.progress.collecting"));

    try {
      const vaultKey = await resolveVaultEncryptionKey(vaultId);
      const result = await runVaultExport({
        formatId,
        vaultId,
        items: items.filter((item) => canViewItem(item.vaultId, item.categoryId)),
        itemFolderByItemId,
        itemFavoriteByItemId,
        folderPathById: (id) => findWorkspaceFolderPathById(folderTree, id),
        includeFolders: supportsFolders && includeFolders,
        password: protectWithPassword ? password : undefined,
        accessToken,
        vaultKey,
        onProgress: (progress) => {
          if (progress.phase === "collecting" && progress.currentTitle) {
            setProgressLabel(
              t("web.tools.export.progress.collectingItem", {
                current: progress.processed + 1,
                total: progress.total,
                title: progress.currentTitle,
              }),
            );
          } else if (progress.phase === "building") {
            setProgressLabel(t("web.tools.export.progress.building"));
          }
        },
      });

      downloadExportBlob(result);
      toast.success(
        t("web.tools.export.success", {
          count: exportableCount,
          fileName: result.fileName,
        }),
      );
      setPassword("");
      setProtectWithPassword(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("web.tools.export.errors.generic"));
    } finally {
      setExporting(false);
      setProgressLabel("");
    }
  }

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold leading-7 text-foreground">{t("web.tools.sections.export")}</h2>
        <p className="text-sm leading-5 text-muted-foreground">
          {t("web.tools.export.intro")}{" "}
          <a
            href={t("web.tools.export.learnMoreUrl")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
          >
            {t("web.tools.export.learnMore")}
            <GeneratorExternalLinkIcon />
          </a>
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">{t("web.tools.export.vaultLabel")}</label>
          <NewItemSaveLocationSection
            t={t}
            workspaceName={workspaceName}
            vaults={vaults}
            vaultsListReady={vaultsListReady}
            vaultId={vaultId}
            onVaultIdChange={setVaultId}
            folderId={folderId}
            onFolderIdChange={() => {}}
            hideLabel
            hideFolder
          />
          <p className="text-sm text-muted-foreground">
            {t("web.tools.export.itemCount", { count: exportableCount })}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">{t("web.tools.export.formatLabel")}</label>
          <SearchableSelect
            value={formatId}
            onValueChange={setFormatId}
            selectedLabel={selectedFormat?.name ?? t("web.tools.export.formatPlaceholder")}
            searchPlaceholder={t("web.tools.export.formatSearch")}
          >
            <SearchableSelectTrigger className="h-10 w-full" />
            <SearchableSelectContent align="start" className="min-w-[var(--radix-select-trigger-width)]">
              {formatOptions.map((option) => (
                <SearchableSelectItem
                  key={option.id}
                  value={option.id}
                  label={option.name}
                  searchText={option.name}
                >
                  {option.name}
                </SearchableSelectItem>
              ))}
            </SearchableSelectContent>
          </SearchableSelect>
        </div>

        {supportsFolders ? (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-foreground">{t("web.tools.export.includeFoldersLabel")}</p>
              <p className="text-sm text-muted-foreground">{t("web.tools.export.includeFoldersDescription")}</p>
            </div>
            <Switch
              size="lg"
              checked={includeFolders}
              onCheckedChange={setIncludeFolders}
              aria-label={t("web.tools.export.includeFoldersLabel")}
            />
          </div>
        ) : null}

        {supportsPassword ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">{t("web.tools.export.passwordProtectLabel")}</p>
                <p className="text-sm text-muted-foreground">{t("web.tools.export.passwordProtectDescription")}</p>
              </div>
              <Switch
                size="lg"
                checked={protectWithPassword}
                onCheckedChange={setProtectWithPassword}
                aria-label={t("web.tools.export.passwordProtectLabel")}
              />
            </div>
            {protectWithPassword ? (
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("web.tools.export.passwordPlaceholder")}
                aria-label={t("web.tools.export.passwordProtectLabel")}
              />
            ) : null}
          </div>
        ) : null}

        {progressLabel ? <p className="text-sm text-muted-foreground">{progressLabel}</p> : null}

        <div className="flex justify-end max-md:w-full">
          <Button
            type="button"
            variant="default"
            className="h-9 shrink-0 gap-[4px] rounded-lg px-4 text-sm font-medium max-md:w-full"
            disabled={!canExport}
            aria-label={t("web.tools.export.submit")}
            onClick={() => void handleExport()}
          >
            {exporting ? t("web.tools.export.exporting") : t("web.tools.export.submit")}
          </Button>
        </div>
      </div>
    </div>
  );
}
