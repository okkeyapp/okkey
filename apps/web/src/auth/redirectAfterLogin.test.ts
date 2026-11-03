import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@okkey-enterprise/workspace-tenancy", () => ({
  default: { canCreateWorkspace: true, DangerZoneSection: null },
}));

vi.mock("./completeExtensionAuthHandoff", () => ({
  completeExtensionAuthHandoffIfPending: vi.fn(async () => false),
}));

import { navigateAfterSession } from "./redirectAfterLogin";
import { writePendingInviteToken, clearPendingInviteToken } from "./pendingInviteStorage";
import { completeExtensionAuthHandoffIfPending } from "./completeExtensionAuthHandoff";

describe("navigateAfterSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearPendingInviteToken();
    vi.mocked(completeExtensionAuthHandoffIfPending).mockResolvedValue(false);
  });

  it("sends the user to the pending invite landing when a token is stored", async () => {
    writePendingInviteToken("invite-token-1");
    const navigate = vi.fn();
    const core = { listWorkspaces: vi.fn() };
    await navigateAfterSession(core as never, navigate);
    expect(navigate).toHaveBeenCalledWith("/invite/invite-token-1", { replace: true });
    expect(core.listWorkspaces).not.toHaveBeenCalled();
  });

  it("prefers extension PKCE handoff over invite/vault navigation", async () => {
    vi.mocked(completeExtensionAuthHandoffIfPending).mockResolvedValue(true);
    writePendingInviteToken("invite-token-1");
    const navigate = vi.fn();
    const core = { listWorkspaces: vi.fn() };
    await navigateAfterSession(core as never, navigate);
    expect(completeExtensionAuthHandoffIfPending).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(core.listWorkspaces).not.toHaveBeenCalled();
  });
});
