/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";

import { scrollIntoNearestViewport } from "./scroll-into-nearest-viewport.js";

describe("scrollIntoNearestViewport", () => {
  it("scrolls only the nearest overflow container (not via scrollIntoView)", () => {
    const viewport = document.createElement("div");
    Object.defineProperties(viewport, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 600, configurable: true },
    });
    viewport.style.overflowY = "auto";
    viewport.scrollTop = 0;

    const item = document.createElement("button");
    Object.defineProperties(item, {
      offsetHeight: { value: 40 },
    });
    viewport.appendChild(item);
    document.body.appendChild(viewport);

    const scrollIntoView = vi.fn();
    item.scrollIntoView = scrollIntoView;

    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      bottom: 100,
      right: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    });
    vi.spyOn(item, "getBoundingClientRect").mockReturnValue({
      top: 220,
      left: 0,
      bottom: 260,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 220,
      toJSON() {
        return this;
      },
    });

    scrollIntoNearestViewport(item, { block: "center" });

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(viewport.scrollTop).toBeGreaterThan(0);
    expect(viewport.scrollTop).toBe(220 - (100 - 40) / 2);

    document.body.removeChild(viewport);
  });

  it("no-ops when the element is already fully visible with block=nearest", () => {
    const viewport = document.createElement("div");
    Object.defineProperties(viewport, {
      clientHeight: { value: 200 },
      scrollHeight: { value: 400, configurable: true },
    });
    viewport.style.overflowY = "scroll";
    viewport.scrollTop = 50;

    const item = document.createElement("button");
    Object.defineProperties(item, {
      offsetHeight: { value: 40 },
    });
    viewport.appendChild(item);
    document.body.appendChild(viewport);

    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      bottom: 200,
      right: 100,
      width: 100,
      height: 200,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    });
    vi.spyOn(item, "getBoundingClientRect").mockReturnValue({
      top: 60,
      left: 0,
      bottom: 100,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 60,
      toJSON() {
        return this;
      },
    });

    scrollIntoNearestViewport(item, { block: "nearest" });
    expect(viewport.scrollTop).toBe(50);

    document.body.removeChild(viewport);
  });
});
