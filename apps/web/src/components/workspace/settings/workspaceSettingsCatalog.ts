import {
  workspaceCapsulePoliciesFromDto,
  type Workspace,
  type WorkspaceSettingsResponseDto,
} from "@okkey/types";

export const DEFAULT_WORKSPACE_TILE_COLOR = "#3b82f6";

export const DELETED_ITEMS_RETENTION_DAY_OPTIONS = [1, 3, 7, 14, 30] as const;

export const DELETED_ITEMS_RETENTION_OPTION_LABEL_KEYS: Record<
  (typeof DELETED_ITEMS_RETENTION_DAY_OPTIONS)[number],
  string
> = {
  1: "web.workspaceSettings.deletedItemsRetention.option1",
  3: "web.workspaceSettings.deletedItemsRetention.option3",
  7: "web.workspaceSettings.deletedItemsRetention.option7",
  14: "web.workspaceSettings.deletedItemsRetention.option14",
  30: "web.workspaceSettings.deletedItemsRetention.option30",
};

export function deletedItemsRetentionDayOptions(currentDays: number): number[] {
  const preset = [...DELETED_ITEMS_RETENTION_DAY_OPTIONS];
  if (preset.includes(currentDays as (typeof DELETED_ITEMS_RETENTION_DAY_OPTIONS)[number])) {
    return preset;
  }
  return [...preset, currentDays].sort((a, b) => a - b);
}

/** 7 accent palette colors (user settings) + 3 additional vibrant accents. */
export const WORKSPACE_TILE_PRESET_COLORS = [
  "#171717",
  "#3b82f6",
  "#06b6d4",
  "#059669",
  "#f97316",
  "#db2777",
  "#7c3aed",
  "#ef4444",
  "#eab308",
  "#14b8a6",
] as const;

export type WorkspaceSettingsSectionId =
  | "general"
  | "roles"
  | "profiles"
  | "members"
  | "vaults"
  | "plan"
  | "billing";

export const DEFAULT_WORKSPACE_SETTINGS_SECTION: WorkspaceSettingsSectionId = "general";

export function isWorkspaceSettingsSectionId(value: string): value is WorkspaceSettingsSectionId {
  return ["general", "roles", "profiles", "members", "vaults", "plan", "billing"].includes(value);
}

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{3})$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#([0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

export function readableHexColor(value: string): string {
  return normalizeHexColor(value) ?? value;
}

export function workspacePatchFromSettingsResponse(
  updated: WorkspaceSettingsResponseDto,
): Pick<
  Workspace,
  | "name"
  | "deletedItemsRetentionDays"
  | "allowedFileExtensions"
  | "maxFileSizeMb"
  | "filesInItemsEnabled"
  | "capsulePolicies"
  | "tileColor"
  | "logoVaultId"
  | "logoAttachmentId"
> {
  return {
    name: updated.name,
    deletedItemsRetentionDays: updated.deleted_items_retention_days,
    allowedFileExtensions: updated.allowed_file_extensions,
    maxFileSizeMb: updated.max_file_size_mb,
    filesInItemsEnabled: updated.files_in_items_enabled,
    capsulePolicies: workspaceCapsulePoliciesFromDto(updated.capsule_policies),
    tileColor: updated.tile_color,
    logoVaultId: updated.logo_vault_id,
    logoAttachmentId: updated.logo_attachment_id,
  };
}
