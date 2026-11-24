import { describe, expect, it, vi } from "vitest";

import {
  detectLocaleFromLanguages,
  hrefWithoutLocaleQuery,
  LOCALE_QUERY_PARAM,
  LOCALE_STORAGE_KEY,
  readLocaleFromSearch,
  readStoredLocale,
  resolveInitialWebLocale,
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

describe("resolveInitialWebLocale", () => {
  it("uses a supported stored value over the browser list", () => {
    expect(resolveInitialWebLocale({ stored: "en", languages: ["ru-RU", "en-US"] })).toBe("en");
    expect(resolveInitialWebLocale({ stored: "ru", languages: ["en-GB"] })).toBe("ru");
  });

  it("maps ru-RU to ru when nothing is stored", () => {
    expect(resolveInitialWebLocale({ stored: null, languages: ["ru-RU", "en-US"] })).toBe("ru");
    expect(detectLocaleFromLanguages(["ru-RU"])).toBe("ru");
  });

  it("falls back to English when no language is supported", () => {
    expect(resolveInitialWebLocale({ stored: "de", languages: ["de-DE", "fr-FR"] })).toBe("en");
    expect(detectLocaleFromLanguages(["zh-Hans", "ja"])).toBe("en");
  });

  it("falls back to English when the language list is empty", () => {
    expect(resolveInitialWebLocale({ stored: null, languages: [] })).toBe("en");
    expect(resolveInitialWebLocale({ stored: undefined, languages: [""] })).toBe("en");
  });

  it("matches en-GB by primary subtag", () => {
    expect(detectLocaleFromLanguages(["en-GB"])).toBe("en");
  });
});

describe("readStoredLocale", () => {
  it("does not persist a browser-detected locale", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(navigator, "languages", { configurable: true, get: () => ["ru-RU"] });
    Object.defineProperty(navigator, "language", { configurable: true, get: () => "ru-RU" });

    expect(readStoredLocale()).toBe("ru");
    expect(store.has(LOCALE_STORAGE_KEY)).toBe(false);

    vi.unstubAllGlobals();
  });
});

describe("hrefWithoutLocaleQuery", () => {
  it("returns an absolute href with lng removed", () => {
    expect(hrefWithoutLocaleQuery("https://app.example/items?lng=ru&popup=settings")).toBe(
      "https://app.example/items?popup=settings",
    );
    expect(hrefWithoutLocaleQuery("https://app.example/items?popup=settings")).toBeNull();
  });

  it("keeps absolute href when path starts with //", () => {
    expect(
      hrefWithoutLocaleQuery("https://app.example//items?lng=ru&popup=settings%7Cdevices"),
    ).toBe("https://app.example//items?popup=settings%7Cdevices");
  });
});
