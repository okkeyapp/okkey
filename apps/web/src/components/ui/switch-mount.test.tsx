import { act, fireEvent, render, screen } from "@testing-library/react";
import { Switch } from "@okkey/ui";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

function renderWithQueuedFrames(ui: ReactElement) {
  const frames: FrameRequestCallback[] = [];
  const spy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const view = render(ui);
  return {
    ...view,
    flushFrames() {
      act(() => {
        const queued = frames.splice(0, frames.length);
        for (const callback of queued) {
          callback(0);
        }
      });
    },
    restore() {
      spy.mockRestore();
    },
  };
}

function thumbOf(root: HTMLElement): HTMLElement {
  const thumb = root.querySelector("span");
  if (!(thumb instanceof HTMLElement)) {
    throw new Error("switch thumb was not rendered");
  }
  return thumb;
}

describe("Switch mount motion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("paints the current checked state before the thumb transition is enabled", () => {
    const view = renderWithQueuedFrames(
      <Switch checked aria-label="PIN code" onCheckedChange={() => {}} />,
    );
    const root = screen.getByRole("switch", { name: "PIN code" });
    const thumb = thumbOf(root);

    expect(root).toHaveAttribute("data-state", "checked");
    expect(thumb).toHaveAttribute("data-state", "checked");
    expect(root.className).toContain("transition-none");
    expect(thumb.className).toContain("transition-none");
    expect(thumb.className).not.toContain("transition-transform");

    view.flushFrames();

    expect(root).toHaveAttribute("data-state", "checked");
    expect(thumb).toHaveAttribute("data-state", "checked");
    expect(thumb.className).toContain("transition-transform");
    expect(thumb.className).not.toContain("transition-none");
    expect(root.className).not.toContain("transition-none");
  });

  it("keeps the transition when the user changes the switch", () => {
    function Harness() {
      const [checked, setChecked] = useState(true);
      return (
        <Switch
          checked={checked}
          aria-label="Vault lock"
          onCheckedChange={setChecked}
        />
      );
    }

    render(<Harness />);
    const root = screen.getByRole("switch", { name: "Vault lock" });
    expect(root).toHaveAttribute("data-state", "checked");
    expect(thumbOf(root).className).toContain("transition-none");

    fireEvent.pointerDown(root);
    fireEvent.click(root);

    expect(root).toHaveAttribute("data-state", "unchecked");
    expect(thumbOf(root)).toHaveAttribute("data-state", "unchecked");
    expect(thumbOf(root).className).toContain("transition-transform");
    expect(thumbOf(root).className).not.toContain("transition-none");
  });
});
