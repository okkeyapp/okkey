import type { CoreApiClient } from "@okkey/api";
import type { NavigateFunction } from "react-router-dom";

export async function navigateAfterSession(
  core: CoreApiClient,
  navigate: NavigateFunction,
  fallback = "/workspaces",
): Promise<void> {
  try {
    const workspaces = await core.listWorkspaces();
    if (workspaces.length === 1) {
      navigate(`/workspaces/${workspaces[0].id}`, { replace: true });
      return;
    }
    navigate("/workspaces", { replace: true });
  } catch {
    navigate(fallback, { replace: true });
  }
}
