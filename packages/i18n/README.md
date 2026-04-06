# @okkey/i18n

Shared ICU MessageFormat bundles.

- **Email:** `locales/email/{en,ru}.json` — keys `email.*`
- **Web UI:** `locales/web/{en,ru}.json` — keys `web.*`, `auth.*`, `unlock.*`, `workspaces.*`, `plan.*` (`plan.free`, `plan.premium`, `plan.family`, `plan.team`, `plan.enterprise`, `plan.personal`)

Available web locales are derived from `locales/web/*.json` at build time (`scripts/gen-web-bundles.mjs` → `src/web-bundles.gen.ts`).

## API

- `formatEmailMessage(locale, key, values)` — email copy; falls back to English if a key is missing.
- `formatWebMessage(locale, key, values)` — web UI copy; same fallback.
- `WEB_LOCALES`, `WebLocale`, `isWebLocale`, `getWebLocaleNativeName` — locale list and picker labels from bundles.
- `EmailLocale` — `"en" | "ru"` (email bundles).

## Build

`yarn build` (or `yarn build:i18n` from the `okkey` repo root): generate web bundles map, compile TypeScript, copy JSON into `dist/locales/`.
