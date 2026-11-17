import { describe, expect, it } from "vitest";

import { defaultPasskeyName } from "./defaultPasskeyName";

describe("defaultPasskeyName", () => {
  it("uses browser and OS when both are known", () => {
    expect(
      defaultPasskeyName(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on macOS");
  });

  it("falls back to the browser label alone when OS is unknown", () => {
    expect(defaultPasskeyName("Chrome/120.0.0.0")).toMatch(/Chrome|Passkey/);
  });
});
