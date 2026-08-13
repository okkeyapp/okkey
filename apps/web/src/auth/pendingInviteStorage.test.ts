import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPendingInviteToken,
  readPendingInviteToken,
  writePendingInviteToken,
} from "./pendingInviteStorage";

describe("pendingInviteStorage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips a token through sessionStorage", () => {
    writePendingInviteToken("  token-1  ");
    expect(readPendingInviteToken()).toBe("token-1");
    clearPendingInviteToken();
    expect(readPendingInviteToken()).toBeNull();
  });

  it("ignores a blank token", () => {
    writePendingInviteToken("   ");
    expect(readPendingInviteToken()).toBeNull();
  });
});
