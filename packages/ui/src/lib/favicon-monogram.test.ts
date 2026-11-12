import { describe, expect, it } from "vitest";

import {
  deriveFaviconMonogram,
  FAVICON_MONOGRAM_COLORS,
  faviconMonogramBackgroundColor,
} from "./favicon-monogram.js";

describe("deriveFaviconMonogram", () => {
  it("uses the first letter of each of the first two words", () => {
    expect(deriveFaviconMonogram("Git Hub")).toBe("GH");
    expect(deriveFaviconMonogram("  my bank  ")).toBe("MB");
  });

  it("uses the first two letters when the name is a single word", () => {
    expect(deriveFaviconMonogram("GitHub")).toBe("GI");
    expect(deriveFaviconMonogram("A")).toBe("A");
  });

  it("returns an empty string when the name has no letters", () => {
    expect(deriveFaviconMonogram("")).toBe("");
    expect(deriveFaviconMonogram("...")).toBe("");
  });
});

describe("faviconMonogramBackgroundColor", () => {
  it("picks a palette color for the letter tile", () => {
    const color = faviconMonogramBackgroundColor("GH");
    expect(FAVICON_MONOGRAM_COLORS).toContain(color);
    expect(faviconMonogramBackgroundColor("")).toBe(FAVICON_MONOGRAM_COLORS[0]);
  });
});
