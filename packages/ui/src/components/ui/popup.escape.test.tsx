/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPopupLayerStackForTests,
} from "../../lib/popup-layer.js";
import { POPUP_ANIMATION_MS, Popup } from "./popup.js";

describe("Popup Escape handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearPopupLayerStackForTests();
  });

  afterEach(() => {
    cleanup();
    clearPopupLayerStackForTests();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("closes on Escape and restores focus to the opener", () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    render(
      <Popup header="Settings" onClose={onClose} closeLabel="Close popup">
        <p>Body</p>
      </Popup>,
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });

    act(() => {
      vi.advanceTimersByTime(POPUP_ANIMATION_MS);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("does not close on Escape when closeOnEscape is false", () => {
    const onClose = vi.fn();
    render(
      <Popup header="Approve device" onClose={onClose} closeOnEscape={false} closeLabel="Close">
        <p>Forced</p>
      </Popup>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(POPUP_ANIMATION_MS);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("only closes the topmost popup when stacked", () => {
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();

    render(
      <>
        <Popup header="Outer" onClose={onCloseOuter} closeLabel="Close outer">
          <p>Outer body</p>
        </Popup>
        <Popup header="Inner" onClose={onCloseInner} closeLabel="Close inner" className="z-popup-nested">
          <p>Inner body</p>
        </Popup>
      </>,
    );

    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    fireEvent.keyDown(document, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(POPUP_ANIMATION_MS);
    });

    expect(onCloseInner).toHaveBeenCalledTimes(1);
    expect(onCloseOuter).not.toHaveBeenCalled();
  });

  it("does not close the popup when Escape is used by an open nested listbox", () => {
    const onClose = vi.fn();
    render(
      <Popup header="With select" onClose={onClose} closeLabel="Close">
        <p>Body</p>
      </Popup>,
    );

    const nested = document.createElement("div");
    nested.setAttribute("role", "listbox");
    nested.setAttribute("data-state", "open");
    document.body.appendChild(nested);

    fireEvent.keyDown(document, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(POPUP_ANIMATION_MS);
    });

    expect(onClose).not.toHaveBeenCalled();
    nested.remove();
  });
});
