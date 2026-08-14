import { Navigate, useOutletContext } from "react-router-dom";
import type { WorkspacePermissionsMatrixDto } from "@okkey/types";

import { firstAllowedSettingsSection } from "../../components/workspace/settings/settingsPermissions";
import { settingsPath } from "../../routes/paths";
import type { WorkspaceShellOutletContext } from "./WorkspaceSectionPage";
import WorkspaceForbiddenPage from "./WorkspaceForbiddenPage";

/** `/settings` → first GET-allowed section, or 403 when none. */
export default function SettingsIndexRedirect() {
  const { workspacePermissions, workspacePermissionsReady } =
    useOutletContext<WorkspaceShellOutletContext>();

  if (!workspacePermissionsReady) {
    return null;
  }

  const first = firstAllowedSettingsSection(workspacePermissions);
  if (!first) {
    return <WorkspaceForbiddenPage />;
  }
  return <Navigate to={settingsPath(first)} replace />;
}

export function settingsPathForPermissions(
  matrix: WorkspacePermissionsMatrixDto | null | undefined,
): string | null {
  const first = firstAllowedSettingsSection(matrix);
  return first ? settingsPath(first) : null;
}
