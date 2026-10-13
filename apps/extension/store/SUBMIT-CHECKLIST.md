# E5 Store — submit checklist (team)

Ready-to-submit pack for **Okkey extension `1.0.0.2`**. Do **not** tag/`Release` on `main` from this branch. Do **not** merge until Саша says so.

## 0. Preflight

- [ ] Tip of branch includes `origin/dev` ≥ `4900d34`
- [ ] `apps/extension/package.json` → `"version": "1.0.0.2"`
- [ ] Built manifest → `"version": "1.0.0.2"` (no Chromium `version_name`, no `*-beta.*`)
- [ ] Listing copy reviewed: [LISTING.en.md](./LISTING.en.md) / [LISTING.ru.md](./LISTING.ru.md)
- [ ] Permissions text ready: [PERMISSIONS.md](./PERMISSIONS.md)
- [ ] Privacy / support URLs: [URLS.md](./URLS.md) (public GitHub blob links)
- [ ] Screenshots prepared ([assets/README.md](./assets/README.md))
- [ ] Smoke: load unpacked Chromium + Firefox against a **self-hosted** web+API (not SaaS-only mindset)

## 1. Build zips

From **repo root** (Node `>=25 <26`, Yarn classic):

```bash
# Ensure WASM crypto is built (extension copies packages/crypto/dist/*.wasm)
yarn build:wasm   # or your usual packages/crypto build path if already fresh

yarn zip:extension:store
# equivalent:
#   yarn zip:extension:chromium
#   yarn zip:extension:firefox
```

Expected outputs (WXT names from package/manifest version):

```text
apps/extension/output/
  chrome-mv3/                                      # unpacked Chromium
  firefox-mv3/                                     # unpacked Firefox
  okkeyextension-1.0.0.2-chrome.zip                # CWS / Edge / Opera
  okkeyextension-1.0.0.2-firefox.zip               # AMO package
  okkeyextension-1.0.0.2-sources.zip               # AMO sources (when requested)
```

Confirm versions inside the zip:

```bash
# Chromium
unzip -p apps/extension/output/*chrome*.zip manifest.json | python3 -c "import sys,json; m=json.load(sys.stdin); print(m['version'], m.get('version_name'))"
# Firefox
unzip -p apps/extension/output/*firefox*.zip manifest.json | python3 -c "import sys,json; m=json.load(sys.stdin); print(m['version'], m.get('browser_specific_settings'))"
```

Expect: `1.0.0.2` and **no** `version_name` (Chromium); gecko id `extension@okkey.io` (Firefox).

## 2. Local QA before upload

### Load unpacked (Chromium — Chrome / Edge / Opera / Brave / Yandex)

1. `yarn build:extension:chromium` → `apps/extension/output/chrome-mv3`
2. `chrome://extensions` (or `edge://extensions` / `opera://extensions` / Yandex equivalents)
3. Enable **Developer mode** → **Load unpacked** → select `chrome-mv3`
4. Point Server URL at your self-hosted web origin → PKCE login → device approve → unlock → autofill smoke on a test login form

### Load temporary add-on (Firefox)

1. `yarn build:extension:firefox` → `apps/extension/output/firefox-mv3`
2. `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `firefox-mv3/manifest.json`
3. Same smoke as Chromium

### Load zip (store-shaped)

- Chromium: some dashboards accept the zip directly; locally you can also unpack the zip and Load unpacked.
- Firefox: AMO upload uses the firefox zip; for local zip test, unpack or use `web-ext run` if available.

## 3. Store upload matrix

| Store | Package | Notes |
|-------|---------|--------|
| **Chrome Web Store** | Chromium zip | Single source for Chrome + most Chromium browsers including **Yandex** installs from CWS |
| **Edge Add-ons** | **Same** Chromium zip | Can mirror CWS listing; reuse EN copy + permissions justification |
| **Opera Add-ons** | **Same** Chromium zip | P1 coverage; helps Yandex fallback |
| **Firefox AMO** | Firefox zip | Separate listing; use EN (+ RU locale if desired) |
| **Yandex** | — | No separate package — users install from **CWS** (and/or Opera) |

Per store console, paste:

1. Short + detailed description ([LISTING.en.md](./LISTING.en.md))
2. Permission justification single-purpose / host access ([PERMISSIONS.md](./PERMISSIONS.md))
3. Privacy policy URL + support URL ([URLS.md](./URLS.md)) — public GitHub blob links
4. Screenshots / promo tiles ([assets/README.md](./assets/README.md))
5. Category: Productivity / Privacy & Security (as available)

## 4. Reviewer notes (paste summary)

Use the short block at the top of [PERMISSIONS.md](./PERMISSIONS.md). Emphasize:

- Password manager autofill requires detecting login fields on websites the user visits
- Vault decrypt is **client-side** (WASM); server never sees plaintext vault
- User configures **their own** Okkey instance URL (self-host); no mandatory SaaS backend
- No remote code execution; all scripts shipped in the package

## 5. After upload (still pre-merge)

- [ ] Record draft/item IDs from each store console in team notes (not in this PR unless asked)
- [ ] Keep this PR **Draft** until Саша approves merge
- [ ] **Do not** create product tags / GitHub Releases on `main` from E5 alone — product release flow stays on `main` (extension packaging here is only `1.0.0.2`)
