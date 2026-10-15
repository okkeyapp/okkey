# Okkey extension — store packaging (E5)

**Extension / store version:** `1.0.0.2`  
**Manifest `version`:** `1.0.0.2`  
**`apps/extension/package.json`:** `1.0.0` (Yarn workspace SemVer — four-part `1.0.0.N` is invalid there)

Store packaging uses **Chrome / Edge / AMO numeric** `1.0.0.N` only. Do **not** put product SemVer with a beta string (`1.0.0-beta.2`) in `manifest.version`, `version_name`, listing version fields, or zip filenames. No Chromium `version_name`.

This folder is the **ready-to-submit** pack for browser stores. It does **not** submit to stores and does **not** create git tags / GitHub Releases on `main`.

| Doc | Purpose |
|-----|---------|
| [SUBMIT-CHECKLIST.md](./SUBMIT-CHECKLIST.md) | Per-store submit steps (CWS / Edge / AMO); AMO blocked until Firefox verified |
| [PERMISSIONS.md](./PERMISSIONS.md) | Store review justification (autofill / host access) |
| [LISTING.en.md](./LISTING.en.md) | Chrome/Edge/Opera/AMO listing copy (EN) |
| [LISTING.ru.md](./LISTING.ru.md) | Listing copy (RU) — AMO / optional CWS locale |
| [URLS.md](./URLS.md) | Store privacy / support / homepage URLs + self-host placeholders |
| [PRIVACY.md](./PRIVACY.md) | Privacy policy (linked from store consoles via GitHub) |
| [SUPPORT.md](./SUPPORT.md) | Support page (linked from store consoles via GitHub) |
| [assets/README.md](./assets/README.md) | Screenshots / promotional images checklist |

## Artifact map

| Target | Build / zip | Upload to |
|--------|-------------|-----------|
| Chrome | `yarn zip:extension:chromium` → `apps/extension/output/okkeyextension-1.0.0.2-chrome.zip` | [Chrome Web Store](https://chrome.google.com/webstore/devconsole) |
| Edge | **Same Chromium zip** | [Edge Add-ons](https://partner.microsoft.com/dashboard) |
| Opera | **Same Chromium zip** | [Opera Add-ons](https://addons.opera.com/developer/) |
| Yandex Browser | Install from **CWS** (no separate package) | via Chrome Web Store listing |
| Firefox | `yarn zip:extension:firefox` → `apps/extension/output/okkeyextension-1.0.0.2-firefox.zip` (+ `*-sources.zip` for AMO) | [AMO](https://addons.mozilla.org/developers/) — **blocked** until Firefox package verified (see checklist) |

Zips are gitignored (`*.zip`, `apps/extension/output/`). Rebuild before each upload.
