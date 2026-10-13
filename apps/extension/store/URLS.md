# Store URLs — self-host mindset (E5 beta)

For this beta pack, treat Okkey as a **self-hosted product**. Do **not** require `https://app.okkey.io` (or any SaaS backend) as the privacy/support destination for listing fields.

Reserved SaaS origin `https://app.okkey.io` may appear later as an optional preset in the product UI; it is **not** mandatory for store beta framing.

## What to put in store consoles today

| Field | Recommended value for beta | Notes |
|-------|----------------------------|--------|
| **Homepage** | `https://github.com/okkeyapp/okkey` | Already set as `homepage_url` in the Chromium/Firefox manifest |
| **Support / help** | Self-hosted docs URL **or** GitHub Issues | See placeholders below |
| **Privacy policy** | Policy page on **your** public docs / landing | Must be https; stores reject missing/broken policies |
| **Author email** | Team store publisher email | Per developer account |

## Placeholders to replace before real submit

Substitute the tokens when the team has stable public pages:

```text
PRIVACY_POLICY_URL   →  https://<your-public-docs-host>/privacy
SUPPORT_URL          →  https://<your-public-docs-host>/support
                        or https://github.com/okkeyapp/okkey/issues
HOMEPAGE_URL         →  https://github.com/okkeyapp/okkey
                        (or future marketing site — still self-host product story)
```

### Suggested interim (if no marketing site yet)

1. **Privacy:** publish a short static privacy page (GitHub Pages / docs site) that states:
   - vault plaintext never leaves the client;
   - extension talks only to the Okkey instance URL the user configures;
   - no sale of personal data;
   - contact email for privacy requests.
2. **Support:** GitHub Issues on `okkeyapp/okkey` **or** the same docs host `/support`.
3. Keep listing copy emphasizing **bring your own server** (Docker / self-host), not “sign up at app.okkey.io”.

## Listing copy alignment

EN/RU descriptions in [LISTING.en.md](./LISTING.en.md) / [LISTING.ru.md](./LISTING.ru.md) already use self-host / client-side vault language. If a store forces a single “website” field, prefer the GitHub repo or docs host over a SaaS app URL until SaaS launch is explicit.
