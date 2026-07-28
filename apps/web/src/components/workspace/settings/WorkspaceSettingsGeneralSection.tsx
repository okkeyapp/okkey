import {
  DEFAULT_ALLOWED_FILE_EXTENSIONS,
  DEFAULT_MAX_FILE_SIZE_MB,
  formatMaxFileSizeMb,
  normalizeAllowedFileExtensions,
  normalizeMaxFileSizeMbInput,
  parseMaxFileSizeMbFromInput,
  resolveMaxFileSizeMbFromInput,
} from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Switch,
} from "@okkey/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  deleteKeyFieldFileAttachment,
  uploadKeyFieldFileAttachment,
} from "../../../api/key-field-files";
import { useAuthVault, useAuthenticatedCoreClient } from "../../../auth/AuthVaultContext";
import { useWorkspaceLogoUrl } from "../../../hooks/useWorkspaceLogoUrl";
import { runSaveWithToast } from "../../../lib/saveWithToast";
import { WORKSPACES_PATH } from "../../../routes/paths";
import WorkspaceLogoTile from "../WorkspaceLogoTile";
import type { Vault, Workspace } from "@okkey/types";
import DeleteWorkspaceConfirmPopup from "./DeleteWorkspaceConfirmPopup";
import FileExtensionTagsInput from "./FileExtensionTagsInput";
import WorkspaceTileColorPicker from "./WorkspaceTileColorPicker";
import {
  DEFAULT_WORKSPACE_TILE_COLOR,
  DELETED_ITEMS_RETENTION_OPTION_LABEL_KEYS,
  deletedItemsRetentionDayOptions,
  readableHexColor,
  workspacePatchFromSettingsResponse,
} from "./workspaceSettingsCatalog";
import { UploadIcon } from "./workspaceSettingsIcons";

type WorkspaceSettingsGeneralSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  vaults: readonly Vault[];
  t: (messageKey: string, values?: WebMessageValues) => string;
  onSettingsChanged?: (patch: ReturnType<typeof workspacePatchFromSettingsResponse>) => void;
};

const SAVE_TOAST = {
  loading: "web.toast.save.loading",
  success: "web.toast.save.success",
  error: "web.toast.save.error",
} as const;

