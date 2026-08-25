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
    roles: { get: 0, post: 0, put: 0, delete: 0 },
    profiles: { get: 0, post: 0, put: 0, delete: 0 },
    members: { get: 0, post: 0, put: 0, delete: 0 },
    vaults: { get: 0, post: 0, put: 0, delete: 0 },
    billing: { get: 0, post: 0, put: 0, delete: 0 },
  };
}

describe("settingsPermissions", () => {
  it("maps plan and billing to billing resource", () => {
    expect(settingsSectionPermissionResource("general")).toBe("settings");
    expect(settingsSectionPermissionResource("items")).toBe("settings");
    expect(settingsSectionPermissionResource("capsules")).toBe("settings");
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

  it("includes general subsections when settings GET is allowed", () => {
    const matrix = emptyMatrix();
    matrix.settings.get = 1;
    expect(allowedSettingsSections(matrix)).toEqual(["general", "items", "capsules"]);
    expect(firstAllowedSettingsSection(matrix)).toBe("general");
  });

  it("returns no sections for empty matrix", () => {
    expect(allowedSettingsSections(emptyMatrix())).toEqual([]);
    expect(firstAllowedSettingsSection(emptyMatrix())).toBeNull();
  });
});
