# Extension store — submit checklist

Ready-to-submit pack for **Okkey extension `1.0.0.2`**. This folder documents packaging and console fields only. It does **not** create product tags or GitHub Releases on `main`.

## Publication status

| Store | Package | Status |
|-------|---------|--------|
| **Chrome Web Store** | Chromium zip | Ready to rehearse (build → upload → paste listing) |
| **Edge Add-ons** | Same Chromium zip | Ready to rehearse |
| **Opera Add-ons** | Same Chromium zip | Optional Chromium mirror (P1) |
| **Firefox AMO** | Firefox zip + sources | **Blocked** until a verified Firefox build exists (see [AMO](#5-firefox-amo--blocked)) |
| **Yandex Browser** | — | No separate package — users install from **CWS** (and/or Opera) |

**Listing screenshots — publication blocked.** Files under [assets/](./assets/) are **layout mockups**, not live product captures. Stores require screenshots that accurately show the extension UI. Do **not** submit for review (or treat the upload step as publish-ready) until those PNGs are replaced with EN captures from a self-hosted demo (see [assets/README.md](./assets/README.md)). Rehearsal of other console fields may continue.

Self-host framing only (FREE / ENTERPRISE on the user’s instance). Do **not** promise a hosted Okkey cloud service in any store form.

## 0. Preflight (all stores)

- [ ] Tip of branch includes current `origin/dev`
- [ ] `apps/extension/package.json` → `"version": "1.0.0"` (workspace SemVer; **not** `1.0.0.2`)
- [ ] `wxt.config.ts` / built manifest → `"version": "1.0.0.2"` (no Chromium `version_name`, no `*-beta.*`)
- [ ] Listing copy reviewed: [LISTING.en.md](./LISTING.en.md) / [LISTING.ru.md](./LISTING.ru.md)
- [ ] Permissions text ready: [PERMISSIONS.md](./PERMISSIONS.md)
- [ ] Privacy / support URLs: [URLS.md](./URLS.md) (official GitHub paste, or substituted instance placeholders)
- [ ] Screenshots / promo tiles under [assets/](./assets/) are **live product captures** (EN UI from a self-hosted stand) — current mockups **block real publish** (see [assets/README.md](./assets/README.md))
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

Confirm version inside the zip:

```bash
unzip -p apps/extension/output/*chrome*.zip manifest.json | python3 -c "import sys,json; m=json.load(sys.stdin); print(m['version'], m.get('version_name'))"
```

Expect: `1.0.0.2` and **no** `version_name`.

### Local load (Chromium — Chrome / Edge / Opera / Brave / Yandex)

1. `yarn build:extension:chromium` → `apps/extension/output/chrome-mv3`
2. `chrome://extensions` (or `edge://extensions` / Opera / Yandex equivalents)
3. Enable **Developer mode** → **Load unpacked** → select `chrome-mv3`
4. Point Server URL at your self-hosted web origin → sign-in → device approve → unlock → autofill smoke

Store-shaped zip: unpack `*chrome*.zip` and Load unpacked, or upload the zip in the store console when it accepts packages directly.

## 2. Chrome Web Store — steps

Do these in order in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

1. [ ] Create or open the Okkey item (draft is fine for rehearsal).
2. [ ] Upload package: `apps/extension/output/okkeyextension-1.0.0.2-chrome.zip`.
3. [ ] Paste short + detailed description from [LISTING.en.md](./LISTING.en.md) (optional RU locale from [LISTING.ru.md](./LISTING.ru.md)).
4. [ ] Paste single-purpose / host-access justification from [PERMISSIONS.md](./PERMISSIONS.md).
5. [ ] Paste privacy policy URL + support URL from [URLS.md](./URLS.md).
6. [ ] Upload screenshots and small promo tile from [assets/](./assets/) — **publish blocker:** live captures only; mockups are for field rehearsal, not store review.
7. [ ] Set category (Productivity / Privacy & Security as available).
8. [ ] Paste reviewer notes (section [Reviewer notes](#6-reviewer-notes)).
9. [ ] Save draft / submit for review only when intentionally publishing **and** screenshot blocker is cleared (rehearsal stops before final publish if no account).

## 3. Edge Add-ons — steps

Do these in order in the [Partner Center](https://partner.microsoft.com/dashboard) Edge Add-ons flow. Reuse the **same** Chromium zip and EN listing.

1. [ ] Create or open the Okkey Edge listing (draft is fine for rehearsal).
2. [ ] Upload package: `apps/extension/output/okkeyextension-1.0.0.2-chrome.zip` (same file as CWS).
3. [ ] Paste short + detailed description from [LISTING.en.md](./LISTING.en.md).
4. [ ] Paste permission justification from [PERMISSIONS.md](./PERMISSIONS.md).
5. [ ] Paste privacy policy URL + support URL from [URLS.md](./URLS.md).
6. [ ] Upload screenshots from [assets/](./assets/) (Edge does not require the CWS small promo tile) — **publish blocker:** live captures only; mockups are for field rehearsal, not store review.
7. [ ] Set category as available in the Edge console.
8. [ ] Save draft / submit for review only when intentionally publishing **and** screenshot blocker is cleared.

Optional: mirror store metadata from the CWS listing where Partner Center allows import.

## 4. Opera Add-ons — optional Chromium mirror

Same Chromium zip as CWS/Edge. Paste EN listing, permissions, URLs, and screenshots the same way (same **live-capture** screenshot rule as CWS/Edge). Helps Yandex users who prefer Opera Add-ons as a fallback to CWS.

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

2. [ ] Confirm gecko id / version:

```bash
unzip -p apps/extension/output/*firefox*.zip manifest.json | python3 -c "import sys,json; m=json.load(sys.stdin); print(m['version'], m.get('browser_specific_settings'))"
```

Expect: `1.0.0.2`, gecko id `extension@okkey.io`.

3. [ ] Local smoke: Load Temporary Add-on from `firefox-mv3/manifest.json`; same self-host smoke as Chromium.
4. [ ] Lint: `npx web-ext lint --source-dir apps/extension/output/firefox-mv3` — fix or document every warning; **no errors**.
5. [ ] In [AMO Developer Hub](https://addons.mozilla.org/developers/): upload `*-firefox.zip` (+ sources when requested).
6. [ ] Paste EN listing ([LISTING.en.md](./LISTING.en.md)); optional RU ([LISTING.ru.md](./LISTING.ru.md)).
7. [ ] Paste permissions justification ([PERMISSIONS.md](./PERMISSIONS.md)).
8. [ ] Paste privacy / support URLs ([URLS.md](./URLS.md)).
9. [ ] Upload at least one screenshot from [assets/](./assets/) — **publish blocker:** live captures only; mockups are for field rehearsal, not store review.
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
