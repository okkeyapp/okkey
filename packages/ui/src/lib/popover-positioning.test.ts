import { describe, expect, it } from "vitest";

import {
  clampDateTimePickerSize,
  DATE_TIME_PICKER_BODY_LAYOUT_CLASS,
  DATE_TIME_PICKER_CALENDAR_SCROLL_CLASS,
  DATE_TIME_PICKER_POPOVER_CONTENT_CLASS,
  DATE_TIME_PICKER_TIME_COLUMN_CLASS,
  DATE_TIME_PICKER_TIME_SCROLL_CLASS,
  DATE_TIME_PICKER_VIEWPORT_MARGIN_PX,
  POPOVER_VIEWPORT_MAX_HEIGHT_CLASS,
  POPOVER_VIEWPORT_MAX_WIDTH_CLASS,
  resolveDateTimePickerPlacement,
} from "./popover-positioning.js";

describe("popover positioning class helpers", () => {
  it("ties popover max-height and max-width to the viewport / Radix available space", () => {
    expect(POPOVER_VIEWPORT_MAX_HEIGHT_CLASS).toContain(
      "var(--radix-popover-content-available-height",
    );
    expect(POPOVER_VIEWPORT_MAX_WIDTH_CLASS).toContain("100vw");
    expect(DATE_TIME_PICKER_POPOVER_CONTENT_CLASS).toContain(POPOVER_VIEWPORT_MAX_HEIGHT_CLASS);
    expect(DATE_TIME_PICKER_POPOVER_CONTENT_CLASS).toContain(POPOVER_VIEWPORT_MAX_WIDTH_CLASS);
    expect(DATE_TIME_PICKER_POPOVER_CONTENT_CLASS).toContain("overflow-hidden");
    expect(DATE_TIME_PICKER_BODY_LAYOUT_CLASS).toContain("flex-col");
    expect(DATE_TIME_PICKER_BODY_LAYOUT_CLASS).toContain("overflow-y-auto");
    expect(DATE_TIME_PICKER_CALENDAR_SCROLL_CLASS).not.toContain("min-h-[12rem]");
    expect(DATE_TIME_PICKER_TIME_COLUMN_CLASS).not.toContain("h-[9rem]");
    expect(DATE_TIME_PICKER_TIME_COLUMN_CLASS).toContain("w-full");
    expect(DATE_TIME_PICKER_TIME_SCROLL_CLASS).toContain("h-40");
    expect(DATE_TIME_PICKER_TIME_SCROLL_CLASS).toContain("sm:h-full");
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

  it.each([
    {
      label: "center prefers the larger side and caps height",
      anchor: { top: 360, bottom: 396 },
      viewportHeight: 667,
      preferredHeight: 400,
      expectedSide: "top" as const,
    },
    {
      label: "near top opens below",
      anchor: { top: 24, bottom: 60 },
      viewportHeight: 667,
      preferredHeight: 400,
      expectedSide: "bottom" as const,
    },
    {
      label: "near bottom opens above",
      anchor: { top: 600, bottom: 636 },
      viewportHeight: 667,
      preferredHeight: 400,
      expectedSide: "top" as const,
    },
  ])("$label", ({ anchor, viewportHeight, preferredHeight, expectedSide }) => {
    const placement = resolveDateTimePickerPlacement(anchor, viewportHeight, preferredHeight);
    expect(placement.side).toBe(expectedSide);
    expect(placement.maxHeight).toBeLessThanOrEqual(placement.availableHeight);
    expect(placement.maxHeight).toBeLessThanOrEqual(preferredHeight);
    expect(placement.availableHeight).toBeGreaterThan(0);
  });
});