export default function WorkspaceSettingsGeneralSection({
  workspaceId,
  workspace,
  vaults,
  t,
  onSettingsChanged,
}: WorkspaceSettingsGeneralSectionProps) {
  const core = useAuthenticatedCoreClient();
  const navigate = useNavigate();
  const { userId, accessToken, vaultKey } = useAuthVault();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [logoSaving, setLogoSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState(workspace?.name ?? "");
  const [tileColor, setTileColor] = useState(DEFAULT_WORKSPACE_TILE_COLOR);
  const [logoVaultId, setLogoVaultId] = useState<string | null>(null);
  const [logoAttachmentId, setLogoAttachmentId] = useState<string | null>(null);
  const [deletedItemsRetentionDays, setDeletedItemsRetentionDays] = useState(30);
  const [allowedFileExtensions, setAllowedFileExtensions] = useState<string[]>([...DEFAULT_ALLOWED_FILE_EXTENSIONS]);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(DEFAULT_MAX_FILE_SIZE_MB);
  const [maxFileSizeMbInput, setMaxFileSizeMbInput] = useState(formatMaxFileSizeMb(DEFAULT_MAX_FILE_SIZE_MB));
  const [filesInItemsEnabled, setFilesInItemsEnabled] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

  const isOwner = Boolean(workspace && userId && workspace.ownerId === userId);
  const personalVault = useMemo(() => vaults.find((vault) => vault.isPersonal), [vaults]);
  const hasCustomLogo = Boolean(logoVaultId && logoAttachmentId);
  const logoUrl = useWorkspaceLogoUrl({
    accessToken,
    vaultKey,
    vaultId: logoVaultId,
    attachmentId: logoAttachmentId,
    workspaceId,
    enabled: hasCustomLogo,
  });

  const saveToastMessages = useMemo(
    () => ({
      loading: t(SAVE_TOAST.loading),
      success: t(SAVE_TOAST.success),
      error: t(SAVE_TOAST.error),
    }),
    [t],
  );

  const loadSettings = useCallback(async () => {
    if (!core || !workspaceId) {
      return;
    }
    setLoadError(null);
    try {
      const settings = await core.getWorkspaceSettings(workspaceId);
      const patch = workspacePatchFromSettingsResponse(settings);
      setWorkspaceName(patch.name);
      setTileColor(patch.tileColor ?? DEFAULT_WORKSPACE_TILE_COLOR);
      setLogoVaultId(patch.logoVaultId ?? null);
      setLogoAttachmentId(patch.logoAttachmentId ?? null);
      setDeletedItemsRetentionDays(patch.deletedItemsRetentionDays);
      setAllowedFileExtensions([...patch.allowedFileExtensions]);
      setMaxFileSizeMb(patch.maxFileSizeMb);
      setMaxFileSizeMbInput(formatMaxFileSizeMb(patch.maxFileSizeMb));
      setFilesInItemsEnabled(patch.filesInItemsEnabled);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : t(SAVE_TOAST.error));
    } finally {
      setInitialLoading(false);
    }
  }, [core, t, workspaceId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (workspace?.name) {
      setWorkspaceName(workspace.name);
    }
  }, [workspace?.name]);

  function applySettingsResponse(
    updated: Awaited<ReturnType<NonNullable<typeof core>["updateWorkspaceSettings"]>>,
  ) {
    const patch = workspacePatchFromSettingsResponse(updated);
    setWorkspaceName((prev) => (prev === patch.name ? prev : patch.name));
    setTileColor((prev) => {
      const next = patch.tileColor ?? DEFAULT_WORKSPACE_TILE_COLOR;
      return prev === next ? prev : next;
    });
    setLogoVaultId((prev) => (prev === patch.logoVaultId ? prev : patch.logoVaultId ?? null));
    setLogoAttachmentId((prev) => (prev === patch.logoAttachmentId ? prev : patch.logoAttachmentId ?? null));
    setDeletedItemsRetentionDays((prev) =>
      prev === patch.deletedItemsRetentionDays ? prev : patch.deletedItemsRetentionDays,
    );
    setAllowedFileExtensions((prev) =>
      prev.length === patch.allowedFileExtensions.length &&
      prev.every((item, index) => item === patch.allowedFileExtensions[index])
        ? prev
        : [...patch.allowedFileExtensions],
    );
    setMaxFileSizeMb((prev) => (prev === patch.maxFileSizeMb ? prev : patch.maxFileSizeMb));
    setMaxFileSizeMbInput((prev) => {
      const next = formatMaxFileSizeMb(patch.maxFileSizeMb);
      return prev === next ? prev : next;
    });
    setFilesInItemsEnabled((prev) => (prev === patch.filesInItemsEnabled ? prev : patch.filesInItemsEnabled));
    onSettingsChanged?.(patch);
  }

  async function persistSettings(patch: Parameters<NonNullable<typeof core>["updateWorkspaceSettings"]>[1]) {
    if (!core || !isOwner) {
      return;
    }
    try {
      const updated = await runSaveWithToast(saveToastMessages, async () =>
        core.updateWorkspaceSettings(workspaceId, patch),
      );
      applySettingsResponse(updated);
    } catch {
      /* toast handles error */
    }
  }

  async function handleColorChange(nextColor: string) {
    await persistSettings({ tile_color: readableHexColor(nextColor) });
  }

  async function handleNameBlur() {
    const trimmed = workspaceName.trim();
    if (!trimmed || trimmed === workspace?.name) {
      return;
    }
    await persistSettings({ name: trimmed });
  }

  async function handleRetentionChange(nextDays: number) {
    if (nextDays === deletedItemsRetentionDays) {
      return;
    }
    await persistSettings({ deleted_items_retention_days: nextDays });
  }

  async function handleAllowedFileExtensionsCommit(nextExtensions: string[]) {
    const normalized = normalizeAllowedFileExtensions(nextExtensions);
    const current = normalizeAllowedFileExtensions(allowedFileExtensions);
    if (normalized.length === current.length && normalized.every((item, index) => item === current[index])) {
      return;
    }
    await persistSettings({ allowed_file_extensions: normalized });
  }

  async function handleMaxFileSizeMbBlur() {
    const resolved = resolveMaxFileSizeMbFromInput(maxFileSizeMbInput);
    setMaxFileSizeMbInput(formatMaxFileSizeMb(resolved));
    if (resolved === maxFileSizeMb) {
      return;
    }
    await persistSettings({ max_file_size_mb: resolved });
  }

  async function handleFilesInItemsEnabledChange(nextEnabled: boolean) {
    if (nextEnabled === filesInItemsEnabled) {
      return;
    }
    const previousEnabled = filesInItemsEnabled;
    setFilesInItemsEnabled(nextEnabled);
    try {
      await persistSettings({ files_in_items_enabled: nextEnabled });
    } catch {
      setFilesInItemsEnabled(previousEnabled);
    }
  }

  const retentionDayOptions = useMemo(
    () => deletedItemsRetentionDayOptions(deletedItemsRetentionDays),
    [deletedItemsRetentionDays],
  );

  async function removeExistingLogoAttachment() {
    if (!accessToken || !vaultKey || !logoVaultId || !logoAttachmentId) {
      return;
    }
    await deleteKeyFieldFileAttachment({
      accessToken,
      vaultId: logoVaultId,
      itemId: workspaceId,
      vaultKey,
      file: {
        attachmentId: logoAttachmentId,
        name: "workspace-logo",
        mimeType: "image/png",
        sizeBytes: 0,
      },
    });
  }

  async function handleLogoUpload(file: File) {
    if (!core || !accessToken || !vaultKey || !personalVault) {
      return;
    }
    setLogoSaving(true);
    try {
      await runSaveWithToast(saveToastMessages, async () => {
        const uploaded = await uploadKeyFieldFileAttachment({
          accessToken,
          vaultId: personalVault.id,
          itemId: workspaceId,
          vaultKey,
          file,
        });
        if (logoVaultId && logoAttachmentId) {
          await removeExistingLogoAttachment();
        }
        const updated = await core.updateWorkspaceSettings(workspaceId, {
          logo_vault_id: personalVault.id,
          logo_attachment_id: uploaded.attachmentId,
        });
        applySettingsResponse(updated);
      });
    } catch {
      /* toast handles error */
    } finally {
      setLogoSaving(false);
    }
  }

  async function handleLogoDelete() {
    if (!core) {
      return;
    }
    setLogoSaving(true);
    try {
      await runSaveWithToast(saveToastMessages, async () => {
        if (logoVaultId && logoAttachmentId) {
          await removeExistingLogoAttachment();
        }
        const updated = await core.updateWorkspaceSettings(workspaceId, {
          logo_vault_id: null,
          logo_attachment_id: null,
        });
        applySettingsResponse(updated);
      });
    } catch {
      /* toast handles error */
    } finally {
      setLogoSaving(false);
    }
  }

  async function handleDeleteWorkspace() {
    if (!core) {
      return;
    }
    setDeletingWorkspace(true);
    try {
      await runSaveWithToast(
        {
          loading: t("web.workspaceSettings.deleteConfirm.deleting"),
          success: t("web.workspaceSettings.deleteConfirm.success"),
          error: t("web.workspaceSettings.deleteConfirm.error"),
        },
        async () => core.deleteWorkspace(workspaceId, { confirmation_name: workspaceName.trim() }),
      );
      setDeleteConfirmOpen(false);
      navigate(WORKSPACES_PATH, { replace: true });
    } catch {
      /* toast handles error */
    } finally {
      setDeletingWorkspace(false);
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="flex w-full flex-col gap-9">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-6">
            <WorkspaceLogoTile
              className="size-[60px] shrink-0"
              tileColor={tileColor}
              hasCustomLogo={hasCustomLogo}
              imageSrc={logoUrl.imageSrc}
              loading={logoUrl.loading}
            />

            {isOwner ? (
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) {
                      void handleLogoUpload(file);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 gap-1.5 px-3"
                  disabled={logoSaving}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon />
                  {hasCustomLogo
                    ? t("web.workspaceSettings.general.replaceLogo")
                    : t("web.workspaceSettings.general.uploadLogo")}
                </Button>
                {!hasCustomLogo ? (
                  <>
                    <span className="text-base text-foreground">{t("web.workspaceSettings.general.or")}</span>
                    <WorkspaceTileColorPicker
                      value={tileColor}
                      disabled={logoSaving}
                      t={t}
                      onChange={(color) => void handleColorChange(color)}
                    />
                  </>
                ) : (
                  <Button type="button" variant="outline" className="h-9 px-3" disabled={logoSaving} onClick={() => void handleLogoDelete()}>
                    {t("web.workspaceSettings.general.removeLogo")}
                  </Button>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            <label htmlFor="workspace-name" className="text-sm font-medium text-foreground">
              {t("web.workspaceSettings.general.nameLabel")}
            </label>
            <Input
              id="workspace-name"
              value={workspaceName}
              disabled={!isOwner}
              onChange={(event) => setWorkspaceName(event.target.value)}
              onBlur={() => void handleNameBlur()}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <h3 className="text-lg font-semibold text-foreground">{t("web.workspaceSettings.general.itemsSection")}</h3>
          <div className="flex flex-col">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <label htmlFor="deleted-items-retention" className="text-sm font-medium text-foreground">
                  {t("web.workspaceSettings.deletedItemsRetention.label")}
                </label>
                <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.deletedItemsRetention.description")}</p>
              </div>
              <Select
                value={String(deletedItemsRetentionDays)}
                disabled={!isOwner}
                onValueChange={(value) => void handleRetentionChange(Number(value))}
              >
                <SelectTrigger id="deleted-items-retention" className="h-9 w-full shrink-0 sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {retentionDayOptions.map((days) => {
                    const labelKey = DELETED_ITEMS_RETENTION_OPTION_LABEL_KEYS[days as keyof typeof DELETED_ITEMS_RETENTION_OPTION_LABEL_KEYS];
                    return (
                      <SelectItem key={days} value={String(days)}>
                        {labelKey ? t(labelKey) : `${days}`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="my-4 border-t border-border" aria-hidden />

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">{t("web.workspaceSettings.filesInItems.label")}</p>
                <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.filesInItems.description")}</p>
              </div>
              <Switch
                size="lg"
                checked={filesInItemsEnabled}
                disabled={!isOwner}
                onCheckedChange={(checked) => void handleFilesInItemsEnabledChange(checked)}
                aria-label={t("web.workspaceSettings.filesInItems.label")}
              />
            </div>

            {filesInItemsEnabled ? (
              <>
                <div className="my-4 border-t border-border" aria-hidden />

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="allowed-file-extensions" className="text-sm font-medium text-foreground">
                      {t("web.workspaceSettings.allowedFileExtensions.label")}
                    </label>
                    <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.allowedFileExtensions.description")}</p>
                  </div>
                  <FileExtensionTagsInput
                    value={allowedFileExtensions}
                    disabled={!isOwner}
                    placeholder={t("web.workspaceSettings.allowedFileExtensions.placeholder")}
                    removeTagAriaLabel={(tag) => t("web.workspaceSettings.allowedFileExtensions.removeTagAria", { tag })}
                    inputAriaLabel={t("web.workspaceSettings.allowedFileExtensions.inputAria")}
                    onCommit={(extensions) => void handleAllowedFileExtensionsCommit(extensions)}
                  />
                </div>

                <div className="my-4 border-t border-border" aria-hidden />

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <label htmlFor="max-file-size-mb" className="text-sm font-medium text-foreground">
                      {t("web.workspaceSettings.maxFileSizeMb.label")}
                    </label>
                    <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.maxFileSizeMb.description")}</p>
                  </div>
                  <Input
                    id="max-file-size-mb"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full shrink-0 sm:w-[150px]"
                    value={maxFileSizeMbInput}
                    disabled={!isOwner}
                    onChange={(event) => setMaxFileSizeMbInput(normalizeMaxFileSizeMbInput(event.target.value))}
                    onBlur={() => void handleMaxFileSizeMbBlur()}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>

        {isOwner ? (
          <div className="flex flex-col gap-6">
            <h3 className="text-lg font-semibold text-destructive">{t("web.workspaceSettings.general.dangerZone")}</h3>
            <div className="flex flex-col gap-4 rounded-lg bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-destructive">{t("web.workspaceSettings.general.deleteTitle")}</p>
                <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.general.deleteDescription")}</p>
              </div>
              <Button type="button" variant="destructive" className="shrink-0" onClick={() => setDeleteConfirmOpen(true)}>
                {t("web.workspaceSettings.general.deleteAction")}
              </Button>
            </div>
          </div>
        ) : null}

        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      </div>

      <DeleteWorkspaceConfirmPopup
        open={deleteConfirmOpen}
        workspaceName={workspaceName.trim()}
        deleting={deletingWorkspace}
        t={t}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void handleDeleteWorkspace()}
      />
    </>
  );
}
