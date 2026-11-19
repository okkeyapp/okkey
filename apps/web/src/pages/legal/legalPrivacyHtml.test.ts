import { describe, expect, it } from "vitest";

import { selfHostedPrivacyHtmlEn } from "./content/selfHosted.en";
import { selfHostedPrivacyHtmlRu } from "./content/selfHosted.ru";
import { legalPrivacyHtmlForLocale } from "./legalPrivacyHtml";

describe("legalPrivacyHtmlForLocale", () => {
  it("returns locale-specific HTML for en and ru", () => {
    expect(legalPrivacyHtmlForLocale("en")).toBe(selfHostedPrivacyHtmlEn);
    expect(legalPrivacyHtmlForLocale("ru")).toBe(selfHostedPrivacyHtmlRu);
  });

  it("falls back to English for unknown locales", () => {
    expect(legalPrivacyHtmlForLocale("de")).toBe(selfHostedPrivacyHtmlEn);
    expect(legalPrivacyHtmlForLocale("xx")).toBe(selfHostedPrivacyHtmlEn);
  });
});
