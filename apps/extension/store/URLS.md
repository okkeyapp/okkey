# Store URLs — public GitHub (E5 / `1.0.0.2`)

For this beta pack, treat Okkey as a **self-hosted product**. Do **not** require `https://app.okkey.io` (or any SaaS backend) as the privacy/support destination for listing fields.

Reserved SaaS origin `https://app.okkey.io` may appear later as an optional preset in the product UI; it is **not** mandatory for store beta framing.

Privacy and support pages live as Markdown in this repo. Store consoles should use **public GitHub blob URLs** (https, human-readable for reviewers). Paths below are stable after merge; only the branch ref in the URL changes.

## Paste into store consoles (beta → `dev`)

| Field | URL |
|-------|-----|
| **Homepage** | https://github.com/okkeyapp/okkey |
| **Privacy policy** | https://github.com/okkeyapp/okkey/blob/dev/apps/extension/store/PRIVACY.md |
| **Support / help** | https://github.com/okkeyapp/okkey/blob/dev/apps/extension/store/SUPPORT.md |
| **Support (issues)** | https://github.com/okkeyapp/okkey/issues |
| **Author email** | Team store publisher email (per developer account) |

`homepage_url` in the Chromium/Firefox manifest already points at the GitHub repo.

### Until this PR merges into `dev`

The same files are already on the E5 branch (working for review before merge):

| Field | Interim URL |
|-------|-------------|
| **Privacy policy** | https://github.com/okkeyapp/okkey/blob/cursor/extension-e5-store-beta-d49d/apps/extension/store/PRIVACY.md |
| **Support / help** | https://github.com/okkeyapp/okkey/blob/cursor/extension-e5-store-beta-d49d/apps/extension/store/SUPPORT.md |

After merge to `dev`, prefer the `blob/dev/...` URLs above. After promotion to `main`, switch the ref only:

```text
https://github.com/okkeyapp/okkey/blob/main/apps/extension/store/PRIVACY.md
https://github.com/okkeyapp/okkey/blob/main/apps/extension/store/SUPPORT.md
```

### Optional raw links

If a console prefers plain text over GitHub’s HTML blob view:

```text
https://raw.githubusercontent.com/okkeyapp/okkey/dev/apps/extension/store/PRIVACY.md
https://raw.githubusercontent.com/okkeyapp/okkey/dev/apps/extension/store/SUPPORT.md
```

## In-repo sources

| Doc | Path |
|-----|------|
| Privacy | [PRIVACY.md](./PRIVACY.md) |
| Support | [SUPPORT.md](./SUPPORT.md) |

## Listing copy alignment

EN/RU descriptions in [LISTING.en.md](./LISTING.en.md) / [LISTING.ru.md](./LISTING.ru.md) already use self-host / client-side vault language. If a store forces a single “website” field, use the GitHub repo homepage URL above — not a SaaS app URL — until SaaS launch is explicit.
