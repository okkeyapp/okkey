/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { computeKeyFieldPortaledOverlayPosition } from "./key-field-portaled-overlay-position.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function rect(partial: Partial<DOMRect> & Pick<DOMRect, "top" | "left" | "width" | "height">): DOMRect {
  const top = partial.top;
  const left = partial.left;
  const width = partial.width;
  const height = partial.height;
  const bottom = partial.bottom ?? top + height;
  const right = partial.right ?? left + width;
  return {
    x: left,
    y: top,
    top,
    left,
    width,
    height,
    bottom,
    right,
    toJSON() {
      return this;
    },
  };
}

describe("computeKeyFieldPortaledOverlayPosition", () => {
  it("places the panel below the anchor when there is room", () => {
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("innerWidth", 1200);

    const result = computeKeyFieldPortaledOverlayPosition({
      anchorRect: rect({ top: 100, left: 40, width: 120, height: 36 }),
      panelRect: rect({ top: 0, left: 0, width: 280, height: 300 }),
    });

    expect(result.placement).toBe("bottom");
    expect(result.top).toBe(144);
    expect(result.left).toBe(40);
  });

  it("flips above the anchor when space below is insufficient", () => {
    vi.stubGlobal("innerHeight", 400);
    vi.stubGlobal("innerWidth", 1200);

    const result = computeKeyFieldPortaledOverlayPosition({
      anchorRect: rect({ top: 320, left: 40, width: 120, height: 36 }),
      panelRect: rect({ top: 0, left: 0, width: 280, height: 300 }),
    });

    expect(result.placement).toBe("top");
    expect(result.top).toBeGreaterThanOrEqual(8);
    expect(result.top + 300).toBeLessThanOrEqual(400 - 8 + 0.5);
  });

  it("clamps top so a tall panel stays inside the viewport near the bottom", () => {
    vi.stubGlobal("innerHeight", 500);
    vi.stubGlobal("innerWidth", 800);

    const result = computeKeyFieldPortaledOverlayPosition({
      anchorRect: rect({ top: 430, left: 20, width: 40, height: 36 }),
      panelRect: rect({ top: 0, left: 0, width: 320, height: 360 }),
    });

    expect(result.top).toBeGreaterThanOrEqual(8);
    expect(result.top + Math.min(360, 500 - 16)).toBeLessThanOrEqual(500 - 8 + 0.5);
    expect(result.left).toBeGreaterThanOrEqual(8);
  });

  it("shifts horizontally when the panel would overflow the right edge", () => {
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("innerWidth", 400);

    const result = computeKeyFieldPortaledOverlayPosition({
      anchorRect: rect({ top: 100, left: 300, width: 40, height: 36 }),
      panelRect: rect({ top: 0, left: 0, width: 280, height: 200 }),
    });

    expect(result.left).toBe(400 - 280 - 8);
  });
});
