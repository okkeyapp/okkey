# Store listing — English (`1.0.0.2`)

Use for Chrome Web Store, Edge Add-ons, Opera Add-ons, and Firefox AMO.  
**This release requires EN and RU** — Russian: [LISTING.ru.md](./LISTING.ru.md). Locale console steps: [LOCALES.md](./LOCALES.md).

Package short string (`_locales/en` → `extDescription`) must stay in sync with **Short description** below.

## Name

```text
Okkey
```

## Short description

**Limit ~132 characters (CWS / manifest short field).**

```text
Self-hosted password manager: client-side vault, Q-day ready crypto, secure autofill.
```

Alternate (≤132):

```text
Q-day ready, self-hosted password manager with client-side encryption, autofill, and TOTP.
```

## Detailed description

**Edge Add-ons:** description per language must be **≥250** and ≤10 000 characters (this block qualifies).

```text
Okkey is a self-hosted password manager built for maximum client-side protection — including cryptography designed with a post-quantum (Q-day) threat model in mind.

You run Okkey on your own infrastructure. The browser extension connects to the Okkey instance URL you configure (self-hosted or local). Your vault syncs with your server, and decryption happens on your device.

Why Okkey
• Client-side vault — secrets are decrypted in the extension, not on the server
• Post-quantum ready crypto — engineered for long-term confidentiality as quantum threats emerge
• Self-host first — bring your own Okkey deployment; you control where encrypted data lives
• Autofill done right — fill saved records of any type (logins, passwords, TOTP, and other fields), with save/update prompts and per-URL scopes (entire site / exact URL / never)
• Trusted devices — the extension registers as a device and waits for approval from a device you already trust
• Local unlock — master password, optional PIN, or biometrics unlock the vault only inside the extension after sign-in

How sign-in works
1. Enter your Okkey web base URL
2. Sign in through your instance’s web login — SSO/2FA stay on the web app
3. Approve the new extension device from a trusted device
4. Unlock locally and autofill on the sites you choose

Privacy & permissions
Okkey needs access to websites you visit only to detect login forms and autofill credentials you saved. We do not sell browsing data and we do not run remote code. See the privacy policy linked on this listing and the open-source repository for details.

Open source core: https://github.com/okkeyapp/okkey

Extension build: 1.0.0.2.
```

## Category / tags (suggestions)

- Productivity / Privacy & Security  
- Tags: password manager, autofill, self-hosted, encryption, 2FA, TOTP, privacy

## Screenshot captions (optional; for AMO / Edge)

1. Unlocked vault popup — browse and open saved items  
2. Autofill suggestions on a login form  
3. Server URL — connect the extension to your Okkey instance  
4. Local unlock with master password  
