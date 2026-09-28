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

## Build (load unpacked)

```bash
yarn build:extension:chromium   # → apps/extension/.output/chrome-mv3
yarn build:extension:firefox    # → apps/extension/.output/firefox-mv3
```

### Chrome / Edge / Chromium

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** → select `apps/extension/.output/chrome-mv3`.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → select `apps/extension/.output/firefox-mv3/manifest.json`.

## Scope

- **E0 (this package):** popup shell + background SW, Chromium/Firefox builds.
- **Not in E0:** auth, vault unlock, autofill, content scripts.
