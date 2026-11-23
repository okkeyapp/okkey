import { describe, expect, it } from "vitest";

import { setupCodeErrorKind } from "./setupCodeErrors";

describe("setupCodeErrorKind", () => {
  it("maps SETUP_CODE_INVALID by body.error even when message is present", () => {
    expect(
      setupCodeErrorKind({
        status: 401,
        body: { error: "SETUP_CODE_INVALID", message: "invalid setup code" },
      }),
    ).toBe("invalid");
  });

  it("maps SETUP_CODE_LOCKED by body.error before message", () => {
    expect(
      setupCodeErrorKind({
        status: 429,
        body: {
          error: "SETUP_CODE_LOCKED",
          message: "too many setup code attempts; restart the API process to mint a fresh one-time setup code",
        },
      }),
    ).toBe("locked");
  });

  it("treats HTTP 429 without a known code as locked", () => {
    expect(setupCodeErrorKind({ status: 429, body: { message: "rate limited" } })).toBe("locked");
  });

  it("falls back to generic for other errors", () => {
    expect(setupCodeErrorKind({ status: 500, body: { message: "boom" } })).toBe("generic");
    expect(setupCodeErrorKind(new Error("network"))).toBe("generic");
    expect(setupCodeErrorKind(null)).toBe("generic");
  });
});
