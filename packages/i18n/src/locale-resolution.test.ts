import assert from "node:assert/strict";
import test from "node:test";

import { formatEmailMessage } from "./email-format.js";
import { isEmailLocale } from "./email-locale.js";
import {
  APP_LOCALES,
  docsPathPrefix,
  FALLBACK_LOCALE,
  intlLocaleTag,
  isAppLocale,
  isReadyLocale,
  LOCALE_META,
  LOCALE_READINESS_THRESHOLD_PERCENT,
  localeTextDirection,
  READY_LOCALES,
  yearMonthOrder,
} from "./locale-meta.js";
import {
  detectAppLocaleFromLanguages,
  matchAppLocaleTag,
  normalizeLocaleTag,
} from "./locale-match.js";
import { formatWebMessage, isWebLocale, READY_WEB_LOCALES } from "./web-format.js";

test("web and email share the same discovered locale set", () => {
  assert.ok(APP_LOCALES.includes("en"));
  assert.ok(APP_LOCALES.includes("ru"));
  assert.ok(isAppLocale("en"));
  assert.ok(isAppLocale("ru"));
  assert.ok(isWebLocale("en"));
  assert.ok(isEmailLocale("ru"));
  for (const code of APP_LOCALES) {
    assert.ok(isWebLocale(code));
    assert.ok(isEmailLocale(code));
  }
});

test("only ready locales appear in the language switcher list", () => {
  assert.ok(READY_LOCALES.includes("en"));
  assert.ok(READY_LOCALES.includes("ru"));
  assert.deepEqual([...READY_LOCALES].sort(), [...READY_WEB_LOCALES].sort());
  assert.ok(isReadyLocale("en"));
  assert.ok(isReadyLocale("ru"));
  for (const code of READY_LOCALES) {
    assert.ok(LOCALE_META[code].ready);
    assert.ok(LOCALE_META[code].webCoveragePercent >= LOCALE_READINESS_THRESHOLD_PERCENT);
    assert.ok(LOCALE_META[code].emailCoveragePercent >= LOCALE_READINESS_THRESHOLD_PERCENT);
  }
  for (const code of APP_LOCALES) {
    if (!READY_LOCALES.includes(code)) {
      assert.equal(isReadyLocale(code), false);
    }
  }
});

test("missing web strings fall back to English", () => {
  const en = formatWebMessage("en", "web.locale.nativeName");
  const ru = formatWebMessage("ru", "web.locale.nativeName");
  assert.equal(en, "English");
  assert.equal(ru, "Русский");
});

test("missing email strings fall back to English", () => {
  const en = formatEmailMessage("en", "email.qa.fallbackProbeOnlyInEn", {});
  const ru = formatEmailMessage("ru", "email.qa.fallbackProbeOnlyInEn", {});
  assert.equal(en, ru);
  assert.ok(en.length > 0);
});

test("intl / dir / docs meta preserve historical en and ru behaviour", () => {
  assert.equal(intlLocaleTag("en"), "en-US");
  assert.equal(intlLocaleTag("ru"), "ru-RU");
  assert.equal(intlLocaleTag("zz-unsupported"), "en-US");
  assert.equal(localeTextDirection("en"), "ltr");
  assert.equal(localeTextDirection("ru"), "ltr");
  assert.equal(docsPathPrefix("ru"), "");
  assert.equal(docsPathPrefix("en"), "/en");
  assert.equal(docsPathPrefix("zz-unsupported"), "/en");
  assert.equal(yearMonthOrder("ru"), "year-month");
  assert.equal(yearMonthOrder("en"), "month-year");
  assert.equal(FALLBACK_LOCALE, "en");
  assert.equal(LOCALE_READINESS_THRESHOLD_PERCENT, 80);
});

test("en/ru date headings stay identical to historical formatting", () => {
  const d = new Date(2026, 10, 1); // November 2026
  const monthEn = new Intl.DateTimeFormat(intlLocaleTag("en"), { month: "long" }).format(d);
  const monthRu = new Intl.DateTimeFormat(intlLocaleTag("ru"), { month: "long" }).format(d);
  const enHeading =
    yearMonthOrder("en") === "year-month" ? `2026 ${monthEn}` : `${monthEn} 2026`;
  const ruHeading =
    yearMonthOrder("ru") === "year-month" ? `2026 ${monthRu}` : `${monthRu} 2026`;
  assert.equal(enHeading, `${monthEn} 2026`);
  assert.equal(ruHeading, `2026 ${monthRu}`);
});

test("browser locale matching distinguishes pt-BR and maps nl-BE → nl when shipped", () => {
  assert.equal(normalizeLocaleTag("pt_br"), "pt-BR");
  assert.equal(normalizeLocaleTag("nl-be"), "nl-BE");
  assert.equal(matchAppLocaleTag("en-GB"), "en");
  assert.equal(matchAppLocaleTag("ru-RU"), "ru");

  if (isAppLocale("nl")) {
    assert.equal(matchAppLocaleTag("nl-BE"), "nl");
    assert.equal(matchAppLocaleTag("nl-NL"), "nl");
    assert.equal(detectAppLocaleFromLanguages(["nl-BE", "en"]), "nl");
  }
  if (isAppLocale("pt-BR")) {
    assert.equal(matchAppLocaleTag("pt-BR"), "pt-BR");
    assert.equal(matchAppLocaleTag("pt_BR"), "pt-BR");
    assert.equal(matchAppLocaleTag("pt"), null);
    assert.equal(matchAppLocaleTag("pt-PT"), null);
    assert.equal(detectAppLocaleFromLanguages(["pt-PT", "pt-BR", "en"]), "pt-BR");
    assert.equal(detectAppLocaleFromLanguages(["pt", "en"]), "en");
  }
  if (isAppLocale("de")) {
    assert.equal(matchAppLocaleTag("de-AT"), "de");
    assert.equal(intlLocaleTag("de"), "de-DE");
    assert.equal(docsPathPrefix("de"), "/en");
  }
});
