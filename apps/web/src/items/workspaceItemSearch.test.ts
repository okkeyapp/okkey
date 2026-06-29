import { describe, expect, it } from "vitest";

import {
  formatTagSearchQuery,
  itemRecordMatchesTagSearch,
  parseTagSearchNeedle,
  scoreItemsListRecordSearch,
} from "./workspaceItemSearch";

describe("workspaceItemSearch", () => {
  const row = {
    title: "GitHub",
    urls: ["https://github.com"],
    tags: ["первый", "Work"],
  };

  it("formatTagSearchQuery prefixes hash", () => {
    expect(formatTagSearchQuery("второй")).toBe("#второй");
  });

  it("parseTagSearchNeedle extracts tag after hash", () => {
    expect(parseTagSearchNeedle("#первый")).toBe("первый");
    expect(parseTagSearchNeedle("  #первый  ")).toBe("первый");
    expect(parseTagSearchNeedle("github")).toBeNull();
    expect(parseTagSearchNeedle("#")).toBeNull();
  });

  it("itemRecordMatchesTagSearch is case-insensitive", () => {
    expect(itemRecordMatchesTagSearch(["первый", "Work"], "Первый")).toBe(true);
    expect(itemRecordMatchesTagSearch(["первый", "Work"], "work")).toBe(true);
    expect(itemRecordMatchesTagSearch(["первый", "Work"], "второй")).toBe(false);
  });

  it("scoreItemsListRecordSearch matches tags only for hash queries", () => {
    expect(scoreItemsListRecordSearch(row, "#первый")).toBe(10);
    expect(scoreItemsListRecordSearch(row, "#ПЕРВЫЙ")).toBe(10);
    expect(scoreItemsListRecordSearch(row, "#второй")).toBe(0);
    expect(scoreItemsListRecordSearch(row, "#GitHub")).toBe(0);
  });

  it("scoreItemsListRecordSearch keeps title/url matching without hash", () => {
    expect(scoreItemsListRecordSearch(row, "github")).toBeGreaterThan(0);
    expect(scoreItemsListRecordSearch(row, "первый")).toBe(0);
  });
});
