import type { CoreApiClient } from "@okkey/api";
import type { NavigateFunction } from "react-router-dom";

import { DEFAULT_AUTHENTICATED_PATH, workspacePath } from "../routes/paths";

export async function navigateAfterSession(
  core: CoreApiClient,
  navigate: NavigateFunction,
  fallback = DEFAULT_AUTHENTICATED_PATH,
): Promise<void> {
  try {
    const workspaces = await core.listWorkspaces();
    if (workspaces.length === 1) {
      navigate(workspacePath(workspaces[0].id), { replace: true });
      return;
    }
    navigate(DEFAULT_AUTHENTICATED_PATH, { replace: true });
  } catch {
    navigate(fallback, { replace: true });
  }
}
