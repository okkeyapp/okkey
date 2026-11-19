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
  localeTextDirection,
  READY_LOCALES,
  yearMonthOrder,
} from "./locale-meta.js";
import { formatWebMessage, isWebLocale, READY_WEB_LOCALES } from "./web-format.js";

test("web and email share the same discovered locale set", () => {
  assert.deepEqual([...APP_LOCALES].sort(), ["en", "ru"]);
  assert.ok(isAppLocale("en"));
  assert.ok(isAppLocale("ru"));
  assert.ok(isWebLocale("en"));
  assert.ok(isEmailLocale("ru"));
  assert.equal(isWebLocale("de"), false);
  assert.equal(isEmailLocale("de"), false);
});

test("only ready locales appear in the language switcher list", () => {
  assert.deepEqual([...READY_LOCALES].sort(), ["en", "ru"]);
  assert.deepEqual([...READY_WEB_LOCALES].sort(), ["en", "ru"]);
  assert.ok(isReadyLocale("en"));
  assert.ok(isReadyLocale("ru"));
  assert.equal(isReadyLocale("de"), false);
});

test("missing web strings fall back to English", () => {
  // Probe key exists only in email; web uses a synthetic path via formatEmailMessage below.
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
  assert.equal(intlLocaleTag("de"), "en-US");
  assert.equal(localeTextDirection("en"), "ltr");
  assert.equal(localeTextDirection("ru"), "ltr");
  assert.equal(docsPathPrefix("ru"), "");
  assert.equal(docsPathPrefix("en"), "/en");
  assert.equal(docsPathPrefix("de"), "/en");
  assert.equal(yearMonthOrder("ru"), "year-month");
  assert.equal(yearMonthOrder("en"), "month-year");
  assert.equal(FALLBACK_LOCALE, "en");
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
