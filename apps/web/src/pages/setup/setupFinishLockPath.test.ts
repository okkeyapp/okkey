import { describe, expect, it } from "vitest";

import { ACCOUNT_LOCK_PATH, ITEMS_PATH, WORKSPACE_QUERY_PARAM } from "../../routes/paths";
import { setupFinishLockPath } from "./setupFinishLockPath";

describe("setupFinishLockPath", () => {
  it("routes to the lock screen with items+workspace as redirect", () => {
    const workspaceId = "ws-owner-1";
    const path = setupFinishLockPath(workspaceId);
    expect(path.startsWith(`${ACCOUNT_LOCK_PATH}?redirect=`)).toBe(true);

    const redirect = decodeURIComponent(path.slice(`${ACCOUNT_LOCK_PATH}?redirect=`.length));
    expect(redirect).toBe(
      `${ITEMS_PATH}?${WORKSPACE_QUERY_PARAM}=${encodeURIComponent(workspaceId)}`,
    );
  });

  it("does not point straight at /items (lock first)", () => {
    expect(setupFinishLockPath("ws-2").startsWith(ITEMS_PATH)).toBe(false);
  });
});
