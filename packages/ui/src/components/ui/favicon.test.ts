import { describe, expect, it } from "vitest";

import { deriveFaviconMonogram } from "./favicon.js";

describe("deriveFaviconMonogram", () => {
  it("uses the first letters of the first two words (QA favicon tile)", () => {
    expect(deriveFaviconMonogram("Git Hub")).toBe("GH");
    expect(deriveFaviconMonogram("  okkey vault item ")).toBe("OV");
  });

  it("uses the first two letters of a single word (QA favicon tile)", () => {
    expect(deriveFaviconMonogram("Okkey")).toBe("OK");
    expect(deriveFaviconMonogram("A")).toBe("A");
  });

  it("returns an empty monogram for an empty name (QA favicon tile)", () => {
    expect(deriveFaviconMonogram("")).toBe("");
    expect(deriveFaviconMonogram("   ")).toBe("");
    expect(deriveFaviconMonogram(undefined)).toBe("");
  });
});
