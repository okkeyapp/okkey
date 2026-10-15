# Store URLs — privacy, support, homepage

This file tells the store publisher **exactly what to paste** into Chrome Web Store / Edge / Opera / AMO fields, and how to substitute self-hosted instance placeholders before a real submit.

The extension is a **self-hosted product client**: it talks only to the Okkey instance URL the user configures. Do **not** use a SaaS app origin as the privacy or support destination for listing fields.

## Official open-source listing (default paste)

For the public Okkey extension pack in this repository, paste these **final** URLs as-is. No token left after paste.

| Field | Value |
|-------|-------|
| **Homepage** | https://github.com/okkeyapp/okkey |
| **Privacy policy** | https://github.com/okkeyapp/okkey/blob/dev/apps/extension/store/PRIVACY.md |
| **Support / help** | https://github.com/okkeyapp/okkey/blob/dev/apps/extension/store/SUPPORT.md |
| **Support (issues)** | https://github.com/okkeyapp/okkey/issues |
| **Author email** | hello@okkey.app |

**Who substitutes / pastes:** the team member uploading the official listing.  
**When:** at store-console submit time (CWS / Edge / Opera / AMO).  
`homepage_url` in the Chromium/Firefox manifest already points at the GitHub repo.

After promotion of these docs to `main`, switch only the branch ref in the blob URLs:

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

## Self-hosted instance placeholders

Use this block when privacy/support must describe **a specific Okkey deployment** (operator’s instance), not the open-source project pages above. Core ships a privacy page at `/legal/privacy-policy` on the web origin.

```text
INSTANCE_ORIGIN       →  https://<your-okkey-web-origin>     # no trailing slash; same origin users put in Server URL
PRIVACY_POLICY_URL    →  {INSTANCE_ORIGIN}/legal/privacy-policy
SUPPORT_URL           →  {INSTANCE_ORIGIN}/…                 # operator help page, or mailto:<operator-support>
AUTHOR_EMAIL          →  <operator store-publisher inbox>    # real mailbox for the developer account
```

### Substitution rule (do this before submit)

1. Set `INSTANCE_ORIGIN` to the public `https` origin of that deployment’s web app (the Server URL origin).
2. Replace `PRIVACY_POLICY_URL` with `{INSTANCE_ORIGIN}/legal/privacy-policy`. Open it and confirm the page loads.
3. Replace `SUPPORT_URL` with a real operator help URL or `mailto:` contact for that instance. Do not leave `{INSTANCE_ORIGIN}/…` or an empty field.
4. Replace `AUTHOR_EMAIL` with the mailbox of the person/account that owns the store listing for that pack.
5. Paste the substituted final URLs into the store form. After substitution there must be **no** `{…}` tokens, `example.com`, `TODO`, or empty required fields.

**Who substitutes:** the operator (or publisher) of that instance, at submit time for their listing.  
**Official OSS pack:** keep the GitHub defaults in the table above; do not invent a SaaS privacy URL.

Privacy and support for a private instance belong to **that instance’s operator**. The open-source GitHub pages describe the extension package and project contacts; they are not a substitute for an organisation’s own policy if it processes personal data of others.

## In-repo sources

| Doc | Path |
|-----|------|
| Privacy | [PRIVACY.md](./PRIVACY.md) |
| Support | [SUPPORT.md](./SUPPORT.md) |

## Listing copy alignment

EN/RU descriptions in [LISTING.en.md](./LISTING.en.md) / [LISTING.ru.md](./LISTING.ru.md) already use self-host / client-side vault language. If a store forces a single “website” field, use the GitHub repo homepage URL above — not a SaaS app URL.
