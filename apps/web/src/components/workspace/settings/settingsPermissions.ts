import type {
  WorkspacePermissionResourceId,
  WorkspacePermissionsMatrixDto,
  WorkspaceResourcePermissionDto,
} from "@okkey/types";
import { permissionAllowsGet } from "@okkey/types";

import type { WorkspaceSettingsSectionId } from "./workspaceSettingsCatalog";
import { WORKSPACE_SETTINGS_SECTIONS } from "./workspaceSettingsMenu";

/** UI section → role matrix resource (plan shares billing). */
export function settingsSectionPermissionResource(
  section: WorkspaceSettingsSectionId,
): WorkspacePermissionResourceId {
  switch (section) {
    case "general":
      return "settings";
    case "roles":
      return "roles";
    case "profiles":
      return "profiles";
    case "members":
      return "members";
    case "vaults":
      return "vaults";
    case "plan":
    case "billing":
      return "billing";
  }
}

export function settingsSectionPermissionCell(
  matrix: WorkspacePermissionsMatrixDto | null | undefined,
  section: WorkspaceSettingsSectionId,
): WorkspaceResourcePermissionDto | null {
  if (!matrix) {
    return null;
  }
  return matrix[settingsSectionPermissionResource(section)];
}

export function canGetSettingsSection(
  matrix: WorkspacePermissionsMatrixDto | null | undefined,
  section: WorkspaceSettingsSectionId,
): boolean {
  const cell = settingsSectionPermissionCell(matrix, section);
  return cell ? permissionAllowsGet(cell.get) : false;
}

/** Sections visible in settings nav, preserving catalog order. */
export function allowedSettingsSections(
  matrix: WorkspacePermissionsMatrixDto | null | undefined,
): WorkspaceSettingsSectionId[] {
  if (!matrix) {
    return [];
  }
  return WORKSPACE_SETTINGS_SECTIONS.filter((section) => canGetSettingsSection(matrix, section));
}

export function firstAllowedSettingsSection(
  matrix: WorkspacePermissionsMatrixDto | null | undefined,
): WorkspaceSettingsSectionId | null {
  return allowedSettingsSections(matrix)[0] ?? null;
}
