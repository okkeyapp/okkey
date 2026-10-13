# Okkey browser extension

MV3 extension scaffolded with [WXT](https://wxt.dev/). Chromium (Chrome / Edge / Opera / Yandex) and Firefox share one source tree.

**Product version:** `1.0.0-beta.2` · **manifest `version`:** `1.0.0.2` · Chromium **`version_name`:** `1.0.0-beta.2`

Store packaging (listings, permissions justification, submit checklist): **[store/](./store/)**.

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

Run API + web locally in another terminal (`yarn dev` from repo root) so extension login can open your **self-hosted** web origin (e.g. `http://localhost:5173`).

## Build (load unpacked)

```bash
yarn build:extension:chromium   # → apps/extension/output/chrome-mv3
yarn build:extension:firefox    # → apps/extension/output/firefox-mv3
```

### Chrome / Edge / Chromium / Opera / Yandex

1. Open `chrome://extensions` (or `edge://extensions` / Opera / Yandex equivalents).
2. Enable **Developer mode**.
3. **Load unpacked** → select `apps/extension/output/chrome-mv3`.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → select `apps/extension/output/firefox-mv3/manifest.json`.

## Store zips (E5 ready-to-submit)

```bash
yarn zip:extension:store
# → apps/extension/output/*chrome*.zip   (CWS + Edge + Opera; Yandex via CWS)
# → apps/extension/output/*firefox*.zip  (AMO)
```

Full checklist: [store/SUBMIT-CHECKLIST.md](./store/SUBMIT-CHECKLIST.md).

## Smoke after rebuild

1. `chrome://extensions` → Okkey → **Reload** (or re-load unpacked).
2. Server URL → web PKCE login → device approve → Unlock (MP).
3. Vault list/card/search; autofill on a matching login form; generator in popup tools.

## Scope (phases)

- **E0–E3:** scaffold, auth/device, vault read, mutations + device settings.
- **E4 / E4.1:** autofill + save prompt + generator / polish (on `dev`).
- **E5:** store beta packaging + listing docs (this folder’s `store/`).
