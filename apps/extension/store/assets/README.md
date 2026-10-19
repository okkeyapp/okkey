# Store visual assets

Icons shipped in the extension package (`public/icon-*.png`) cover the **toolbar**. Stores also require **listing screenshots** (and often a promo tile).

Canonical location for listing uploads: **this folder** (`apps/extension/store/assets/`). Do not keep store screenshots only under `public/` (they would ship in the extension zip).

## Publication status

Live EN+RU product captures are present for vault popup, autofill overlay, and unlock (“Vault is locked”), plus a small promo tile (same art for EN/RU).

**Still missing before full runbook §0:** `screenshot-03-server-url-{en,ru}.png`.

**Size note:** current screenshots are **600×450**. CWS/Edge typically expect **1280×800** or **640×400** — re-export at a store-accepted size before submit if the console rejects these.

## Files in this folder

| File | Size | Stores | Status |
|------|------|--------|--------|
| [screenshot-01-vault-popup-en.png](./screenshot-01-vault-popup-en.png) | 600×450 | CWS / Edge / Opera / AMO | Live — EN |
| [screenshot-01-vault-popup-ru.png](./screenshot-01-vault-popup-ru.png) | 600×450 | CWS / Edge / Opera / AMO | Live — RU |
| [screenshot-02-autofill-en.png](./screenshot-02-autofill-en.png) | 600×450 | CWS / Edge / Opera / AMO | Live — EN |
| [screenshot-02-autofill-ru.png](./screenshot-02-autofill-ru.png) | 600×450 | CWS / Edge / Opera / AMO | Live — RU |
| screenshot-03-server-url-en.png | — | CWS / Edge / Opera / AMO | **Missing** |
| screenshot-03-server-url-ru.png | — | CWS / Edge / Opera / AMO | **Missing** |
| [screenshot-04-unlock-en.png](./screenshot-04-unlock-en.png) | 600×450 | CWS / Edge / Opera / AMO | Live — EN (vault is locked) |
| [screenshot-04-unlock-ru.png](./screenshot-04-unlock-ru.png) | 600×450 | CWS / Edge / Opera / AMO | Live — RU (vault is locked) |
| [promo-small-440x280-en.png](./promo-small-440x280-en.png) | 440×280 | CWS small promo | Live (shared art) |
| [promo-small-440x280-ru.png](./promo-small-440x280-ru.png) | 440×280 | Edge / locales | Live (same as EN) |
| [promo-small-440x280.png](./promo-small-440x280.png) | 440×280 | alias | Same bytes as `-en` |

## Required (typical)

| Asset | CWS | Edge | Opera | AMO |
|-------|-----|------|-------|-----|
| Screenshot(s) 1280×800 or 640×400 | ✓ | ✓ | ✓ | ✓ (min 1) |
| Small promo tile 440×280 | often | — | — | — |
| Marquee 1400×560 | optional | — | — | — |
| Extension icon 128×128 | from package | from package | from package | from package |

## Shot list

1. Popup unlocked — vault list + item card → `screenshot-01-vault-popup-{en,ru}.png`
2. Autofill overlay on a login form → `screenshot-02-autofill-{en,ru}.png`
3. Server URL / self-host setup screen → `screenshot-03-server-url-{en,ru}.png` (**still needed**)
4. Unlock screen (master password / vault locked) → `screenshot-04-unlock-{en,ru}.png`
5. Device pending approval (optional — not bundled)

Capture from a **self-hosted** demo instance (no SaaS-only branding). Avoid real customer secrets; use disposable demo credentials.

## Naming convention

```text
screenshot-01-vault-popup-en.png
screenshot-01-vault-popup-ru.png
screenshot-02-autofill-en.png
screenshot-02-autofill-ru.png
screenshot-03-server-url-en.png
screenshot-03-server-url-ru.png
screenshot-04-unlock-en.png
screenshot-04-unlock-ru.png
promo-small-440x280-en.png
promo-small-440x280-ru.png
```
