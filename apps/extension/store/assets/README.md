# Store visual assets

Icons shipped in the extension package (`public/icon-*.png`) cover the **toolbar**. Stores also require **listing screenshots** (and often a promo tile).

**This release:** live product captures in **EN and RU** are mandatory before submit. Locale rules: [../LOCALES.md](../LOCALES.md).

Canonical location: **this folder** (`apps/extension/store/assets/`). Do not keep store screenshots only under `public/` (they would ship in the extension zip).

## Publication status

Live EN+RU product captures (3 scenes × 2 locales) and promo tiles are present at store-accepted sizes (**1280×800** screenshots, **440×280** promo). No `server-url` shot for this release.

## Canonical file names

| File | Size | Stores | Status |
|------|------|--------|--------|
| [screenshot-01-vault-is-locked-en.png](./screenshot-01-vault-is-locked-en.png) | 1280×800 | CWS / Edge / Opera / AMO | Live — EN |
| [screenshot-01-vault-is-locked-ru.png](./screenshot-01-vault-is-locked-ru.png) | 1280×800 | CWS / Edge / Opera / AMO | Live — RU |
| [screenshot-02-vault-popup-en.png](./screenshot-02-vault-popup-en.png) | 1280×800 | CWS / Edge / Opera / AMO | Live — EN |
| [screenshot-02-vault-popup-ru.png](./screenshot-02-vault-popup-ru.png) | 1280×800 | CWS / Edge / Opera / AMO | Live — RU |
| [screenshot-03-autofill-en.png](./screenshot-03-autofill-en.png) | 1280×800 | CWS / Edge / Opera / AMO | Live — EN |
| [screenshot-03-autofill-ru.png](./screenshot-03-autofill-ru.png) | 1280×800 | CWS / Edge / Opera / AMO | Live — RU |
| [promo-small-440x280-en.png](./promo-small-440x280-en.png) | 440×280 | CWS small promo; Edge EN | Live |
| [promo-small-440x280-ru.png](./promo-small-440x280-ru.png) | 440×280 | Edge RU; AMO set | Live (same art as EN) |

CWS: small promo tile is **not** localizable — upload the EN promo once.  
Edge: logo/promo can be Duplicated across languages; `-ru` promo provided.  
AMO: one screenshot set for all locales — upload all six live EN+RU screenshots into that set.

## Required (typical)

| Asset | CWS | Edge | Opera | AMO |
|-------|-----|------|-------|-----|
| Screenshot(s) 1280×800 or 640×400 | ✓ EN+RU locales | ✓ EN+RU (our rule) | ✓ | ✓ min 1; we upload EN+RU in one set |
| Small promo tile 440×280 | often (EN only) | optional per language | — | — |
| Marquee 1400×560 | optional | optional | — | — |
| Extension icon 128×128 | from package | from package | from package | from package |

## Shot list (3 scenes × EN + RU)

1. Vault is locked / unlock screen → `screenshot-01-vault-is-locked-{en,ru}.png`
2. Popup unlocked — vault list + item card → `screenshot-02-vault-popup-{en,ru}.png`
3. Autofill overlay on a login form → `screenshot-03-autofill-{en,ru}.png`

Capture from a **self-hosted** demo instance (no SaaS-only branding). Switch extension UI locale to EN then RU for matching chrome. Avoid real customer secrets; use disposable demo credentials.

## Naming convention

```text
screenshot-<nn>-<scene>-<lang>.png
promo-small-440x280-<lang>.png
```

`<lang>` is `en` or `ru` only. Do not use undescorated promo names.
