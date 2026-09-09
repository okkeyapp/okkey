import type { Vault } from "@okkey/types";
import {
  getImportFormatOption,
  listImportFormatOptions,
  looksLikeBitwardenPasswordProtectedJson,
  parseImportInput,
  ImportInvalidPasswordError,
  ImportPasswordRequiredError,
} from "@okkey/import";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  KeyField,
  KeyForm,
  KeySection,
  SearchableSelect,
  SearchableSelectContent,
  SearchableSelectItem,
  SearchableSelectTrigger,
  Switch,
  buildKeyFieldFileUploadConstraints,
  getKeyFieldSurfaceRounding,
  serializeKeyFieldFileValue,
  cn,
  type KeyFieldFileValue,
} from "@okkey/ui";
import { useEffect, useMemo, useState, type SVGProps } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { useAuthVault } from "../../../../auth/AuthVaultContext";
import { useWorkspaceFolders } from "../../../../folders/WorkspaceFoldersContext";
import { NO_FOLDER_VALUE } from "../../../../folders/workspaceFolderTree";
import { runVaultImport } from "../../../../import/importOrchestrator";
import { useWorkspaceItems } from "../../../../items/WorkspaceItemsContext";
import { useWorkspaceVaultProfiles } from "../../../../items/WorkspaceVaultProfilesContext";
import { useLocale } from "../../../../locale/LocaleContext";
import { settingsPath } from "../../../../routes/paths";
import NewItemSaveLocationSection, {
  useSyncedNewItemVaultId,
} from "../../../items/NewItemSaveLocationSection";
import { GeneratorExternalLinkIcon } from "../generator/generatorIcons";
import { ImportIcon } from "../toolsIcons";
import ImportExportPasswordPopup from "./ImportExportPasswordPopup";

type ImportInputMode = "file" | "text";

/** Export archives with many records/attachments can be large; do not reuse per-item attachment limit. */
const IMPORT_SOURCE_MAX_FILE_SIZE_MB = 200;

function AlertInfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

type ImportSectionProps = {
  workspaceName: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
};

