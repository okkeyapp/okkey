/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clampDateTimePickerSize,
  DATE_TIME_PICKER_BODY_LAYOUT_CLASS,
  DATE_TIME_PICKER_POPOVER_CONTENT_CLASS,
  DATE_TIME_PICKER_VIEWPORT_MARGIN_PX,
  POPOVER_VIEWPORT_MAX_WIDTH_CLASS,
  resolveDateTimePickerPlacement,
} from "../../lib/popover-positioning.js";
import { DateTimePicker } from "./date-time-picker.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const labels = {
  time: "Time",
  hour: "Hr",
  minute: "Min",
  today: "Today",
  done: "Done",
};

function mockRect(partial: {
  top: number;
  left: number;
  width: number;
  height: number;
}): DOMRect {
  const { top, left, width, height } = partial;
  return {
    x: left,
    y: top,
    top,
    left,
    width,
    height,
    bottom: top + height,
    right: left + width,
    toJSON() {
      return this;
    },
  };
}

function assertInsideViewport(rect: DOMRect, viewportWidth: number, viewportHeight: number) {
  expect(rect.top).toBeGreaterThanOrEqual(0);
  expect(rect.left).toBeGreaterThanOrEqual(0);
  expect(rect.bottom).toBeLessThanOrEqual(viewportHeight);
  expect(rect.right).toBeLessThanOrEqual(viewportWidth);
}

