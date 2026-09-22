import { describe, expect, it } from "vitest";

import { windowListSections } from "./windowListSections";

describe("windowListSections", () => {
  it("returns empty when visibleCount is 0", () => {
    expect(
      windowListSections([{ key: "a", rows: [{ id: "1" }, { id: "2" }] }], 0),
    ).toEqual([]);
  });

  it("keeps full early sections and truncates the last visible section", () => {
    const sections = [
      { key: "A", rows: [{ id: "1" }, { id: "2" }] },
      { key: "B", rows: [{ id: "3" }, { id: "4" }, { id: "5" }] },
      { key: "C", rows: [{ id: "6" }] },
    ];
    expect(windowListSections(sections, 4)).toEqual([
      { key: "A", rows: [{ id: "1" }, { id: "2" }] },
      { key: "B", rows: [{ id: "3" }, { id: "4" }] },
    ]);
  });

  it("returns all sections when visibleCount covers every row", () => {
    const sections = [
      { key: "A", rows: [{ id: "1" }] },
      { key: "B", rows: [{ id: "2" }] },
    ];
    expect(windowListSections(sections, 10)).toEqual(sections);
  });
});
