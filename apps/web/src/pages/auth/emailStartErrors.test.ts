import { ApiRequestError } from "@okkey/api";
import { describe, expect, it } from "vitest";

import { emailStartErrorI18nKey } from "./emailStartErrors";

describe("emailStartErrorI18nKey", () => {
  it("maps Failed to fetch to network key", () => {
    expect(emailStartErrorI18nKey(new TypeError("Failed to fetch"))).toBe(
      "auth.email.errorNetwork",
    );
  });

  it("maps ApiRequestError INTERNAL_SERVER_ERROR", () => {
    const err = new ApiRequestError(500, {
      error: "INTERNAL_SERVER_ERROR",
      message: "internal server error",
      requestId: "r1",
    });
    expect(emailStartErrorI18nKey(err)).toBe("auth.email.errorServer");
  });

  it("maps ApiRequestError AUTH_RATE_LIMITED", () => {
    const err = new ApiRequestError(429, {
      error: "AUTH_RATE_LIMITED",
      message: "rate limited",
      requestId: "r1",
    });
    expect(emailStartErrorI18nKey(err)).toBe("auth.email.errorRateLimited");
  });

  it("maps SyntaxError (non-JSON API body) to bad response key", () => {
    expect(emailStartErrorI18nKey(new SyntaxError("API response is not valid JSON"))).toBe(
      "auth.email.errorBadResponse",
    );
  });
});
