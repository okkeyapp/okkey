/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearPopupLayerStackForTests,
  getPopupLayerStackSizeForTests,
  pageHasOpenNestedDismissLayer,
  registerPopupLayer,
} from "./popup-layer.js";

describe("popup-layer stack", () => {
  afterEach(() => {
    clearPopupLayerStackForTests();
    vi.restoreAllMocks();
  });

  it("registers and unregisters layers in LIFO order", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = registerPopupLayer({ id: Symbol("a"), onEscape: first });
    const unregisterSecond = registerPopupLayer({ id: Symbol("b"), onEscape: second });

    expect(getPopupLayerStackSizeForTests()).toBe(2);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();

    unregisterSecond();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unregisterFirst();
    expect(getPopupLayerStackSizeForTests()).toBe(0);
  });

  it("does not dismiss the popup layer while a nested dismiss surface is open", () => {
    const onEscape = vi.fn();
    registerPopupLayer({ id: Symbol("popup"), onEscape });

    const nested = document.createElement("div");
    nested.setAttribute("role", "listbox");
    nested.setAttribute("data-state", "open");
    document.body.appendChild(nested);

    expect(pageHasOpenNestedDismissLayer()).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onEscape).not.toHaveBeenCalled();

    nested.remove();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape when the event is already defaultPrevented", () => {
    const onEscape = vi.fn();
    registerPopupLayer({ id: Symbol("popup"), onEscape });

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    Object.defineProperty(event, "defaultPrevented", { get: () => true });
    document.dispatchEvent(event);

    expect(onEscape).not.toHaveBeenCalled();
  });
});
