import { describe, expect, it } from "vitest";

import { shouldRedirectAwayFromRegistrationForm } from "./registrationRecoveryStep";

describe("shouldRedirectAwayFromRegistrationForm", () => {
  it("redirects when registration auth state is missing on the form step", () => {
    expect(
      shouldRedirectAwayFromRegistrationForm({
        step: "form",
        registrationAuthStateId: null,
        email: "user@okkey.local",
      }),
    ).toBe(true);
  });

  it("redirects when email is missing on the form step", () => {
    expect(
      shouldRedirectAwayFromRegistrationForm({
        step: "form",
        registrationAuthStateId: "auth-state",
        email: "",
      }),
    ).toBe(true);
  });

  it("stays on the page while enrolling after registrationAuthStateId is cleared", () => {
    expect(
      shouldRedirectAwayFromRegistrationForm({
        step: "enrolling",
        registrationAuthStateId: null,
        email: "user@okkey.local",
      }),
    ).toBe(false);
  });

  it("stays on the page for the recovery key export step", () => {
    expect(
      shouldRedirectAwayFromRegistrationForm({
        step: "recoveryKey",
        registrationAuthStateId: null,
        email: "user@okkey.local",
      }),
    ).toBe(false);
  });

  it("allows the form when registration auth state and email are present", () => {
    expect(
      shouldRedirectAwayFromRegistrationForm({
        step: "form",
        registrationAuthStateId: "auth-state",
        email: "user@okkey.local",
      }),
    ).toBe(false);
  });
});
