import { describe, expect, it } from "vitest";

import { readPopupScrollEdges } from "./popup-scroll-shadow.js";

function createViewport(input: { scrollTop: number; scrollHeight: number; clientHeight: number }): HTMLElement {
  return {
    scrollTop: input.scrollTop,
    scrollHeight: input.scrollHeight,
    clientHeight: input.clientHeight,
  } as HTMLElement;
}

describe("readPopupScrollEdges", () => {
  it("returns inactive edges when content fits without scrolling", () => {
    expect(readPopupScrollEdges(createViewport({ scrollTop: 0, scrollHeight: 200, clientHeight: 200 }))).toEqual({
      fromTop: false,
      fromBottom: false,
    });
  });

  it("marks top edge when scrolled down", () => {
    expect(readPopupScrollEdges(createViewport({ scrollTop: 12, scrollHeight: 400, clientHeight: 200 }))).toEqual({
      fromTop: true,
      fromBottom: true,
    });
  });

  it("marks only bottom edge when scrolled to top of overflow content", () => {
    expect(readPopupScrollEdges(createViewport({ scrollTop: 0, scrollHeight: 400, clientHeight: 200 }))).toEqual({
      fromTop: false,
      fromBottom: true,
    });
  });

  it("marks only top edge when scrolled to bottom", () => {
    expect(readPopupScrollEdges(createViewport({ scrollTop: 200, scrollHeight: 400, clientHeight: 200 }))).toEqual({
      fromTop: true,
      fromBottom: false,
    });
  });
});
