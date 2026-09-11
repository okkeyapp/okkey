import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@okkey/api";

import {
  accountWebAuthnErrorMessageKey,
  mapAccountWebAuthnError,
} from "./accountWebAuthnCapability";

describe("accountWebAuthnCapability", () => {
  it("maps DOM WebAuthn errors", () => {
    expect(mapAccountWebAuthnError(Object.assign(new Error("x"), { name: "NotAllowedError" }))).toBe(
      "cancelled",
    );
    expect(mapAccountWebAuthnError(Object.assign(new Error("x"), { name: "SecurityError" }))).toBe(
      "security",
    );
    expect(mapAccountWebAuthnError(Object.assign(new Error("x"), { name: "NotSupportedError" }))).toBe(
      "unsupported",
    );
  });

  it("maps API errors to server", () => {
    const err = new ApiRequestError(400, {
      error: "WEBAUTHN_VERIFICATION_FAILED",
      message: "failed",
      requestId: "1",
    });
    expect(mapAccountWebAuthnError(err)).toBe("server");
  });

  it("returns i18n keys for codes", () => {
    expect(accountWebAuthnErrorMessageKey("unavailable")).toBe(
      "web.settingsLogin.webauthn.error.unavailable",
    );
  });
});
