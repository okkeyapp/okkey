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
import { writeStoredSession, clearStoredSession } from "./sessionAuthStorage";
import {
  writeStoredCurrentWorkspaceId,
  clearStoredCurrentWorkspaceId,
} from "./workspaceStorage";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("navigateAfterSession", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", memoryStorage());
    vi.stubGlobal("localStorage", memoryStorage());
    clearPendingInviteToken();
    clearStoredSession();
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

  it("opens /items with a stored preferred workspace after invite registration", async () => {
    clearPendingInviteToken();
    writeStoredCurrentWorkspaceId("user-1", "invited-ws");
    writeStoredSession({
      access_token: "t",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      user_id: "user-1",
    });
    const navigate = vi.fn();
    const core = {
      listWorkspaces: vi.fn(async () => [
        { id: "personal-ws", name: "Personal" },
        { id: "invited-ws", name: "Team" },
      ]),
    };
    await navigateAfterSession(core as never, navigate);
    expect(navigate).toHaveBeenCalledWith("/items", { replace: true });
    clearStoredCurrentWorkspaceId("user-1");
  });

  it("opens /items with the first membership when nothing is stored", async () => {
    writeStoredSession({
      access_token: "t",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      user_id: "user-1",
    });
    const navigate = vi.fn();
    const core = {
      listWorkspaces: vi.fn(async () => [
        { id: "personal-ws", name: "Personal" },
        { id: "invited-ws", name: "Team" },
      ]),
    };
    await navigateAfterSession(core as never, navigate);
    expect(navigate).toHaveBeenCalledWith("/items", { replace: true });
  });
});
