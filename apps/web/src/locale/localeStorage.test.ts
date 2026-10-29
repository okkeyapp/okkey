import { describe, expect, it } from "vitest";

import { LOCALE_QUERY_PARAM, readLocaleFromSearch } from "./localeStorage";

describe("readLocaleFromSearch", () => {
  it("reads a supported lng query value", () => {
    expect(readLocaleFromSearch(`?${LOCALE_QUERY_PARAM}=ru`)).toBe("ru");
    expect(readLocaleFromSearch(`${LOCALE_QUERY_PARAM}=en&popup=settings`)).toBe("en");
  });

  it("ignores missing or unsupported values", () => {
    expect(readLocaleFromSearch("")).toBeNull();
    expect(readLocaleFromSearch("?foo=bar")).toBeNull();
    expect(readLocaleFromSearch(`?${LOCALE_QUERY_PARAM}=de`)).toBeNull();
  });
});
