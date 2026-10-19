# Extension store — submit checklist

Ready-to-submit pack for **Okkey extension `1.0.0.2`**. This folder documents packaging and console fields only. It does **not** create product tags or GitHub Releases on `main`.

**Locales:** EN **and** RU are required for this release (listing copy + live screenshots). See [LOCALES.md](./LOCALES.md).

## Publication status

| Store | Package | Status |
|-------|---------|--------|
| **Chrome Web Store** | Chromium zip | Ready to rehearse (build → upload → paste listing) |
| **Edge Add-ons** | Same Chromium zip | Ready to rehearse |
| **Opera Add-ons** | Same Chromium zip | Optional Chromium mirror (P1) |
| **Firefox AMO** | Firefox zip + sources | **Blocked** until a verified Firefox build exists (see [AMO](#5-firefox-amo--blocked)) |
| **Yandex Browser** | — | No separate package — users install from **CWS** (and/or Opera) |

**Listing screenshots — partially unblocked.** Live EN+RU captures for vault popup, autofill, unlock + promo are in [assets/](./assets/). Still missing: `screenshot-03-server-url-{en,ru}.png`. Pixel size is **600×450** (stores usually want 1280×800 or 640×400) — confirm console accept before submit (see [assets/README.md](./assets/README.md)).

Self-host framing only (FREE / ENTERPRISE on the user’s instance). Do **not** promise a hosted Okkey cloud service in any store form.

## 0. Preflight (all stores)

- [ ] Tip of branch includes current `origin/dev`
- [ ] `apps/extension/package.json` → `"version": "1.0.0"` (workspace SemVer; **not** `1.0.0.2`)
- [ ] `wxt.config.ts` / built manifest → `"version": "1.0.0.2"`, `default_locale: "en"`, name/description via `__MSG_*__`
- [ ] Zip contains `_locales/en/messages.json` **and** `_locales/ru/messages.json`
- [ ] Listing copy reviewed: [LISTING.en.md](./LISTING.en.md) **and** [LISTING.ru.md](./LISTING.ru.md)
- [ ] Locale console plan reviewed: [LOCALES.md](./LOCALES.md)
- [ ] Permissions text ready: [PERMISSIONS.md](./PERMISSIONS.md)
- [ ] Privacy / support / homepage URLs live: [URLS.md](./URLS.md) (official GitHub paste, or substituted instance placeholders)
- [ ] Screenshots / promo under [assets/](./assets/) are **live** EN+RU for popup/autofill/unlock + promo; **server-url** still missing; confirm store-accepted dimensions
- [ ] Smoke: load unpacked Chromium against a **self-hosted** web+API

## 1. Build Chromium zip (CWS / Edge / Opera)

From **repo root** (Node `>=25 <26`, Yarn classic):

```bash
yarn build:wasm   # or refresh packages/crypto if already built
yarn zip:extension:chromium
```

Expected outputs:

```text
apps/extension/output/
  chrome-mv3/                                      # unpacked Chromium
  okkeyextension-1.0.0.2-chrome.zip                # CWS / Edge / Opera
```

Confirm version + locales inside the zip:

```bash
unzip -p apps/extension/output/*chrome*.zip manifest.json | python3 -c "import sys,json; m=json.load(sys.stdin); print(m['version'], m.get('version_name'), m.get('default_locale'), m.get('name'), m.get('description'))"
unzip -l apps/extension/output/*chrome*.zip | rg '_locales/(en|ru)/messages.json'
```

Expect: `1.0.0.2`, **no** `version_name`, `default_locale=en`, `__MSG_extName__` / `__MSG_extDescription__`, both locale files present.

### Local load (Chromium — Chrome / Edge / Opera / Brave / Yandex)

1. `yarn build:extension:chromium` → `apps/extension/output/chrome-mv3`
2. `chrome://extensions` (or `edge://extensions` / Opera / Yandex equivalents)
3. Enable **Developer mode** → **Load unpacked** → select `chrome-mv3`
4. Point Server URL at your self-hosted web origin → sign-in → device approve → unlock → autofill smoke

Store-shaped zip: unpack `*chrome*.zip` and Load unpacked, or upload the zip in the store console when it accepts packages directly.

## 2. Chrome Web Store — steps

Do these in order in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

1. [ ] Create or open the Okkey item (draft is fine for rehearsal).
2. [ ] Upload package: `apps/extension/output/okkeyextension-1.0.0.2-chrome.zip` (must include `_locales/en` + `_locales/ru`).
3. [ ] **EN locale:** paste short + detailed description from [LISTING.en.md](./LISTING.en.md).
4. [ ] **RU locale:** switch locale dropdown → paste from [LISTING.ru.md](./LISTING.ru.md).
5. [ ] Paste single-purpose / host-access justification from [PERMISSIONS.md](./PERMISSIONS.md).
6. [ ] Paste privacy policy URL + support URL from [URLS.md](./URLS.md).
7. [ ] Upload **live** screenshots: EN set restricted to English locale; RU set restricted to Russian locale — see [assets/README.md](./assets/README.md).
8. [ ] Upload small promo tile `promo-small-440x280-en.png` (CWS promo is not localizable).
9. [ ] Set category (Productivity / Privacy & Security as available).
10. [ ] Paste reviewer notes (section [Reviewer notes](#6-reviewer-notes)).
11. [ ] Save draft / submit for review only when intentionally publishing **and** EN+RU screenshot blocker is cleared (rehearsal stops before final publish if no account).

## 3. Edge Add-ons — steps

Do these in order in the [Partner Center](https://partner.microsoft.com/dashboard) Edge Add-ons flow. Reuse the **same** Chromium zip.

1. [ ] Create or open the Okkey Edge listing (draft is fine for rehearsal).
2. [ ] Upload package: `apps/extension/output/okkeyextension-1.0.0.2-chrome.zip` (same file as CWS).
3. [ ] On Store Listings: keep languages **en** and **ru** (from package `_locales`).
4. [ ] Paste EN description from [LISTING.en.md](./LISTING.en.md); RU from [LISTING.ru.md](./LISTING.ru.md) (≥250 chars each).
5. [ ] Logo: upload once, Duplicate to the other language if UI allows.
6. [ ] Paste permission justification from [PERMISSIONS.md](./PERMISSIONS.md).
7. [ ] Paste privacy policy URL + support URL from [URLS.md](./URLS.md).
8. [ ] Upload **live** EN screenshots on the EN listing and **live** RU screenshots on the RU listing ([assets/README.md](./assets/README.md)).
9. [ ] Optional promo: `promo-small-440x280-en.png` / `promo-small-440x280-ru.png` (or Duplicate).
10. [ ] Set category as available in the Edge console.
11. [ ] Save draft / submit for review only when intentionally publishing **and** EN+RU screenshot blocker is cleared.

Optional: mirror store metadata from the CWS listing where Partner Center allows import.

## 4. Opera Add-ons — optional Chromium mirror

Same Chromium zip as CWS/Edge. Paste **EN and RU** listing where Opera supports locales; same **live-capture** screenshot rule (EN+RU). Helps Yandex users who prefer Opera Add-ons as a fallback to CWS.

## 5. Firefox AMO — **BLOCKED**

**Do not upload to AMO yet.** AMO stays blocked until a **verified** Firefox package exists:

1. `yarn zip:extension:firefox` produces `okkeyextension-1.0.0.2-firefox.zip` and `okkeyextension-1.0.0.2-sources.zip` without errors.
2. Temporary add-on smoke passes (`about:debugging` → Load Temporary Add-on → `firefox-mv3/manifest.json`).
3. `npx web-ext lint --source-dir apps/extension/output/firefox-mv3` reports **no errors** (warnings triaged).

When those checks pass, clear the blocked flag in this section and run the steps below.

### AMO steps (after unblock)

1. [ ] Build Firefox artifacts from repo root:

```bash
yarn build:wasm
yarn zip:extension:firefox
# or: yarn zip:extension:store   # chromium + firefox
```

Expected:

```text
apps/extension/output/
  firefox-mv3/
  okkeyextension-1.0.0.2-firefox.zip
  okkeyextension-1.0.0.2-sources.zip
```

2. [ ] Confirm gecko id / version / locales:

```bash
unzip -p apps/extension/output/*firefox*.zip manifest.json | python3 -c "import sys,json; m=json.load(sys.stdin); print(m['version'], m.get('default_locale'), m.get('browser_specific_settings'))"
unzip -l apps/extension/output/*firefox*.zip | rg '_locales/(en|ru)/messages.json'
```

Expect: `1.0.0.2`, `default_locale=en`, gecko id `extension@okkey.io`, both locale files.

3. [ ] Local smoke: Load Temporary Add-on from `firefox-mv3/manifest.json`; same self-host smoke as Chromium.
4. [ ] Lint: `npx web-ext lint --source-dir apps/extension/output/firefox-mv3` — fix or document every warning; **no errors**.
5. [ ] In [AMO Developer Hub](https://addons.mozilla.org/developers/): upload `*-firefox.zip` (+ sources when requested).
6. [ ] Paste EN listing ([LISTING.en.md](./LISTING.en.md)) **and** RU listing ([LISTING.ru.md](./LISTING.ru.md)); default locale `en`.
7. [ ] Paste permissions justification ([PERMISSIONS.md](./PERMISSIONS.md)).
8. [ ] Paste privacy / support URLs ([URLS.md](./URLS.md)).
9. [ ] Upload **all** live EN+RU screenshots into AMO’s **single** screenshot set ([assets/README.md](./assets/README.md); [LOCALES.md](./LOCALES.md)).
10. [ ] Submit for review only when intentionally publishing **and** screenshot blocker is cleared.

## 6. Reviewer notes

Use the short block at the top of [PERMISSIONS.md](./PERMISSIONS.md). Emphasize:

- Password manager autofill requires detecting login fields on websites the user visits
- Vault decrypt is **client-side** (WASM); server never sees plaintext vault
- User configures their own self-hosted Okkey instance URL; Okkey does not offer a hosted cloud service for the extension
- No remote code execution; all scripts shipped in the package

## 7. After upload

- [ ] Record draft/item IDs from each store console in team notes (not required in-repo)
- [ ] **Do not** create product tags / GitHub Releases on `main` from this packaging pack alone — product release flow stays on `main` (extension packaging here is only `1.0.0.2`)
