# @okkey/i18n

Shared ICU MessageFormat bundles. Email copy for Core lives in `locales/email/en.json` and `locales/email/ru.json` under keys `email.*`.

## API

- `formatEmailMessage(locale, key, values)` — format one message; falls back to English if a key is missing in the requested locale.
- `EmailLocale` — `"en" | "ru"`.

## Build

`yarn build` (or `yarn build:i18n` from the `okkey` repo root).
