import {
  ALL_CAPSULE_TYPES,
  DEFAULT_ALLOWED_FILE_EXTENSIONS,
  DEFAULT_MAX_FILE_SIZE_MB,
  DEFAULT_WORKSPACE_CAPSULE_POLICIES,
  formatMaxFileSizeMb,
  normalizeAllowedFileExtensions,
  normalizeMaxFileSizeMbInput,
  resolveMaxFileSizeMbFromInput,
  workspaceCapsulePoliciesToDto,
  type CapsuleAllowMode,
  type CapsuleType,
  type Vault,
  type Workspace,
  type WorkspaceCapsulePolicies,
  type WorkspaceMemberDirectoryEntryDto,
} from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import {
  Button,
  Input,
  MultiSelect,
  MultiSelectContent,
  MultiSelectItem,
  MultiSelectTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFieldRow,
  Switch,
} from "@okkey/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import workspaceCapsulesModule from "@okkey-enterprise/workspace-capsules";
import workspaceTenancyModule from "@okkey-enterprise/workspace-tenancy";

import { workspaceHasPlanFeature } from "../../../workspace/planEntitlements";

import {
  deleteKeyFieldFileAttachment,
  uploadKeyFieldFileAttachment,
} from "../../../api/key-field-files";
import { useAuthVault, useAuthenticatedCoreClient } from "../../../auth/AuthVaultContext";
import { useWorkspaceLogoUrl } from "../../../hooks/useWorkspaceLogoUrl";
import { runSaveWithToast } from "../../../lib/saveWithToast";
import WorkspaceLogoTile from "../WorkspaceLogoTile";
import FileExtensionTagsInput from "./FileExtensionTagsInput";
import WorkspaceSettingsCapsulesSkeleton from "./WorkspaceSettingsCapsulesSkeleton";
import WorkspaceSettingsGeneralSkeleton from "./WorkspaceSettingsGeneralSkeleton";
import WorkspaceSettingsItemsSkeleton from "./WorkspaceSettingsItemsSkeleton";
import WorkspaceTileColorPicker from "./WorkspaceTileColorPicker";
import {
  DEFAULT_WORKSPACE_TILE_COLOR,
  DELETED_ITEMS_RETENTION_OPTION_LABEL_KEYS,
  deletedItemsRetentionDayOptions,
  readableHexColor,
  workspacePatchFromSettingsResponse,
} from "./workspaceSettingsCatalog";
import { UploadIcon } from "./workspaceSettingsIcons";

function cloneCapsulePolicies(policies: WorkspaceCapsulePolicies): WorkspaceCapsulePolicies {
  return {
    ...policies,
    allowMemberIds: [...policies.allowMemberIds],
    allowedCapsuleTypes: [...policies.allowedCapsuleTypes],
  };
}

const CAPSULE_TYPE_LABEL_KEYS: Record<CapsuleType, string> = {
  text: "web.capsules.list.type.text",
  file: "web.capsules.list.type.file",
  item: "web.capsules.list.type.item",
};

function capsulePoliciesEqual(a: WorkspaceCapsulePolicies, b: WorkspaceCapsulePolicies): boolean {
  return (
    JSON.stringify(workspaceCapsulePoliciesToDto(a)) ===
    JSON.stringify(workspaceCapsulePoliciesToDto(b))
  );
}
type WorkspaceSettingsGeneralPanel = "general" | "items" | "capsules";

type WorkspaceSettingsGeneralSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  vaults: readonly Vault[];
  t: (messageKey: string, values?: WebMessageValues) => string;
  /** Which block of general settings to show. */
  panel?: WorkspaceSettingsGeneralPanel;
  onSettingsChanged?: (patch: ReturnType<typeof workspacePatchFromSettingsResponse>) => void;
  /** When omitted, falls back to workspace owner (tests / legacy). */
  canPut?: boolean;
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
  panel = "general",
  onSettingsChanged,
  canPut,
}: WorkspaceSettingsGeneralSectionProps) {
  const core = useAuthenticatedCoreClient();
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
  const [maxFileSizeMb, setMaxFileSizeMb] = useState<number>(DEFAULT_MAX_FILE_SIZE_MB);
  const [maxFileSizeMbInput, setMaxFileSizeMbInput] = useState(formatMaxFileSizeMb(DEFAULT_MAX_FILE_SIZE_MB));
  const [filesInItemsEnabled, setFilesInItemsEnabled] = useState(true);
  const [capsulePolicies, setCapsulePolicies] = useState<WorkspaceCapsulePolicies>(() =>
    cloneCapsulePolicies(DEFAULT_WORKSPACE_CAPSULE_POLICIES),
  );
  const [forceMaxViewsInput, setForceMaxViewsInput] = useState("0");
  const [directoryMembers, setDirectoryMembers] = useState<WorkspaceMemberDirectoryEntryDto[]>([]);

  const isOwner = Boolean(workspace && userId && workspace.ownerId === userId);
  const canEdit = canPut ?? isOwner;
  const canManageCapsuleAccessSettings = workspaceHasPlanFeature(workspace, "capsuleAccessSettings");
  const CapsulesAdvancedPoliciesSection = workspaceCapsulesModule.CapsulesAdvancedPoliciesSection;
  const showCapsuleAccessSettings = Boolean(
    CapsulesAdvancedPoliciesSection && canManageCapsuleAccessSettings,
  );
  const DangerZoneSection = workspaceTenancyModule.DangerZoneSection;
  const showDangerZone = Boolean(isOwner && DangerZoneSection);
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
      setCapsulePolicies(cloneCapsulePolicies(patch.capsulePolicies));
      setForceMaxViewsInput(String(patch.capsulePolicies.forceMaxViews));
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
    if (!core || !workspaceId) {
      return;
    }
    void core
      .listWorkspaceMemberDirectory(workspaceId)
      .then((result) => setDirectoryMembers(result.members))
      .catch(() => setDirectoryMembers([]));
  }, [core, workspaceId]);

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
    setCapsulePolicies((prev) =>
      capsulePoliciesEqual(prev, patch.capsulePolicies)
        ? prev
        : cloneCapsulePolicies(patch.capsulePolicies),
    );
    setForceMaxViewsInput((prev) => {
      const next = String(patch.capsulePolicies.forceMaxViews);
      return prev === next ? prev : next;
    });
    onSettingsChanged?.(patch);
  }

  async function persistSettings(patch: Parameters<NonNullable<typeof core>["updateWorkspaceSettings"]>[1]) {
    if (!core || !canEdit) {
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

  async function persistCapsulePolicies(next: WorkspaceCapsulePolicies) {
    if (capsulePoliciesEqual(next, capsulePolicies)) {
      return;
    }
    const previous = cloneCapsulePolicies(capsulePolicies);
    setCapsulePolicies(cloneCapsulePolicies(next));
    setForceMaxViewsInput(String(next.forceMaxViews));
    try {
      await persistSettings({ capsule_policies: workspaceCapsulePoliciesToDto(next) });
    } catch {
      setCapsulePolicies(previous);
      setForceMaxViewsInput(String(previous.forceMaxViews));
    }
  }

  async function handleCapsuleAllowModeChange(nextMode: CapsuleAllowMode) {
    await persistCapsulePolicies({
      ...capsulePolicies,
      allowMode: nextMode,
      allowMemberIds:
        nextMode === "selected" || nextMode === "all_except" ? capsulePolicies.allowMemberIds : [],
    });
  }

  async function handleCapsuleAllowMembersChange(memberIds: string[]) {
    await persistCapsulePolicies({
      ...capsulePolicies,
      allowMemberIds: memberIds,
    });
  }

  async function handleForceMaxViewsBlur() {
    const parsed = Number.parseInt(forceMaxViewsInput.trim(), 10);
    const nextValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setForceMaxViewsInput(String(nextValue));
    if (nextValue === capsulePolicies.forceMaxViews) {
      return;
    }
    await persistCapsulePolicies({ ...capsulePolicies, forceMaxViews: nextValue });
  }

  async function handleAllowedCapsuleTypesChange(values: string[]) {
    const nextTypes = ALL_CAPSULE_TYPES.filter((type) => values.includes(type));
    await persistCapsulePolicies({
      ...capsulePolicies,
      allowedCapsuleTypes: nextTypes,
    });
  }

  const showCapsuleMemberPicker =
    capsulePolicies.allowMode === "selected" || capsulePolicies.allowMode === "all_except";

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

  if (initialLoading) {
    if (panel === "items") {
      return <WorkspaceSettingsItemsSkeleton label={t("web.workspaceSettings.general.loading")} />;
    }
    if (panel === "capsules") {
      return <WorkspaceSettingsCapsulesSkeleton label={t("web.workspaceSettings.general.loading")} />;
    }
    return (
      <WorkspaceSettingsGeneralSkeleton
        showDangerZone={showDangerZone}
        label={t("web.workspaceSettings.general.loading")}
      />
    );
  }

  return (
    <>
      <div className="flex w-full flex-col gap-9">
        {panel === "general" ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-6">
            <WorkspaceLogoTile
              className="size-[60px] shrink-0"
              tileColor={tileColor}
              hasCustomLogo={hasCustomLogo}
              imageSrc={logoUrl.imageSrc}
              loading={logoUrl.loading}
            />

            {canEdit ? (
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
              disabled={!canEdit}
              onChange={(event) => setWorkspaceName(event.target.value)}
              onBlur={() => void handleNameBlur()}
            />
          </div>
        </div>
        ) : null}

        {panel === "items" ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-foreground">
              {t("web.workspaceSettings.sections.items")}
            </h2>
            <p className="text-sm leading-5 text-muted-foreground">
              {t("web.workspaceSettings.items.intro")}
            </p>
          </div>
          <div className="flex flex-col">
            <SettingsFieldRow
              control={
                <Select
                  value={String(deletedItemsRetentionDays)}
                  disabled={!canEdit}
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
              }
            >
              <label htmlFor="deleted-items-retention" className="text-sm font-medium text-foreground">
                {t("web.workspaceSettings.deletedItemsRetention.label")}
              </label>
              <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.deletedItemsRetention.description")}</p>
            </SettingsFieldRow>

            <div className="my-4 border-t border-border" aria-hidden />

            <SettingsFieldRow
              control={
                <Switch
                  size="lg"
                  checked={filesInItemsEnabled}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => void handleFilesInItemsEnabledChange(checked)}
                  aria-label={t("web.workspaceSettings.filesInItems.label")}
                />
              }
            >
              <p className="text-sm font-medium text-foreground">{t("web.workspaceSettings.filesInItems.label")}</p>
              <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.filesInItems.description")}</p>
            </SettingsFieldRow>

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
                    disabled={!canEdit}
                    placeholder={t("web.workspaceSettings.allowedFileExtensions.placeholder")}
                    removeTagAriaLabel={(tag) => t("web.workspaceSettings.allowedFileExtensions.removeTagAria", { tag })}
                    inputAriaLabel={t("web.workspaceSettings.allowedFileExtensions.inputAria")}
                    onCommit={(extensions) => void handleAllowedFileExtensionsCommit(extensions)}
                  />
                </div>

                <div className="my-4 border-t border-border" aria-hidden />

                <SettingsFieldRow
                  control={
                    <Input
                      id="max-file-size-mb"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-full shrink-0 sm:w-[150px]"
                      value={maxFileSizeMbInput}
                      disabled={!canEdit}
                      onChange={(event) => setMaxFileSizeMbInput(normalizeMaxFileSizeMbInput(event.target.value))}
                      onBlur={() => void handleMaxFileSizeMbBlur()}
                    />
                  }
                >
                  <label htmlFor="max-file-size-mb" className="text-sm font-medium text-foreground">
                    {t("web.workspaceSettings.maxFileSizeMb.label")}
                  </label>
                  <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.maxFileSizeMb.description")}</p>
                </SettingsFieldRow>
              </>
            ) : null}
          </div>
        </div>
        ) : null}

        {panel === "capsules" ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-foreground">
              {t("web.workspaceSettings.sections.capsules")}
            </h2>
            <p className="text-sm leading-5 text-muted-foreground">
              {t("web.workspaceSettings.capsules.intro")}
            </p>
          </div>
          <div className="flex flex-col">
            <SettingsFieldRow
              control={
                <Select
                  value={capsulePolicies.allowMode}
                  disabled={!canEdit}
                  onValueChange={(value) => void handleCapsuleAllowModeChange(value as CapsuleAllowMode)}
                >
                  <SelectTrigger id="capsule-allow-mode" className="h-9 w-full shrink-0 sm:w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("web.workspaceSettings.capsules.allow.none")}</SelectItem>
                    <SelectItem value="all">{t("web.workspaceSettings.capsules.allow.all")}</SelectItem>
                    <SelectItem value="selected">{t("web.workspaceSettings.capsules.allow.selected")}</SelectItem>
                    <SelectItem value="all_except">
                      {t("web.workspaceSettings.capsules.allow.allExcept")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              }
            >
              <label htmlFor="capsule-allow-mode" className="text-sm font-medium text-foreground">
                {t("web.workspaceSettings.capsules.allow.label")}
              </label>
              <p className="text-sm text-muted-foreground">
                {t("web.workspaceSettings.capsules.allow.description")}
              </p>
            </SettingsFieldRow>

            {showCapsuleMemberPicker ? (
              <div className="mt-4">
                <MultiSelect
                  filterable
                  searchPlaceholder={t("web.workspaceSettings.capsules.allow.membersSearch")}
                  searchEmptyMessage={t("web.workspaceSettings.capsules.allow.membersEmpty")}
                  value={capsulePolicies.allowMemberIds}
                  onValueChange={(value) => void handleCapsuleAllowMembersChange(value)}
                  placeholder={t("web.workspaceSettings.capsules.allow.membersPlaceholder")}
                  disabled={!canEdit}
                >
                  <MultiSelectTrigger className="font-normal" />
                  <MultiSelectContent className="min-w-[min(100vw-2rem,22rem)]">
                    {directoryMembers.map((member) => (
                      <MultiSelectItem
                        key={member.userId}
                        value={member.userId}
                        chipLabel={member.email}
                        searchText={`${member.firstName ?? ""} ${member.lastName ?? ""} ${member.email}`}
                        className="items-start py-2"
                      >
                        <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
                          <span className="font-medium text-foreground">
                            {[member.firstName, member.lastName].filter(Boolean).join(" ") ||
                              member.email}
                          </span>
                          <span className="text-xs text-muted-foreground">{member.email}</span>
                        </span>
                      </MultiSelectItem>
                    ))}
                  </MultiSelectContent>
                </MultiSelect>
              </div>
            ) : null}

            <div className="my-4 border-t border-border" aria-hidden />

            <SettingsFieldRow
              control={
                <MultiSelect
                  value={capsulePolicies.allowedCapsuleTypes}
                  onValueChange={(value) => void handleAllowedCapsuleTypesChange(value)}
                  placeholder={t("web.workspaceSettings.capsules.allowedTypes.placeholder")}
                  disabled={!canEdit}
                  displayMode="summary"
                  selectionSummaryText={
                    capsulePolicies.allowedCapsuleTypes.length === ALL_CAPSULE_TYPES.length
                      ? t("web.workspaceSettings.capsules.allowedTypes.all")
                      : String(capsulePolicies.allowedCapsuleTypes.length)
                  }
                >
                  <MultiSelectTrigger
                    id="capsule-allowed-types"
                    className="!h-9 min-h-9 w-full shrink-0 font-normal sm:w-[150px]"
                  />
                  <MultiSelectContent className="min-w-[min(100vw-2rem,16rem)]">
                    {ALL_CAPSULE_TYPES.map((type) => (
                      <MultiSelectItem key={type} value={type} chipLabel={t(CAPSULE_TYPE_LABEL_KEYS[type])}>
                        {t(CAPSULE_TYPE_LABEL_KEYS[type])}
                      </MultiSelectItem>
                    ))}
                  </MultiSelectContent>
                </MultiSelect>
              }
            >
              <label htmlFor="capsule-allowed-types" className="text-sm font-medium text-foreground">
                {t("web.workspaceSettings.capsules.allowedTypes.label")}
              </label>
              <p className="text-sm text-muted-foreground">
                {t("web.workspaceSettings.capsules.allowedTypes.description")}
              </p>
            </SettingsFieldRow>

            <div className="my-4 border-t border-border" aria-hidden />

            <SettingsFieldRow
              control={
                <Input
                  id="capsule-force-max-views"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="w-full shrink-0 sm:w-[150px]"
                  value={forceMaxViewsInput}
                  disabled={!canEdit}
                  onChange={(event) => setForceMaxViewsInput(event.target.value.replace(/[^\d]/g, ""))}
                  onBlur={() => void handleForceMaxViewsBlur()}
                />
              }
            >
              <label htmlFor="capsule-force-max-views" className="text-sm font-medium text-foreground">
                {t("web.workspaceSettings.capsules.forceMaxViews.label")}
              </label>
              <p className="text-sm text-muted-foreground">
                {t("web.workspaceSettings.capsules.forceMaxViews.description")}
              </p>
            </SettingsFieldRow>

            {showCapsuleAccessSettings && CapsulesAdvancedPoliciesSection ? (
              <CapsulesAdvancedPoliciesSection
                policies={capsulePolicies}
                canEdit={canEdit}
                t={t}
                onPersist={persistCapsulePolicies}
              />
            ) : null}
          </div>
        </div>
        ) : null}

        {panel === "general" && showDangerZone && DangerZoneSection ? (
          <DangerZoneSection workspaceId={workspaceId} workspaceName={workspaceName.trim()} t={t} />
        ) : null}

        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      </div>
    </>
  );
}
