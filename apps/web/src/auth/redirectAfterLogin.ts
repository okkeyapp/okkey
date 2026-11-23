import type { CoreApiClient } from "@okkey/api";
import type { NavigateFunction } from "react-router-dom";
import workspaceTenancyModule from "@okkey-enterprise/workspace-tenancy";

import { DEFAULT_AUTHENTICATED_PATH, invitePath, ITEMS_PATH, WORKSPACES_PATH } from "../routes/paths";
import { completeExtensionAuthHandoffIfPending } from "./completeExtensionAuthHandoff";
import { readPendingInviteToken } from "./pendingInviteStorage";
import { resolveCurrentWorkspaceId } from "./resolveCurrentWorkspaceId";
import { readStoredSession } from "./sessionAuthStorage";
import {
  readStoredCurrentWorkspaceId,
  writeStoredCurrentWorkspaceId,
} from "./workspaceStorage";

export async function navigateAfterSession(
  core: CoreApiClient,
  navigate: NavigateFunction,
  fallback = DEFAULT_AUTHENTICATED_PATH,
): Promise<void> {
  // Extension PKCE: finish session handoff and leave web (no vault unlock required).
  if (await completeExtensionAuthHandoffIfPending()) {
    return;
  }

  // Pending invite that still needs accept (email/link flow for existing accounts).
  // Invite-link registration clears the token after register/complete.
  const pendingInvite = readPendingInviteToken();
  if (pendingInvite) {
    navigate(invitePath(pendingInvite), { replace: true });
    return;
  }
  try {
    const workspaces = await core.listWorkspaces();
    const session = readStoredSession();
    const userId = session?.user_id;
    const preferred = userId ? readStoredCurrentWorkspaceId(userId) : null;
    const resolved = resolveCurrentWorkspaceId({
      memberships: workspaces,
      preferredId: preferred,
    });
    if (resolved && userId) {
      writeStoredCurrentWorkspaceId(userId, resolved);
      navigate(ITEMS_PATH, { replace: true });
      return;
    }
    navigate(workspaceTenancyModule.canCreateWorkspace ? WORKSPACES_PATH : ITEMS_PATH, { replace: true });
  } catch {
    navigate(fallback === WORKSPACES_PATH && !workspaceTenancyModule.canCreateWorkspace ? ITEMS_PATH : fallback);
  }
}
