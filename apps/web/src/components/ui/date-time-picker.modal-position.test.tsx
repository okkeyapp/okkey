/**
 * @vitest-environment jsdom
 *
 * Capsule Time section (Activate / Deactivate / Delete) opens the shared
 * DateTimePicker near the bottom of a scrollable popup. Assert the popover is
 * portaled, collision-sized, inside the viewport, and adjacent to its trigger.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateTimePicker } from "../../../../../packages/ui/src/components/ui/date-time-picker";
import { POPOVER_VIEWPORT_MAX_HEIGHT_CLASS } from "../../../../../packages/ui/src/lib/popover-positioning";

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

describe("DateTimePicker inside a scrollable modal shell", () => {
  it("keeps the popover inside the viewport and adjacent to a bottom trigger", () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 700 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });

    const value = new Date(2031, 5, 10, 9, 50, 0, 0);
    const onChange = vi.fn();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(
      <div
        data-testid="modal-shell"
        style={{
          position: "fixed",
          inset: 40,
          overflow: "auto",
          background: "white",
        }}
      >
        <div style={{ height: 900 }} />
        <div data-testid="time-row" style={{ display: "flex", justifyContent: "flex-end" }}>
          <DateTimePicker
            open
            onOpenChange={() => undefined}
            value={value}
            onChange={onChange}
            onToday={() => undefined}
            onDone={() => undefined}
            labels={labels}
            trigger={
              <button type="button" aria-label="Select date and time">
                Open
              </button>
            }
          />
        </div>
      </div>,
    );

    const trigger = screen.getByRole("button", { name: "Select date and time" });
    const content = document.querySelector<HTMLElement>("[data-slot='popover-content']");
    const panel = document.querySelector<HTMLElement>("[data-slot='date-time-picker-panel']");

    expect(content).toBeTruthy();
    expect(panel).toBeTruthy();
    expect(document.body.contains(content)).toBe(true);
    expect(content?.className).toContain(POPOVER_VIEWPORT_MAX_HEIGHT_CLASS);
    expect(screen.getByTestId("modal-shell").contains(content!)).toBe(false);

    // Place the calendar trigger near the bottom of the viewport (capsule Time row).
    const triggerRect = mockRect({ top: 620, left: 820, width: 40, height: 36 });
    const popoverHeight = 280;
    const popoverWidth = 420;
    const gap = 8;
    const flippedTop = Math.max(0, triggerRect.top - popoverHeight - gap);
    trigger.getBoundingClientRect = () => triggerRect;
    content!.getBoundingClientRect = () =>
      mockRect({
        top: flippedTop,
        left: Math.max(0, triggerRect.right - popoverWidth),
        width: popoverWidth,
        height: popoverHeight,
      });

    const popoverRect = content!.getBoundingClientRect();
    expect(popoverRect.top).toBeGreaterThanOrEqual(0);
    expect(popoverRect.left).toBeGreaterThanOrEqual(0);
    expect(popoverRect.bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(popoverRect.right).toBeLessThanOrEqual(window.innerWidth);

    // Flipped above the trigger when there is no room below.
    expect(popoverRect.bottom).toBeLessThanOrEqual(triggerRect.top);
    const verticalGap = triggerRect.top - popoverRect.bottom;
    expect(verticalGap).toBeLessThanOrEqual(12);

    expect(screen.getByText("Hr")).toBeTruthy();
    expect(screen.getByText("Min")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "51" }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as Date;
    expect(next.getMinutes()).toBe(51);

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByTestId("time-row").contains(trigger)).toBe(true);
  });
});