export default function ImportSection({
  workspaceName,
  vaults,
  vaultsListReady,
}: ImportSectionProps) {
  const { t } = useLocale();
  const { accessToken } = useAuthVault();
  const { canPostToVault } = useWorkspaceVaultProfiles();
  const { createItem, resolveVaultEncryptionKey, maxFileSizeMb, allowedFileExtensions } = useWorkspaceItems();
  const { assignItemToFolder, createFolder, setItemFavorite } = useWorkspaceFolders();

  const formatOptions = useMemo(() => listImportFormatOptions(), []);
  const [formatId, setFormatId] = useState(formatOptions[0]?.id ?? "bitwardenjson");
  const [inputMode, setInputMode] = useState<ImportInputMode>("file");
  const [textValue, setTextValue] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [folderId, setFolderId] = useState(NO_FOLDER_VALUE);
  const [importFolders, setImportFolders] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [vaultId, setVaultId] = useSyncedNewItemVaultId(vaults, vaultsListReady);
  const [passwordPopupOpen, setPasswordPopupOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pendingBundle, setPendingBundle] = useState<{
    text: string;
    attachmentFiles: Map<string, Uint8Array>;
  } | null>(null);

  const selectedFormat = getImportFormatOption(formatId);
  const supportsTextPaste = selectedFormat?.supportsTextPaste ?? true;
  const isBitwardenFormat =
    formatId === "bitwardenjson" || formatId === "bitwardencsv" || formatId === "bitwardenzip";
  const showZipAttachmentsNote = formatId === "bitwardenzip" && inputMode === "file";
  const attachmentLimitMb = maxFileSizeMb > 0 ? maxFileSizeMb : 2;
  const allowedAttachmentFormatsLabel = useMemo(() => {
    if (allowedFileExtensions.length === 0) {
      return "";
    }
    return t("web.tools.import.zipAttachmentsNoteFormatsList", {
      formats: allowedFileExtensions.join(", "),
    });
  }, [allowedFileExtensions, t]);

  useEffect(() => {
    if (!supportsTextPaste && inputMode === "text") {
      setInputMode("file");
    }
  }, [supportsTextPaste, inputMode]);

  const fileUploadConstraints = useMemo(
    () =>
      buildKeyFieldFileUploadConstraints(
        selectedFormat?.acceptedFileTypes ?? ["csv", "json", "txt", "xml", "zip"],
        IMPORT_SOURCE_MAX_FILE_SIZE_MB,
      ),
    [selectedFormat?.acceptedFileTypes],
  );

  const fieldRounding = useMemo(
    () =>
      getKeyFieldSurfaceRounding({
        mode: "edit",
        sectionVariant: "primary",
        fieldIndex: 0,
        fieldsCount: 1,
        canAddField: false,
      }),
    [],
  );

  const inputModeOptions = useMemo(
    () =>
      [
        ["file", ImportFileTabIcon, t("web.tools.import.tabs.file")] as const,
        ["text", ImportTextTabIcon, t("web.tools.import.tabs.text")] as const,
      ].filter(([value]) => value === "file" || supportsTextPaste),
    [supportsTextPaste, t],
  );

  const canImport =
    !importing &&
    Boolean(vaultId) &&
    canPostToVault(vaultId) &&
    (inputMode === "text" ? textValue.trim().length > 0 : selectedFile != null);

  async function handleImport() {
    if (!accessToken || !vaultId || !canPostToVault(vaultId)) {
      toast.error(t("web.tools.import.errors.noVaultAccess"));
      return;
    }

    setImporting(true);
    setProgressLabel(t("web.tools.import.progress.parsing"));
    setPasswordError(null);

    try {
      const bundle = await parseImportInput({
        mode: inputMode,
        text: textValue,
        file: selectedFile,
        formatId,
      });

      if (
        (formatId === "bitwardenjson" || formatId === "bitwardenzip") &&
        looksLikeBitwardenPasswordProtectedJson(bundle.text)
      ) {
        setPendingBundle(bundle);
        setPasswordPopupOpen(true);
        setImporting(false);
        setProgressLabel("");
        return;
      }

      await runImportWithBundle(bundle);
    } catch (error) {
      if (error instanceof ImportPasswordRequiredError) {
        setPendingBundle({
          text: inputMode === "text" ? textValue : "",
          attachmentFiles: new Map(),
        });
        setPasswordPopupOpen(true);
        return;
      }
      toast.error(error instanceof Error ? error.message : t("web.tools.import.errors.generic"));
    } finally {
      setImporting(false);
      setProgressLabel("");
    }
  }

  async function runImportWithBundle(
    bundle: { text: string; attachmentFiles: Map<string, Uint8Array> },
    exportPassword?: string,
  ) {
    if (!accessToken || !vaultId) {
      return;
    }

    setImporting(true);
    setProgressLabel(t("web.tools.import.progress.parsing"));

    try {
      const vaultKey = await resolveVaultEncryptionKey(vaultId);
      const result = await runVaultImport({
        formatId,
        text: bundle.text,
        attachmentFiles: bundle.attachmentFiles,
        vaultId,
        targetFolderId: folderId === NO_FOLDER_VALUE ? null : folderId,
        importFolders: isBitwardenFormat && importFolders,
        accessToken,
        vaultKey,
        exportPassword,
        createItem,
        assignItemToFolder,
        createFolder,
        setItemFavorite,
        onProgress: (progress) => {
          if (progress.phase === "importing" && progress.currentTitle) {
            setProgressLabel(
              t("web.tools.import.progress.importing", {
                current: progress.processed + 1,
                total: progress.total,
                title: progress.currentTitle,
              }),
            );
          }
        },
      });

      if (result.createdCount === 0) {
        toast.error(result.errors[0] ?? t("web.tools.import.errors.emptyResult"));
      } else {
        toast.success(
          t("web.tools.import.success", {
            count: result.createdCount,
            skipped: result.skippedCount,
          }),
        );
      }

      if (result.errors.length > 0 && result.createdCount > 0) {
        toast.message(t("web.tools.import.partialErrors", { count: result.errors.length }));
      }

      setSelectedFile(null);
      setTextValue("");
      setPendingBundle(null);
      setPasswordPopupOpen(false);
      setPasswordError(null);
    } catch (error) {
      if (error instanceof ImportInvalidPasswordError) {
        setPasswordError(t("web.tools.import.exportPassword.invalid"));
        setPasswordPopupOpen(true);
        return;
      }
      if (error instanceof ImportPasswordRequiredError) {
        setPasswordPopupOpen(true);
        return;
      }
      toast.error(error instanceof Error ? error.message : t("web.tools.import.errors.generic"));
      setPasswordPopupOpen(false);
    } finally {
      setImporting(false);
      setProgressLabel("");
    }
  }

  async function handleExportPasswordSubmit(password: string) {
    if (!pendingBundle) {
      setPasswordPopupOpen(false);
      return;
    }
    setPasswordError(null);
    await runImportWithBundle(pendingBundle, password);
  }

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold leading-7 text-foreground">{t("web.tools.sections.import")}</h2>
        <p className="text-sm leading-5 text-muted-foreground">
          {t("web.tools.import.intro")}{" "}
          <a
            href={t("web.tools.import.learnMoreUrl")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
          >
            {t("web.tools.import.learnMore")}
            <GeneratorExternalLinkIcon />
          </a>
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">{t("web.tools.import.vaultLabel")}</label>
          <NewItemSaveLocationSection
            t={t}
            workspaceName={workspaceName}
            vaults={vaults}
            vaultsListReady={vaultsListReady}
            vaultId={vaultId}
            onVaultIdChange={setVaultId}
            folderId={folderId}
            onFolderIdChange={setFolderId}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">{t("web.tools.import.formatLabel")}</label>
          <SearchableSelect
            value={formatId}
            onValueChange={setFormatId}
            selectedLabel={selectedFormat?.name ?? formatId}
            searchPlaceholder={t("web.tools.import.formatSearch")}
            searchEmptyMessage={t("web.tools.import.formatSearchEmpty")}
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

        {isBitwardenFormat ? (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-foreground">{t("web.tools.import.importFoldersLabel")}</p>
              <p className="text-sm text-muted-foreground">{t("web.tools.import.importFoldersDescription")}</p>
            </div>
            <Switch
              size="lg"
              checked={importFolders}
              onCheckedChange={setImportFolders}
              aria-label={t("web.tools.import.importFoldersLabel")}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <div className="relative flex w-fit rounded-lg bg-secondary p-1" role="tablist" aria-label={t("web.tools.import.inputTabsAria")}>
            {inputModeOptions.map(([value, Icon, label]) => {
              const active = inputMode === value;
              return (
                <Button
                  key={value}
                  type="button"
                  role="tab"
                  size="sm"
                  variant={active ? "outline" : "ghost"}
                  aria-selected={active}
                  className={cn(
                    "relative border",
                    active
                      ? cn(
                          "z-10",
                          "!bg-background hover:!bg-background active:!bg-background",
                          "hover:!border-input focus:!border-input focus-visible:!border-input",
                          "focus:hover:!border-input focus-visible:hover:!border-input",
                          "!shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                          "focus:!shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-visible:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                          "focus:hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-visible:hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                          "dark:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
                          "dark:focus:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:focus-visible:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
                          "dark:focus:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:focus-visible:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
                        )
                      : cn(
                          "z-0 border-transparent shadow-none",
                          "hover:border-transparent hover:bg-foreground/5",
                          "focus:shadow-none focus-visible:shadow-none",
                          "dark:focus:shadow-none dark:focus-visible:shadow-none",
                          "focus:bg-foreground/10 focus-visible:bg-foreground/10",
                          "active:bg-foreground/10",
                        ),
                  )}
                  onClick={() => setInputMode(value)}
                >
                  <Icon data-icon="inline-start" />
                  {label}
                </Button>
              );
            })}
          </div>

          <KeyForm mode="edit" className="gap-0">
            <KeySection variant="primary" mode="edit">
              {inputMode === "text" ? (
                <KeyField
                  className="border-b-transparent"
                  label={t("web.tools.import.tabs.text")}
                  mode="edit"
                  editableValue
                  multilineValue
                  multilineMaxRows={10}
                  value={textValue}
                  onValueChange={setTextValue}
                  valuePlaceholder={t("web.tools.import.textPlaceholder")}
                  surfaceRounding={fieldRounding}
                />
              ) : (
                <KeyField
                  className="border-b-transparent"
                  label={t("web.tools.import.tabs.file")}
                  mode="edit"
                  editableValue
                  fileValue
                  value={
                    selectedFile
                      ? serializeKeyFieldFileValue({
                          attachmentId: `import-local-${selectedFile.name}-${selectedFile.lastModified}`,
                          name: selectedFile.name,
                          mimeType: selectedFile.type || "application/octet-stream",
                          sizeBytes: selectedFile.size,
                        })
                      : ""
                  }
                  onValueChange={(value) => {
                    if (!value) {
                      setSelectedFile(null);
                    }
                  }}
                  onFileUpload={async (nextFile): Promise<KeyFieldFileValue> => {
                    setSelectedFile(nextFile);
                    return {
                      attachmentId: `import-local-${nextFile.name}-${nextFile.lastModified}`,
                      name: nextFile.name,
                      mimeType: nextFile.type || "application/octet-stream",
                      sizeBytes: nextFile.size,
                    };
                  }}
                  fileUploadConstraints={fileUploadConstraints}
                  fileUploadLabel={t("web.tools.import.uploadFile")}
                  fileClearLabel={t("web.tools.import.fileClearLabel")}
                  surfaceRounding={fieldRounding}
                />
              )}
            </KeySection>
          </KeyForm>
          {showZipAttachmentsNote ? (
            <Alert variant="default">
              <AlertInfoIcon className="size-4" />
              <AlertTitle>{t("web.tools.import.zipAttachmentsNoteTitle")}</AlertTitle>
              <AlertDescription>
                <ol className="mt-1 list-decimal space-y-1.5 pl-4">
                  <li>
                    {t("web.tools.import.zipAttachmentsNoteSize", { maxMb: attachmentLimitMb })}{" "}
                    <Link
                      to={settingsPath("items")}
                      className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
                    >
                      {t("web.tools.import.zipAttachmentsNoteLink")}
                    </Link>
                    .
                  </li>
                  <li>
                    {t("web.tools.import.zipAttachmentsNoteFormats", {
                      formatsSuffix: allowedAttachmentFormatsLabel,
                    })}
                  </li>
                </ol>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        {progressLabel ? <p className="text-sm text-muted-foreground">{progressLabel}</p> : null}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="default"
            className="h-9 shrink-0 gap-[4px] rounded-lg px-4 text-sm font-medium"
            disabled={!canImport}
            aria-label={t("web.tools.import.submit")}
            onClick={() => void handleImport()}
          >
            <ImportIcon className="size-4 shrink-0" />
            {importing ? t("web.tools.import.importing") : t("web.tools.import.submit")}
          </Button>
        </div>
      </div>

      <ImportExportPasswordPopup
        open={passwordPopupOpen}
        submitting={importing}
        errorMessage={passwordError}
        t={t}
        onClose={() => {
          if (importing) {
            return;
          }
          setPasswordPopupOpen(false);
          setPasswordError(null);
          setPendingBundle(null);
        }}
        onSubmit={(password) => {
          void handleExportPasswordSubmit(password);
        }}
      />
    </div>
  );
}

function ImportTextTabIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M8.00008 13.3334H14.0001M10.0001 3.33341L12.0001 5.33341M10.9174 2.41473C11.1828 2.14934 11.5427 2.00024 11.9181 2.00024C12.2934 2.00024 12.6533 2.14934 12.9187 2.41473C13.1841 2.68013 13.3332 3.04008 13.3332 3.4154C13.3332 3.79072 13.1841 4.15067 12.9187 4.41607L4.91207 12.4234C4.75346 12.582 4.55741 12.698 4.34207 12.7607L2.4274 13.3194C2.37003 13.3361 2.30923 13.3371 2.25134 13.3223C2.19345 13.3075 2.14062 13.2774 2.09836 13.2351C2.05611 13.1929 2.02599 13.14 2.01116 13.0821C1.99633 13.0242 1.99733 12.9634 2.01407 12.9061L2.57273 10.9914C2.63555 10.7763 2.75156 10.5805 2.91007 10.4221L10.9174 2.41473Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImportFileTabIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M9.33341 1.33325V3.99992C9.33341 4.35354 9.47389 4.69268 9.72394 4.94273C9.97399 5.19278 10.3131 5.33325 10.6667 5.33325H13.3334M10.0001 1.33325H4.00008C3.64646 1.33325 3.30732 1.47373 3.05727 1.72378C2.80722 1.97382 2.66675 2.31296 2.66675 2.66659V13.3333C2.66675 13.6869 2.80722 14.026 3.05727 14.2761C3.30732 14.5261 3.64646 14.6666 4.00008 14.6666H12.0001C12.3537 14.6666 12.6928 14.5261 12.9429 14.2761C13.1929 14.026 13.3334 13.6869 13.3334 13.3333V4.66659L10.0001 1.33325Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
