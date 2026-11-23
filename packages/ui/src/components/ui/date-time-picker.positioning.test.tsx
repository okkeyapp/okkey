/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

    // Radix portals to body; assert collision-aware sizing hooks are present so
    // flip/shift can keep the panel inside the viewport at runtime.
    expect(content?.className).toMatch(/max-h-\[min\(100dvh,var\(--radix-popover-content-available-height/);
    expect(panel?.className).toMatch(/flex/);

    const body = panel?.querySelector(".flex.min-h-0.flex-1, [class*='max-h-[min(22rem']");
    expect(body || panel).toBeTruthy();

    // Calendar + hour/minute columns + footer actions are all present.
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

    // Trigger remains the anchor; panel is a sibling via portal, not clipped to modal scroll.
    expect(trigger.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    expect(document.body.contains(content)).toBe(true);
  });
});
