import { describe, expect, it } from "vitest";

import { websiteUrlsLookupKey } from "./useItemFormFaviconPreview";

describe("websiteUrlsLookupKey", () => {
  it("is stable for equivalent URL lists", () => {
    expect(websiteUrlsLookupKey([" https://a.example ", "https://b.example"])).toBe(
      websiteUrlsLookupKey(["https://a.example", "https://b.example"]),
    );
  });

  it("changes when the URL list changes", () => {
    expect(websiteUrlsLookupKey(["https://a.example"])).not.toBe(
      websiteUrlsLookupKey(["https://a.example/path"]),
    );
  });
});
