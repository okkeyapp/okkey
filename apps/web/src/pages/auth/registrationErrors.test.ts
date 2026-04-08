import { ApiRequestError } from "@okkey/api";
import { describe, expect, it } from "vitest";

import { registrationErrorI18nKey } from "./registrationErrors";

describe("registrationErrorI18nKey", () => {
  it("maps AUTH_CHALLENGE_EXPIRED", () => {
    const err = new ApiRequestError(410, {
      error: "AUTH_CHALLENGE_EXPIRED",
      message: "auth state expired or missing",
      requestId: "r1",
    });
    expect(registrationErrorI18nKey(err)).toBe("auth.registration.errorSessionExpired");
  });

  it("maps REGISTRATION_ALREADY_COMPLETED", () => {
    const err = new ApiRequestError(409, {
      error: "REGISTRATION_ALREADY_COMPLETED",
      message: "user already registered",
      requestId: "r1",
    });
    expect(registrationErrorI18nKey(err)).toBe("auth.registration.errorAlreadyRegistered");
  });

  it("maps CRYPTO_ROLLOUT_PAUSED", () => {
    const err = new ApiRequestError(503, {
      error: "CRYPTO_ROLLOUT_PAUSED",
      message: "paused",
      requestId: "r1",
    });
    expect(registrationErrorI18nKey(err)).toBe("auth.registration.errorRolloutPaused");
  });
});
