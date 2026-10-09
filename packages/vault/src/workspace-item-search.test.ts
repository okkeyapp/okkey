import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatTagSearchQuery,
  itemRecordMatchesTagSearch,
  parseTagSearchNeedle,
  scoreItemsListRecordSearch,
} from "./workspace-item-search.ts";
import { itemHasUrlMatchingTab, itemUrlFieldsMatchTab, itemUrlMatchesTab, itemUrlsMatchTab } from "./item-url-match.ts";

describe("workspaceItemSearch", () => {
  const row = {
    title: "GitHub",
    urls: ["https://github.com"],
    tags: ["первый", "Work"],
  };

  it("formatTagSearchQuery prefixes hash", () => {
    assert.equal(formatTagSearchQuery("второй"), "#второй");
  });

  it("parseTagSearchNeedle extracts tag after hash", () => {
    assert.equal(parseTagSearchNeedle("#первый"), "первый");
    assert.equal(parseTagSearchNeedle("  #первый  "), "первый");
    assert.equal(parseTagSearchNeedle("github"), null);
    assert.equal(parseTagSearchNeedle("#"), null);
  });

  it("itemRecordMatchesTagSearch is case-insensitive", () => {
    assert.equal(itemRecordMatchesTagSearch(["первый", "Work"], "Первый"), true);
    assert.equal(itemRecordMatchesTagSearch(["первый", "Work"], "work"), true);
    assert.equal(itemRecordMatchesTagSearch(["первый", "Work"], "второй"), false);
  });

  it("scoreItemsListRecordSearch matches tags only for hash queries", () => {
    assert.equal(scoreItemsListRecordSearch(row, "#первый"), 10);
    assert.equal(scoreItemsListRecordSearch(row, "#ПЕРВЫЙ"), 10);
    assert.equal(scoreItemsListRecordSearch(row, "#второй"), 0);
    assert.equal(scoreItemsListRecordSearch(row, "#GitHub"), 0);
  });

  it("scoreItemsListRecordSearch keeps title/url matching without hash", () => {
    assert.ok(scoreItemsListRecordSearch(row, "github") > 0);
    assert.equal(scoreItemsListRecordSearch(row, "первый"), 0);
  });
});

describe("itemUrlMatch", () => {
  it("entire-site matches host ignoring www", () => {
    assert.equal(
      itemUrlMatchesTab("https://www.github.com/login", "https://github.com", "entire-site"),
      true,
    );
    assert.equal(
      itemUrlMatchesTab("https://evil.example/login", "https://github.com", "entire-site"),
      false,
    );
  });

  it("exact-url matches origin+pathname only", () => {
    assert.equal(
      itemUrlMatchesTab(
        "https://github.com/login?x=1",
        "https://github.com/login",
        "exact-url",
      ),
      true,
    );
    assert.equal(
      itemUrlMatchesTab(
        "https://github.com/settings",
        "https://github.com/login",
        "exact-url",
      ),
      false,
    );
  });

  it("itemUrlsMatchTab is true when no tab/urls", () => {
    assert.equal(itemUrlsMatchTab(null, ["https://a.com"]), true);
    assert.equal(itemUrlsMatchTab("https://a.com", []), true);
  });

  it("itemHasUrlMatchingTab is strict and accepts bare hosts", () => {
    assert.equal(itemHasUrlMatchingTab(null, ["https://a.com"]), false);
    assert.equal(itemHasUrlMatchingTab("https://a.com", []), false);
    assert.equal(itemHasUrlMatchingTab("https://github.com/login", ["github.com"]), true);
    assert.equal(itemHasUrlMatchingTab("https://evil.example", ["github.com"]), false);
  });

  it("none never matches", () => {
    assert.equal(
      itemUrlMatchesTab("https://github.com/login", "https://github.com/login", "none"),
      false,
    );
  });

  it("itemUrlFieldsMatchTab uses per-field scope", () => {
    assert.equal(
      itemUrlFieldsMatchTab("https://github.com/settings", [
        { url: "https://github.com/login", urlAutofillScope: "exact-url" },
        { url: "https://github.com", urlAutofillScope: "entire-site" },
      ]),
      true,
    );
    assert.equal(
      itemUrlFieldsMatchTab("https://github.com/settings", [
        { url: "https://github.com/login", urlAutofillScope: "exact-url" },
        { url: "https://github.com", urlAutofillScope: "none" },
      ]),
      false,
    );
  });
});
