/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clampDateTimePickerSize,
  DATE_TIME_PICKER_POPOVER_CONTENT_CLASS,
  DATE_TIME_PICKER_VIEWPORT_MARGIN_PX,
  POPOVER_VIEWPORT_MAX_WIDTH_CLASS,
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

    expect(panel).toBeTruthy();
    expect(content).toBeTruthy();

    expect(content?.className).toContain(POPOVER_VIEWPORT_MAX_WIDTH_CLASS);
    expect(content?.className).toMatch(/max-h-\[min\(100dvh,var\(--radix-popover-content-available-height/);
    expect(panel?.className).toMatch(/flex/);
    expect(document.querySelector("[data-slot='date-time-picker-calendar']")?.className).toMatch(
      /overflow-y-auto/,
    );

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
    { width: 375, height: 667, label: "phone-667" },
    { width: 375, height: 812, label: "phone-812" },
    { width: 1280, height: 720, label: "laptop" },
  ])(
    "keeps popover bbox and Done inside the $label viewport ($width x $height)",
    ({ width, height }) => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: height });

      const value = new Date(2030, 0, 15, 14, 45, 0, 0);
      const preferred = { width: 393, height: 400 };
      const clamped = clampDateTimePickerSize(
        preferred.width,
        preferred.height,
        width,
        height,
        DATE_TIME_PICKER_VIEWPORT_MARGIN_PX,
      );

      render(
        <DateTimePicker
          open
          onOpenChange={() => undefined}
          value={value}
          onChange={() => undefined}
          onToday={() => undefined}
          onDone={() => undefined}
          labels={labels}
          trigger={
            <button type="button" aria-label="Select date and time">
              Calendar
            </button>
          }
        />,
      );

      const content = document.querySelector<HTMLElement>("[data-slot='popover-content']");
      const done = screen.getByRole("button", { name: "Done" });
      const calendar = document.querySelector<HTMLElement>("[data-slot='date-time-picker-calendar']");
      const timeColumn = document.querySelector<HTMLElement>("[data-slot='date-time-picker-time']");
      expect(content).toBeTruthy();
      expect(content?.className).toContain(DATE_TIME_PICKER_POPOVER_CONTENT_CLASS.split(" ")[0]!);
      expect(content?.className).toContain(POPOVER_VIEWPORT_MAX_WIDTH_CLASS);
      expect(content?.className).toMatch(/max-h-\[min\(100dvh/);
      expect(calendar).toBeTruthy();
      expect(calendar?.className).toContain("min-h-[12rem]");
      expect(timeColumn?.className).toContain("h-[9rem]");
      expect(timeColumn?.className).toContain("overflow-hidden");
      expect(document.querySelector("[data-slot='date-time-picker-footer']")).toBeTruthy();

      const top = Math.max(DATE_TIME_PICKER_VIEWPORT_MARGIN_PX, height - clamped.height - 40);
      const left = Math.max(DATE_TIME_PICKER_VIEWPORT_MARGIN_PX, (width - clamped.width) / 2);
      const calendarHeight = Math.max(192, clamped.height - 152);
      content!.getBoundingClientRect = () =>
        mockRect({ top, left, width: clamped.width, height: clamped.height });
      calendar!.getBoundingClientRect = () =>
        mockRect({ top: top + 8, left: left + 8, width: clamped.width - 16, height: calendarHeight });
      done.getBoundingClientRect = () =>
        mockRect({
          top: top + clamped.height - 44,
          left: left + clamped.width - 88,
          width: 72,
          height: 36,
        });

      const popoverRect = content!.getBoundingClientRect();
      const calendarRect = calendar!.getBoundingClientRect();
      const doneRect = done.getBoundingClientRect();
      assertInsideViewport(popoverRect, width, height);
      assertInsideViewport(doneRect, width, height);
      expect(calendarRect.height).toBeGreaterThan(0);
      expect(doneRect.right).toBeLessThanOrEqual(popoverRect.right);
      expect(doneRect.bottom).toBeLessThanOrEqual(popoverRect.bottom);
      expect(doneRect.width).toBeGreaterThan(0);
      expect(clamped.width).toBeLessThanOrEqual(width - DATE_TIME_PICKER_VIEWPORT_MARGIN_PX * 2);
      expect(clamped.height).toBeLessThanOrEqual(height - DATE_TIME_PICKER_VIEWPORT_MARGIN_PX * 2);

      if (width <= 375) {
        const dayButton = document.querySelector<HTMLElement>(
          "[data-slot='date-time-picker-calendar'] button",
        );
        expect(dayButton).toBeTruthy();
        dayButton!.getBoundingClientRect = () =>
          mockRect({
            top: top + 48,
            left: left + 24,
            width: 32,
            height: 32,
          });
        expect(dayButton!.getBoundingClientRect().height).toBeGreaterThan(0);
        expect(dayButton!.getBoundingClientRect().width).toBeGreaterThan(0);
        fireEvent.click(dayButton!);
      }
    },
  );
});
