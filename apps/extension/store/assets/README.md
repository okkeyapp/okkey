# Store visual assets

Icons shipped in the extension package (`public/icon-*.png`) cover the **toolbar**. Stores also require **listing screenshots** (and often a promo tile).

## Publication blocker

Files currently in this folder are **layout mockups** (drawn UI placeholders), **not** live product captures. They are sized correctly for console field rehearsal only.

**Do not upload these mockups for a real store review / publish.** Replace every screenshot (and the promo tile) with EN captures from a self-hosted demo instance that show the real extension UI (popup layout, autofill overlay, server URL setup, unlock / “Vault is locked”). Until then, the screenshot steps in [SUBMIT-CHECKLIST.md](../SUBMIT-CHECKLIST.md) remain a **publication blocker**.

## Files in this folder

| File | Size | Stores | Status |
|------|------|--------|--------|
| [screenshot-01-vault-popup-en.png](./screenshot-01-vault-popup-en.png) | 1280×800 | CWS / Edge / Opera / AMO | Mockup — replace before publish |
| [screenshot-02-autofill-en.png](./screenshot-02-autofill-en.png) | 1280×800 | CWS / Edge / Opera / AMO | Mockup — replace before publish |
| [screenshot-03-server-url-en.png](./screenshot-03-server-url-en.png) | 1280×800 | CWS / Edge / Opera / AMO | Mockup — replace before publish |
| [screenshot-04-unlock-en.png](./screenshot-04-unlock-en.png) | 1280×800 | CWS / Edge / Opera / AMO | Mockup — replace before publish |
| [promo-small-440x280.png](./promo-small-440x280.png) | 440×280 | CWS small promo tile | Mockup — replace before publish |

## Required (typical)

| Asset | CWS | Edge | Opera | AMO |
|-------|-----|------|-------|-----|
| Screenshot(s) 1280×800 or 640×400 | ✓ | ✓ | ✓ | ✓ (min 1) |
| Small promo tile 440×280 | often | — | — | — |
| Marquee 1400×560 | optional | — | — | — |
| Extension icon 128×128 | from package | from package | from package | from package |

## Shot list

1. Popup unlocked — vault list + item card → `screenshot-01-vault-popup-en.png`
2. Autofill overlay on a login form → `screenshot-02-autofill-en.png`
3. Server URL / self-host setup screen → `screenshot-03-server-url-en.png`
4. Unlock screen (master password) → `screenshot-04-unlock-en.png`
5. Device pending approval (optional — not bundled)

Capture from a **self-hosted** demo instance (no SaaS-only branding). Avoid real customer secrets; use disposable demo credentials.

## Naming convention (when adding files)

```text
screenshot-01-vault-popup-en.png
screenshot-02-autofill-en.png
screenshot-01-vault-popup-ru.png
promo-small-440x280.png
```
