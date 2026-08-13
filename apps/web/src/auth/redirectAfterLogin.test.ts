import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@okkey-enterprise/workspace-tenancy", () => ({
  default: { canCreateWorkspace: true },
}));

import { navigateAfterSession } from "./redirectAfterLogin";
import { writePendingInviteToken, clearPendingInviteToken } from "./pendingInviteStorage";

describe("navigateAfterSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearPendingInviteToken();
  });

  it("sends the user to the pending invite landing when a token is stored", async () => {
    writePendingInviteToken("invite-token-1");
    const navigate = vi.fn();
    const core = { listWorkspaces: vi.fn() };
    await navigateAfterSession(core as never, navigate);
    expect(navigate).toHaveBeenCalledWith("/invite/invite-token-1", { replace: true });
    expect(core.listWorkspaces).not.toHaveBeenCalled();
  });
});
