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
5. After unlock the popup shows vault UI (web-mobile parity shell):
   - Header: burger · search (live on-type) · Lock · «+» (opens web `/items?popup=newItem`)
   - Burger drawer: workspace switcher, vaults (no «+»), folders (no folder settings), profile (Logout + Change server; no My settings). No Workspace nav / Documentation / Help.
   - Left **250px** list: filter dropdown + sort like web, row layout like web
   - Right: item card toolbar like web mobile (no back) — edit/capsule/favorite/archive deep-link to web; field copy with copy-guard
6. **Lock** returns to Unlock; **Sign out** / **Change server** wipe extension session/device/vault cache (keeps last server URL preference) and return to the server screen.

### After rebuilding

1. `chrome://extensions` → Okkey → **Reload**.
2. Open popup → unlock → verify list/card/search/burger/lock/+.

## Scope

- **E0:** popup shell + background SW, Chromium/Firefox builds.
- **E1:** Server URL, web+PKCE session, device pending/approve.
- **E2 (this phase):** Local MP unlock, sync read, workspace switch, search/filter, item read/copy + copy-guard, web deep links, vault UI parity with web mobile shell.
- **E3:** delete/favorite mutations, device settings (theme/PIN).
- **E4 (this phase):** persist `urlAutofillScope` on login «Вебсайт URL»; content-script autofill (login + password + TOTP); copy-guard in popup; host permissions `<all_urls>`.
- **Not yet (E4.1+):** save-password prompt / generator on page.

## E4 — Autofill

1. Rebuild: `yarn workspace @okkey/extension build:chromium` → `apps/extension/output/chrome-mv3`.
2. `chrome://extensions` → Okkey → **Reload** (or Load unpacked → that folder).
3. In **web**, create a **Логин/пароль** item with username/password, optional TOTP, and website URLs using all three scopes (`на всём сайте` / `только на этом URL` / `без автозаполнения`). Save.
4. Unlock the extension, open a matching site, focus login/password/OTP → pick the item from the Okkey overlay. Locked vault shows **Разблокировать**.
5. Copy login/password in the popup on a tab that does **not** match any website URL → **Отмена** / **Копировать** (copy writes immediately).