describe("DateTimePicker positioning", () => {
  it("opens adjacent to a near-bottom trigger and keeps the panel inside the viewport", () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 640 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });

    const value = new Date(2030, 0, 15, 14, 45, 0, 0);
    const onChange = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 1024,
          height: 640,
          overflow: "auto",
        }}
      >
        <div style={{ height: 520 }} />
        <DateTimePicker
          open
          onOpenChange={onOpenChange}
          value={value}
          onChange={onChange}
          onToday={() => undefined}
          onDone={() => undefined}
          labels={labels}
          trigger={
            <button type="button" aria-label="Select date and time" style={{ marginLeft: 800 }}>
              Calendar
            </button>
          }
        />
      </div>,
    );

    const trigger = screen.getByRole("button", { name: "Select date and time" });
    const panel = document.querySelector("[data-slot='date-time-picker-panel']");
    const content = document.querySelector("[data-slot='popover-content']");
    const body = document.querySelector("[data-slot='date-time-picker-body']");

    expect(panel).toBeTruthy();
    expect(content).toBeTruthy();
    expect(body?.className).toContain(DATE_TIME_PICKER_BODY_LAYOUT_CLASS.split(" ")[0]!);
    expect(body?.className).toMatch(/overflow-y-auto/);

    expect(content?.className).toContain(POPOVER_VIEWPORT_MAX_WIDTH_CLASS);
    expect(content?.className).toMatch(/max-h-\[min\(100dvh,var\(--radix-popover-content-available-height/);
    expect(panel?.className).toMatch(/flex/);

    expect(screen.getByRole("button", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.getByText("Hr")).toBeTruthy();
    expect(screen.getByText("Min")).toBeTruthy();

    const minuteColumn = screen.getByText("Min").parentElement?.parentElement;
    expect(minuteColumn).toBeTruthy();
    if (minuteColumn) {
      expect(within(minuteColumn).getByRole("button", { name: "45" })).toBeTruthy();
      fireEvent.click(within(minuteColumn).getByRole("button", { name: "46" }));
      expect(onChange).toHaveBeenCalled();
      const next = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as Date;
      expect(next.getMinutes()).toBe(46);
    }

    expect(trigger.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    expect(document.body.contains(content)).toBe(true);
  });

  it.each([
    { width: 375, height: 568, anchor: "center" as const },
    { width: 375, height: 667, anchor: "top" as const },
    { width: 375, height: 667, anchor: "center" as const },
    { width: 375, height: 667, anchor: "bottom" as const },
    { width: 375, height: 812, anchor: "center" as const },
    { width: 1280, height: 600, anchor: "center" as const },
    { width: 1280, height: 720, anchor: "bottom" as const },
  ])(
    "keeps popover + Done usable at $width x $height with $anchor anchor",
    ({ width, height, anchor }) => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: height });

      const value = new Date(2030, 0, 15, 14, 45, 0, 0);
      const onChange = vi.fn();
      const preferred = { width: 393, height: 400 };
      const anchorTop =
        anchor === "top" ? 24 : anchor === "bottom" ? height - 60 : Math.floor(height / 2) - 18;
      const anchorRect = { top: anchorTop, bottom: anchorTop + 36 };
      const placement = resolveDateTimePickerPlacement(anchorRect, height, preferred.height);
      const clamped = clampDateTimePickerSize(
        preferred.width,
        placement.maxHeight,
        width,
        height,
        DATE_TIME_PICKER_VIEWPORT_MARGIN_PX,
      );

      render(
        <DateTimePicker
          open
          onOpenChange={() => undefined}
          value={value}
          onChange={onChange}
          onToday={() => undefined}
          onDone={() => undefined}
          labels={labels}
          side={placement.side}
          trigger={
            <button type="button" aria-label="Select date and time">
              Calendar
            </button>
          }
        />,
      );

      const content = document.querySelector<HTMLElement>("[data-slot='popover-content']");
      const body = document.querySelector<HTMLElement>("[data-slot='date-time-picker-body']");
      const done = screen.getByRole("button", { name: "Done" });
      const calendar = document.querySelector<HTMLElement>("[data-slot='date-time-picker-calendar']");
      expect(content).toBeTruthy();
      expect(body?.className).toMatch(/overflow-y-auto/);
      expect(content?.className).toContain(DATE_TIME_PICKER_POPOVER_CONTENT_CLASS.split(" ")[0]!);
      expect(content?.className).toContain(POPOVER_VIEWPORT_MAX_WIDTH_CLASS);
      expect(calendar).toBeTruthy();
      expect(calendar?.className).not.toContain("min-h-[12rem]");
      expect(document.querySelector("[data-slot='date-time-picker-time']")?.className).not.toContain(
        "h-[9rem]",
      );

      const top =
        placement.side === "bottom"
          ? Math.min(anchorRect.bottom + 4, height - clamped.height - DATE_TIME_PICKER_VIEWPORT_MARGIN_PX)
          : Math.max(DATE_TIME_PICKER_VIEWPORT_MARGIN_PX, anchorRect.top - clamped.height - 4);
      const left = Math.max(DATE_TIME_PICKER_VIEWPORT_MARGIN_PX, (width - clamped.width) / 2);
      content!.getBoundingClientRect = () =>
        mockRect({ top, left, width: clamped.width, height: clamped.height });
      done.getBoundingClientRect = () =>
        mockRect({
          top: top + clamped.height - 44,
          left: left + clamped.width - 88,
          width: 72,
          height: 36,
        });

      const popoverRect = content!.getBoundingClientRect();
      const doneRect = done.getBoundingClientRect();
      assertInsideViewport(popoverRect, width, height);
      assertInsideViewport(doneRect, width, height);
      expect(doneRect.bottom).toBeLessThanOrEqual(popoverRect.bottom);
      expect(clamped.height).toBeLessThanOrEqual(placement.availableHeight);

      const dayButton = document.querySelector<HTMLElement>(
        "[data-slot='date-time-picker-calendar'] button",
      );
      expect(dayButton).toBeTruthy();
      fireEvent.click(dayButton!);

      const minuteColumn = screen.getByText("Min").parentElement?.parentElement;
      expect(minuteColumn).toBeTruthy();
      if (minuteColumn) {
        fireEvent.click(within(minuteColumn).getByRole("button", { name: "50" }));
        expect(onChange).toHaveBeenCalled();
      }
    },
  );
});
