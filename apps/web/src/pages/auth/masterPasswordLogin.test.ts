import { describe, expect, it } from "vitest";

import { shouldPromptMasterPasswordLogin } from "./masterPasswordLogin";

describe("shouldPromptMasterPasswordLogin", () => {
  it("uses the master password when email is not deliverable", () => {
    expect(shouldPromptMasterPasswordLogin({ emailDeliverable: false })).toBe(true);
  });

  it("keeps the emailed code when mail is deliverable or the flag is absent", () => {
    expect(shouldPromptMasterPasswordLogin({ emailDeliverable: true })).toBe(false);
    expect(shouldPromptMasterPasswordLogin({})).toBe(false);
  });

  it("keeps first-run registration ahead of the master-password step", () => {
    expect(
      shouldPromptMasterPasswordLogin({
        emailDeliverable: false,
        bootstrapRequired: true,
      }),
    ).toBe(false);
  });
});
