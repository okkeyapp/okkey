import { describe, expect, it } from "vitest";

import {
  DATE_TIME_PICKER_BODY_MAX_HEIGHT_CLASS,
  DATE_TIME_PICKER_POPOVER_CONTENT_CLASS,
  POPOVER_VIEWPORT_MAX_HEIGHT_CLASS,
} from "./popover-positioning.js";

describe("popover positioning class helpers", () => {
  it("ties popover max-height to Radix available height for flip/shift", () => {
    expect(POPOVER_VIEWPORT_MAX_HEIGHT_CLASS).toContain(
      "var(--radix-popover-content-available-height",
    );
    expect(DATE_TIME_PICKER_BODY_MAX_HEIGHT_CLASS).toContain(
      "var(--radix-popover-content-available-height",
    );
    expect(DATE_TIME_PICKER_POPOVER_CONTENT_CLASS).toContain(POPOVER_VIEWPORT_MAX_HEIGHT_CLASS);
    expect(DATE_TIME_PICKER_POPOVER_CONTENT_CLASS).toContain("overflow-hidden");
  });
});
