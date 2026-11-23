/**
 * @vitest-environment jsdom
 *
 * Capsule Time section (and other modal-hosted pickers) open near the bottom of a
 * scrollable popup. This test locks the shared DateTimePicker collision classes and
 * that the panel stays portaled to document.body (not trapped in the modal scroll).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateTimePicker } from "../../../../../packages/ui/src/components/ui/date-time-picker";
import { POPOVER_VIEWPORT_MAX_HEIGHT_CLASS } from "../../../../../packages/ui/src/lib/popover-positioning";

afterEach(() => {
  cleanup();
});

const labels = {
  time: "Time",
  hour: "Hr",
  minute: "Min",
  today: "Today",
  done: "Done",
};

describe("DateTimePicker inside a scrollable modal shell", () => {
  it("portals next to a bottom trigger and keeps calendar + time columns selectable", () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 700 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });

    const value = new Date(2031, 5, 10, 9, 50, 0, 0);
    const onChange = vi.fn();

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
    const panel = document.querySelector("[data-slot='date-time-picker-panel']");

    expect(content).toBeTruthy();
    expect(panel).toBeTruthy();
    expect(document.body.contains(content)).toBe(true);
    expect(content?.className).toContain(POPOVER_VIEWPORT_MAX_HEIGHT_CLASS.split(" ")[0] ?? "max-h-");

    // Not a descendant of the modal scroll shell (portaled).
    expect(screen.getByTestId("modal-shell").contains(content)).toBe(false);

    expect(screen.getByText("Hr")).toBeTruthy();
    expect(screen.getByText("Min")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "51" }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as Date;
    expect(next.getMinutes()).toBe(51);

    // Trigger stays in the modal; popover is adjacent via portal anchoring.
    expect(screen.getByTestId("time-row").contains(trigger)).toBe(true);
  });
});
