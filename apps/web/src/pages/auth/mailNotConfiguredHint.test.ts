import { describe, expect, it } from "vitest";

import { shouldShowMailNotConfiguredHint } from "./mailNotConfiguredHint";

describe("shouldShowMailNotConfiguredHint", () => {
  it("shows the hint only when mail is not deliverable", () => {
    expect(shouldShowMailNotConfiguredHint(false)).toBe(true);
    expect(shouldShowMailNotConfiguredHint(true)).toBe(false);
    expect(shouldShowMailNotConfiguredHint(null)).toBe(false);
    expect(shouldShowMailNotConfiguredHint(undefined)).toBe(false);
  });
});
