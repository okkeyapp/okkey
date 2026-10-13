# Okkey extension — store packaging (E5 beta)

**Product version:** `1.0.0-beta.2`  
**Manifest `version`:** `1.0.0.2`  
**Manifest `version_name` (Chromium):** `1.0.0-beta.2`

This folder is the **ready-to-submit** pack for browser stores. It does **not** submit to stores and does **not** create git tags / GitHub Releases on `main`.

| Doc | Purpose |
|-----|---------|
| [SUBMIT-CHECKLIST.md](./SUBMIT-CHECKLIST.md) | Build zips, load unpacked, upload matrix |
| [PERMISSIONS.md](./PERMISSIONS.md) | Store review justification (autofill / host access) |
| [LISTING.en.md](./LISTING.en.md) | Chrome/Edge/Opera/AMO listing copy (EN) |
| [LISTING.ru.md](./LISTING.ru.md) | Listing copy (RU) — AMO / optional CWS locale |
| [URLS.md](./URLS.md) | Self-host privacy/support URL placeholders |
| [assets/README.md](./assets/README.md) | Screenshots / promotional images checklist |

## Artifact map

| Target | Build / zip | Upload to |
|--------|-------------|-----------|
| Chrome | `yarn zip:extension:chromium` → `apps/extension/output/okkeyextension-1.0.0-beta.2-chrome.zip` | [Chrome Web Store](https://chrome.google.com/webstore/devconsole) |
| Edge | **Same Chromium zip** | [Edge Add-ons](https://partner.microsoft.com/dashboard) |
| Opera | **Same Chromium zip** | [Opera Add-ons](https://addons.opera.com/developer/) |
| Yandex Browser | Install from **CWS** (no separate package) | via Chrome Web Store listing |
| Firefox | `yarn zip:extension:firefox` → `apps/extension/output/okkeyextension-1.0.0.2-firefox.zip` (+ `*-sources.zip` for AMO) | [AMO](https://addons.mozilla.org/developers/) |

Zips are gitignored (`*.zip`, `apps/extension/output/`). Rebuild before each upload.
