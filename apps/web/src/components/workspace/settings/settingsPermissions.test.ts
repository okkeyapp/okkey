import { describe, expect, it } from "vitest";
import type { WorkspacePermissionsMatrixDto } from "@okkey/types";

import {
  allowedSettingsSections,
  canGetSettingsSection,
  firstAllowedSettingsSection,
  settingsSectionPermissionResource,
} from "./settingsPermissions";

function emptyMatrix(): WorkspacePermissionsMatrixDto {
  return {
    settings: { get: 0, post: 0, put: 0, delete: 0 },
    settings_items: { get: 0, post: 0, put: 0, delete: 0 },
    settings_capsules: { get: 0, post: 0, put: 0, delete: 0 },
    roles: { get: 0, post: 0, put: 0, delete: 0 },
    profiles: { get: 0, post: 0, put: 0, delete: 0 },
    members: { get: 0, post: 0, put: 0, delete: 0 },
    vaults: { get: 0, post: 0, put: 0, delete: 0 },
    billing: { get: 0, post: 0, put: 0, delete: 0 },
  };
}

describe("settingsPermissions", () => {
  it("maps sections to dedicated permission resources", () => {
    expect(settingsSectionPermissionResource("general")).toBe("settings");
    expect(settingsSectionPermissionResource("items")).toBe("settings_items");
    expect(settingsSectionPermissionResource("capsules")).toBe("settings_capsules");
    expect(settingsSectionPermissionResource("plan")).toBe("billing");
    expect(settingsSectionPermissionResource("billing")).toBe("billing");
  });

  it("filters and orders allowed sections by GET", () => {
    const matrix = emptyMatrix();
    matrix.vaults.get = 1;
    matrix.billing.get = 1;
    matrix.members.get = 2;
    expect(allowedSettingsSections(matrix)).toEqual(["members", "vaults", "plan", "billing"]);
    expect(firstAllowedSettingsSection(matrix)).toBe("members");
    expect(canGetSettingsSection(matrix, "general")).toBe(false);
    expect(canGetSettingsSection(matrix, "items")).toBe(false);
    expect(canGetSettingsSection(matrix, "plan")).toBe(true);
  });

  it("includes general subsections only when their resources allow GET", () => {
    const matrix = emptyMatrix();
    matrix.settings.get = 1;
    expect(allowedSettingsSections(matrix)).toEqual(["general"]);
    expect(firstAllowedSettingsSection(matrix)).toBe("general");

    matrix.settings_items.get = 1;
    matrix.settings_capsules.get = 1;
    expect(allowedSettingsSections(matrix)).toEqual(["general", "items", "capsules"]);
  });

  it("allows items without general GET", () => {
    const matrix = emptyMatrix();
    matrix.settings_items.get = 1;
    expect(allowedSettingsSections(matrix)).toEqual(["items"]);
    expect(canGetSettingsSection(matrix, "general")).toBe(false);
    expect(canGetSettingsSection(matrix, "items")).toBe(true);
  });

  it("inherits nested settings GET from legacy settings-only matrices", () => {
    const matrix = {
      settings: { get: 1, post: 0, put: 1, delete: 0 },
      roles: { get: 0, post: 0, put: 0, delete: 0 },
      profiles: { get: 0, post: 0, put: 0, delete: 0 },
      members: { get: 0, post: 0, put: 0, delete: 0 },
      vaults: { get: 0, post: 0, put: 0, delete: 0 },
      billing: { get: 0, post: 0, put: 0, delete: 0 },
    } as WorkspacePermissionsMatrixDto;
    expect(canGetSettingsSection(matrix, "items")).toBe(true);
    expect(canGetSettingsSection(matrix, "capsules")).toBe(true);
  });

  it("returns no sections for empty matrix", () => {
    expect(allowedSettingsSections(emptyMatrix())).toEqual([]);
    expect(firstAllowedSettingsSection(emptyMatrix())).toBeNull();
  });
});
