# Store locales — EN + RU (required)

This release lists the extension in **English and Russian** on every store that accepts locales. Copy source: [LISTING.en.md](./LISTING.en.md) / [LISTING.ru.md](./LISTING.ru.md). Package locales (so consoles unlock locale dropdowns): `apps/extension/public/_locales/{en,ru}/messages.json`.

## Package prerequisite

Manifest ships:

- `default_locale: "en"`
- `name` / `description` / `action.default_title` via `__MSG_*__`
- `_locales/en` + `_locales/ru` with `extName`, `extDescription`, `actionTitle`

Without both locale folders in the **uploaded zip**, Chrome Web Store and Edge Partner Center typically show only a single listing language. Rebuild (`yarn zip:extension:chromium` / `firefox`) after any `_locales` change.

In-app UI language (popup / overlay) is separate (`@okkey/i18n` + `chrome.storage`) — do not confuse with store listing locales.

## Chrome Web Store

| What | Required |
|------|----------|
| Package `_locales` en + ru | Yes — unlocks locale switcher on Store listing tab |
| Short description | From package `extDescription` (EN/RU); keep in sync with LISTING short |
| Detailed description | Paste EN + RU from LISTING (locale dropdown at top of listing) |
| Screenshots 1280×800 | **Live** EN set **and** RU set; mark each upload for that locale (not “all locales”) |
| Small promo 440×280 | One tile (CWS promo is **not** localizable) → use `promo-small-440x280-en.png` |
| Privacy / support / homepage | Single URLs for the item — see [URLS.md](./URLS.md) |

Docs: [Complete your listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing).

## Edge Add-ons (Partner Center)

| What | Required |
|------|----------|
| Package `_locales` en + ru | Yes — Store Listings languages come from the package |
| Store listing languages | Keep **en** and **ru** (add/remove languages UI) |
| Description per language | EN + RU from LISTING (Edge: min **250** / max 10 000 chars — our detailed blocks qualify) |
| Logo per language | Required; may Duplicate from EN → RU |
| Screenshots | Optional in policy, but **we require** live EN + RU sets (1280×800) for this release |
| Small promo 440×280 | Optional; if used, upload EN (+ RU or Duplicate) |
| Privacy policy URL | Single field — [URLS.md](./URLS.md) |

Docs: [Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

## Firefox AMO

| What | Required |
|------|----------|
| Default locale | `en` |
| Listing text | EN **and** RU (name/summary/description per locale in Developer Hub) |
| Screenshots | **One shared set** for the whole listing (AMO does not do per-locale screenshot sets) |
| Our rule | Upload **all** live EN + RU PNGs into that single set (6 screenshots); localize captions if the form allows |
| Privacy / support | [URLS.md](./URLS.md) |

Docs: [Create an appealing listing](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/).

## Screenshot / promo file names

See [assets/README.md](./assets/README.md). Canonical:

```text
screenshot-01-vault-is-locked-en.png
screenshot-01-vault-is-locked-ru.png
screenshot-02-vault-popup-en.png
screenshot-02-vault-popup-ru.png
screenshot-03-autofill-en.png
screenshot-03-autofill-ru.png
promo-small-440x280-en.png
promo-small-440x280-ru.png   # Edge RU (and AMO set); not used by CWS promo field
```

Live captures in `assets/` are publishable for this release (no `server-url` shot).
