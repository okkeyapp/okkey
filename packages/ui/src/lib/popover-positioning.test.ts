import { describe, expect, it } from "vitest";

import {
  clampDateTimePickerSize,
  DATE_TIME_PICKER_BODY_LAYOUT_CLASS,
  DATE_TIME_PICKER_BODY_MAX_HEIGHT_CLASS,
  DATE_TIME_PICKER_CALENDAR_SCROLL_CLASS,
  DATE_TIME_PICKER_POPOVER_CONTENT_CLASS,
  DATE_TIME_PICKER_TIME_COLUMN_CLASS,
  DATE_TIME_PICKER_VIEWPORT_MARGIN_PX,
  POPOVER_VIEWPORT_MAX_HEIGHT_CLASS,
  POPOVER_VIEWPORT_MAX_WIDTH_CLASS,
} from "./popover-positioning.js";

describe("popover positioning class helpers", () => {
  it("ties popover max-height and max-width to the viewport / Radix available space", () => {
    expect(POPOVER_VIEWPORT_MAX_HEIGHT_CLASS).toContain(
      "var(--radix-popover-content-available-height",
    );
    expect(POPOVER_VIEWPORT_MAX_WIDTH_CLASS).toContain("100vw");
    expect(DATE_TIME_PICKER_BODY_MAX_HEIGHT_CLASS).toContain(
      "var(--radix-popover-content-available-height",
    );
    expect(DATE_TIME_PICKER_POPOVER_CONTENT_CLASS).toContain(POPOVER_VIEWPORT_MAX_HEIGHT_CLASS);
    expect(DATE_TIME_PICKER_POPOVER_CONTENT_CLASS).toContain(POPOVER_VIEWPORT_MAX_WIDTH_CLASS);
    expect(DATE_TIME_PICKER_POPOVER_CONTENT_CLASS).toContain("overflow-hidden");
    expect(DATE_TIME_PICKER_BODY_LAYOUT_CLASS).toContain("flex-col");
    expect(DATE_TIME_PICKER_CALENDAR_SCROLL_CLASS).toContain("overflow-y-auto");
    expect(DATE_TIME_PICKER_CALENDAR_SCROLL_CLASS).toContain("min-h-[12rem]");
    expect(DATE_TIME_PICKER_CALENDAR_SCROLL_CLASS).toContain("sm:min-h-0");
    expect(DATE_TIME_PICKER_TIME_COLUMN_CLASS).toContain("w-full");
    expect(DATE_TIME_PICKER_TIME_COLUMN_CLASS).toContain("h-[9rem]");
    expect(DATE_TIME_PICKER_TIME_COLUMN_CLASS).toContain("overflow-hidden");
    expect(DATE_TIME_PICKER_TIME_COLUMN_CLASS).toContain("sm:h-auto");
  });

  it("clamps preferred size into 375x667 and 1280x720 viewports", () => {
    const preferred = { width: 393, height: 400 };

    const phone = clampDateTimePickerSize(
      preferred.width,
      preferred.height,
      375,
      667,
      DATE_TIME_PICKER_VIEWPORT_MARGIN_PX,
    );
    expect(phone.width).toBe(375 - DATE_TIME_PICKER_VIEWPORT_MARGIN_PX * 2);
    expect(phone.height).toBeLessThanOrEqual(667 - DATE_TIME_PICKER_VIEWPORT_MARGIN_PX * 2);
    expect(phone.width).toBeLessThanOrEqual(375);
    expect(phone.height).toBeLessThanOrEqual(667);

    const laptop = clampDateTimePickerSize(
      preferred.width,
      preferred.height,
      1280,
      720,
      DATE_TIME_PICKER_VIEWPORT_MARGIN_PX,
    );
    expect(laptop.width).toBe(preferred.width);
    expect(laptop.height).toBe(preferred.height);
  });
});
