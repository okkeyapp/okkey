import type { Vault, Workspace } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Button, Input, Spinner } from "@okkey/ui";
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
import DeleteWorkspaceConfirmPopup from "./DeleteWorkspaceConfirmPopup";
import WorkspaceTileColorPicker from "./WorkspaceTileColorPicker";
import { DEFAULT_WORKSPACE_TILE_COLOR, readableHexColor } from "./workspaceSettingsCatalog";
import { UploadIcon } from "./workspaceSettingsIcons";

type WorkspaceSettingsGeneralSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  vaults: readonly Vault[];
  t: (messageKey: string, values?: WebMessageValues) => string;
  onSettingsChanged?: () => void;
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState(workspace?.name ?? "");
  const [tileColor, setTileColor] = useState(DEFAULT_WORKSPACE_TILE_COLOR);
  const [logoVaultId, setLogoVaultId] = useState<string | null>(null);
  const [logoAttachmentId, setLogoAttachmentId] = useState<string | null>(null);
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
    setLoading(true);
    setLoadError(null);
    try {
      const settings = await core.getWorkspaceSettings(workspaceId);
      setWorkspaceName(settings.name);
      setTileColor(settings.tile_color ?? DEFAULT_WORKSPACE_TILE_COLOR);
      setLogoVaultId(settings.logo_vault_id);
      setLogoAttachmentId(settings.logo_attachment_id);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : t(SAVE_TOAST.error));
    } finally {
      setLoading(false);
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
    setWorkspaceName(updated.name);
    setTileColor(updated.tile_color ?? DEFAULT_WORKSPACE_TILE_COLOR);
    setLogoVaultId(updated.logo_vault_id);
    setLogoAttachmentId(updated.logo_attachment_id);
    onSettingsChanged?.();
  }

  async function persistSettings(patch: Parameters<NonNullable<typeof core>["updateWorkspaceSettings"]>[1]) {
    if (!core || !isOwner) {
      return;
    }
    setSaving(true);
    try {
      const updated = await runSaveWithToast(saveToastMessages, async () =>
        core.updateWorkspaceSettings(workspaceId, patch),
      );
      applySettingsResponse(updated);
    } catch {
      /* toast handles error */
    } finally {
      setSaving(false);
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
    setSaving(true);
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
      setSaving(false);
    }
  }

  async function handleLogoDelete() {
    if (!core) {
      return;
    }
    setSaving(true);
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
      setSaving(false);
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

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
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
                  disabled={saving}
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
                      disabled={saving}
                      t={t}
                      onChange={(color) => void handleColorChange(color)}
                    />
                  </>
                ) : (
                  <Button type="button" variant="outline" className="h-9 px-3" disabled={saving} onClick={() => void handleLogoDelete()}>
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
              disabled={!isOwner || saving}
              onChange={(event) => setWorkspaceName(event.target.value)}
              onBlur={() => void handleNameBlur()}
            />
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
