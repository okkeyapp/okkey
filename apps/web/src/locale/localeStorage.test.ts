import { describe, expect, it } from "vitest";

import {
  LOCALE_QUERY_PARAM,
  readLocaleFromSearch,
  stripLocaleFromUrlSearch,
} from "./localeStorage";

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

describe("stripLocaleFromUrlSearch", () => {
  it("removes lng and keeps other params", () => {
    expect(stripLocaleFromUrlSearch(`?${LOCALE_QUERY_PARAM}=ru&popup=settings%7Cdevices`)).toBe(
      "?popup=settings%7Cdevices",
    );
    expect(stripLocaleFromUrlSearch(`?popup=settings&${LOCALE_QUERY_PARAM}=en`)).toBe(
      "?popup=settings",
    );
  });

  it("clears the query when lng was the only param", () => {
    expect(stripLocaleFromUrlSearch(`?${LOCALE_QUERY_PARAM}=ru`)).toBe("");
  });

  it("leaves search unchanged when lng is absent", () => {
    expect(stripLocaleFromUrlSearch("?popup=settings")).toBe("?popup=settings");
    expect(stripLocaleFromUrlSearch("")).toBe("");
  });
});
