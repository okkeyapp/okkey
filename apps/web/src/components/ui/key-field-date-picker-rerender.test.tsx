import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";

import { KeyFieldDatePickerPanel } from "../../../../../packages/ui/src/components/ui/key-field-date-picker-panel";
import { KeyFieldPortaledOverlay } from "../../../../../packages/ui/src/components/ui/key-field-portaled-overlay";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function TickingHost({ intervalMs = 200 }: { intervalMs?: number }) {
  const [tick, setTick] = useState(0);
  const anchorRef = { current: null as HTMLDivElement | null };

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return (
    <div>
      <div ref={(node) => {
        anchorRef.current = node;
      }}>
        tick:{tick}
      </div>
      <KeyFieldPortaledOverlay open anchorRef={anchorRef}>
        <KeyFieldDatePickerPanel value="15.03.1990" onValueChange={() => undefined} />
      </KeyFieldPortaledOverlay>
    </div>
  );
}

describe("KeyFieldDatePickerPanel month menu vs parent re-render tick", () => {
  it("keeps month listbox open across >4s of parent 1Hz-style re-renders", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<TickingHost intervalMs={200} />);

    const monthTrigger = await screen.findByRole("combobox", { name: "Choose the month" });
    fireEvent.click(monthTrigger);

    await waitFor(() => {
      expect(screen.getByRole("listbox", { name: "Choose the month" })).toBeTruthy();
    });

    const panel = document.querySelector("[data-key-field-date-picker-panel]");
    expect(panel).toBeTruthy();
    panel?.setAttribute("data-proof-marker", "stable");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });

    expect(document.querySelector('[data-proof-marker="stable"]')).toBeTruthy();
    expect(screen.getByRole("listbox", { name: "Choose the month" })).toBeTruthy();
    expect(monthTrigger.getAttribute("aria-expanded")).toBe("true");
  });
});
