import { describe, expect, it } from "vitest";

import { isAllowedPathWithoutBearerSession } from "./guestEntryPaths";
import { INVITE_PATH_PATTERN, invitePath } from "./paths";

const guest = {
  inOtpFlow: false,
  hasRegistrationAuthState: false,
  hasTwoFactorAuthState: false,
};

describe("isAllowedPathWithoutBearerSession", () => {
  it("allows invite landing without a Bearer session", () => {
    expect(isAllowedPathWithoutBearerSession(invitePath("abc"), guest)).toBe(true);
    expect(isAllowedPathWithoutBearerSession(invitePath("token-with-dash"), guest)).toBe(true);
    expect(INVITE_PATH_PATTERN).toBe("/invite/:token");
  });

  it("allows public capsule viewer without a Bearer session", () => {
    expect(isAllowedPathWithoutBearerSession("/capsule/123", guest)).toBe(true);
    expect(isAllowedPathWithoutBearerSession("/capsule/abc-def", guest)).toBe(true);
  });

  it("rejects protected shell paths without a session", () => {
    expect(isAllowedPathWithoutBearerSession("/items", guest)).toBe(false);
    expect(isAllowedPathWithoutBearerSession("/workspaces", guest)).toBe(false);
    expect(isAllowedPathWithoutBearerSession("/capsules", guest)).toBe(false);
  });
});
