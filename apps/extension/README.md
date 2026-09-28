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

## E1 — Server URL + session auth + device

1. Start Core API + web (`yarn dev` from repo root).
2. Load the unpacked Chromium build.
3. Open the popup → **Server**:
   - Preset SaaS `https://app.okkey.io`, or
   - Manual Base URL for local: `http://localhost:5173` (API resolves to `http://localhost:4000`).
4. **Sign in via browser** → web `/auth/extension/start` → email / passkey / 2FA (session only).
5. Web redirects to the extension callback with a one-time `auth_code` (PKCE). Vault unlock on web is **not** required.
6. Popup continues → device register `channel=Extension` / fingerprint `extension-…` → pending approval on a trusted device (same as web).
7. After approve → **Unlock** screen (master password stub in E1; real vault unlock in E2).

Changing Base URL wipes the local profile (logout + clear session/device cache).

## Scope

- **E0:** popup shell + background SW, Chromium/Firefox builds.
- **E1 (this phase):** Server URL, web+PKCE session, device pending/approve, Unlock stub.
- **Not yet:** vault plaintext, autofill, content scripts.
