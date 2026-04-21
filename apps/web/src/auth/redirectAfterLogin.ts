import type { CoreApiClient } from "@okkey/api";
import type { NavigateFunction } from "react-router-dom";

import { DEFAULT_AUTHENTICATED_PATH, ITEMS_PATH, WORKSPACES_PATH } from "../routes/paths";
import { readStoredSession } from "./sessionAuthStorage";
import { writeStoredCurrentWorkspaceId } from "./workspaceStorage";

export async function navigateAfterSession(
  core: CoreApiClient,
  navigate: NavigateFunction,
  fallback = DEFAULT_AUTHENTICATED_PATH,
): Promise<void> {
  try {
    const workspaces = await core.listWorkspaces();
    const session = readStoredSession();
    const userId = session?.user_id;
    if (workspaces.length === 1 && userId) {
      writeStoredCurrentWorkspaceId(userId, workspaces[0].id);
      navigate(ITEMS_PATH, { replace: true });
      return;
    }
    navigate(WORKSPACES_PATH, { replace: true });
  } catch {
    navigate(fallback, { replace: true });
  }
}
