export const DEFAULT_WORKSPACE_TILE_COLOR = "#3b82f6";

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
