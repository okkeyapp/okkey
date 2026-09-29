# Okkey browser extension

MV3 extension scaffolded with [WXT](https://wxt.dev/). Chromium (Chrome / Edge / Opera / Yandex) and Firefox share one source tree.

## Requirements

- Node `>=25 <26` (see repo `.tool-versions`)
- Yarn classic (`1.22.x`) from the monorepo root

## Develop

From the repo root (after `yarn install`):

```bash
yarn dev:extension            # Chromium
yarn --cwd apps/extension dev:firefox
```

Or from this package:

```bash
yarn dev
yarn dev:firefox
```

Run API + web locally in another terminal (`yarn dev` from repo root) so extension login can open `http://localhost:5173`.

## Build (load unpacked)

```bash
yarn build:extension:chromium   # → apps/extension/output/chrome-mv3
yarn build:extension:firefox    # → apps/extension/output/firefox-mv3
```

### Chrome / Edge / Chromium

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** → select `apps/extension/output/chrome-mv3`.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → select `apps/extension/output/firefox-mv3/manifest.json`.

## E2 — Vault unlock + read MVP

1. Start Core API + web (`yarn dev` from repo root).
2. Load the unpacked Chromium build (`apps/extension/output/chrome-mv3`).
3. Complete E1 flow: Server URL → web PKCE login → device approve on a trusted device.
4. On **Unlock**, enter the master password (same as web).
5. After unlock the popup shows vault UI (not a stub):
   - Workspace switcher
   - Search + Active / All / Archived filters
   - Item list → select an item → read card with copy
   - Copy-guard confirm when the active tab URL does not match item website URLs
   - **Edit in web** / Capsules / Devices / Open web → deep links via `browser.tabs.create`
6. **Lock** returns to Unlock; **Sign out** wipes extension session/device/vault cache (keeps last server URL).

### After rebuilding

1. `chrome://extensions` → Okkey → **Reload**.
2. Open popup → unlock → verify list/card/search/workspace switch.

## Scope

- **E0:** popup shell + background SW, Chromium/Firefox builds.
- **E1:** Server URL, web+PKCE session, device pending/approve.
- **E2 (this phase):** Local MP unlock, sync read, workspace switch, search/filter, item read/copy + copy-guard, web deep links.
- **Not yet (E3+):** delete/favorite mutations, PIN setup UI, autofill / content scripts.
