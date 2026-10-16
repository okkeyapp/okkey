# Store visual assets

Icons shipped in the extension package (`public/icon-*.png`) cover the **toolbar**. Stores also require **listing screenshots** (and often a promo tile).

**This release:** live product captures in **EN and RU** are mandatory before submit. Locale rules: [../LOCALES.md](../LOCALES.md).

## Publication blocker

Files currently in this folder are **layout mockups** (drawn UI placeholders), **not** live product captures. They are sized correctly for console field rehearsal only.

**Do not upload these mockups for a real store review / publish.** Replace every screenshot (and promo tiles) with captures from a self-hosted demo that show the real extension UI — once in **English UI**, once in **Russian UI**. Until then, screenshot steps in [SUBMIT-CHECKLIST.md](../SUBMIT-CHECKLIST.md) remain a **publication blocker**.

## Canonical file names (required before submit)

| File | Size | Stores | Status |
|------|------|--------|--------|
| `screenshot-01-vault-popup-en.png` | 1280×800 | CWS / Edge / Opera / AMO | Mockup — replace with live EN |
| `screenshot-02-autofill-en.png` | 1280×800 | CWS / Edge / Opera / AMO | Mockup — replace with live EN |
| `screenshot-03-server-url-en.png` | 1280×800 | CWS / Edge / Opera / AMO | Mockup — replace with live EN |
| `screenshot-04-unlock-en.png` | 1280×800 | CWS / Edge / Opera / AMO | Mockup — replace with live EN |
| `screenshot-01-vault-popup-ru.png` | 1280×800 | CWS / Edge / Opera / AMO | **Missing** — live RU required |
| `screenshot-02-autofill-ru.png` | 1280×800 | CWS / Edge / Opera / AMO | **Missing** — live RU required |
| `screenshot-03-server-url-ru.png` | 1280×800 | CWS / Edge / Opera / AMO | **Missing** — live RU required |
| `screenshot-04-unlock-ru.png` | 1280×800 | CWS / Edge / Opera / AMO | **Missing** — live RU required |
| `promo-small-440x280-en.png` | 440×280 | CWS small promo; Edge EN | Mockup — replace with live EN |
| `promo-small-440x280-ru.png` | 440×280 | Edge RU (optional Duplicate); AMO set | **Missing** — live RU required |

CWS: small promo tile is **not** localizable — upload the EN promo once.  
Edge: logo/promo can be Duplicated across languages; still produce `-ru` promo if the RU UI branding differs.  
AMO: one screenshot set for all locales — upload **all eight** live EN+RU screenshots into that set.

## Required (typical)

| Asset | CWS | Edge | Opera | AMO |
|-------|-----|------|-------|-----|
| Screenshot(s) 1280×800 or 640×400 | ✓ EN+RU locales | ✓ EN+RU (our rule) | ✓ | ✓ min 1; we upload EN+RU in one set |
| Small promo tile 440×280 | often (EN only) | optional per language | — | — |
| Marquee 1400×560 | optional | optional | — | — |
| Extension icon 128×128 | from package | from package | from package | from package |

## Shot list (same four scenes × EN + RU)

1. Popup unlocked — vault list + item card → `screenshot-01-vault-popup-{en,ru}.png`
2. Autofill overlay on a login form → `screenshot-02-autofill-{en,ru}.png`
3. Server URL / self-host setup screen → `screenshot-03-server-url-{en,ru}.png`
4. Unlock screen (master password) → `screenshot-04-unlock-{en,ru}.png`
5. Device pending approval (optional — not required for submit)

Capture from a **self-hosted** demo instance (no SaaS-only branding). Switch extension UI locale to EN then RU for matching chrome. Avoid real customer secrets; use disposable demo credentials.

## Naming convention

```text
screenshot-<nn>-<scene>-<lang>.png
promo-small-440x280-<lang>.png
```

`<lang>` is `en` or `ru` only. Do not use undescorated names for new assets.
