# Okkey browser extension — Privacy policy

**Applies to:** Okkey browser extension (Chrome / Edge / Opera / Firefox), version `1.0.0.2` and later store builds.  
**Product:** open-source, self-hosted password manager ([github.com/okkeyapp/okkey](https://github.com/okkeyapp/okkey)).

This notice describes how the **browser extension** handles data. It is written for store review (CWS / Edge / Opera / AMO) and for self-hosted deployments of the open-source Core. It is not a substitute for an organisation’s own privacy policy if that organisation processes personal data of others on a private Okkey instance.

## Who operates the service

In a self-hosted deployment, the organisation or person that installs and runs Okkey is the **service operator**. They choose hosting location, access controls, retention, and how to handle privacy requests. The Okkey software authors are **not** the controller of data on your private instance.

The extension talks only to the **Okkey instance URL you configure**. There is no mandatory connection to a fixed Okkey SaaS backend.

## What the extension processes

Depending on how you use the extension and how the operator configures the instance, processing may include:

- Account identifiers (for example email) used to sign in via your instance’s web login (PKCE)
- Authentication and **trusted-device** metadata
- Encrypted vault payloads synced with your server
- Local preferences (theme, PIN settings, idle lock, server URL profile)
- A local cache of **encrypted** vault data and session handles for the configured instance
- Page URLs and login-form field detection needed for autofill matching (see below)

Exact categories on the server depend on enabled features and the operator’s deployment.

## Vault contents and encryption

Vault item **plaintext** is encrypted on the client before sync. The server is designed to store ciphertext and related metadata — **not** your master password or decrypted vault secrets. Cryptography runs in the extension (including WASM). Anyone with server access may still see encrypted blobs and account metadata; protect the host accordingly.

The master password is **never** written to browser extension storage.

## Autofill and website access

The extension needs access to websites you visit only to:

1. Detect login / register forms
2. Match saved items by website URL scopes you chose
3. Autofill username, password, and TOTP when you unlock the vault and choose a match
4. Optionally offer to save a new or updated login after submit

We do **not** sell browsing data, run third-party ad trackers in the extension package, or execute remote code. All scripts ship in the store package.

## Purposes

Typical purposes are: authentication against your Okkey instance, syncing encrypted vault data, device approval / security features, local unlock, and autofill. The operator of a self-hosted instance sets lawful basis and retention for their users.

## Retention and deletion

- **On your device:** clear by removing the extension, clearing extension storage, or locking/wiping local vault cache per product controls.
- **On the server:** retention is controlled by the operator’s infrastructure and product settings (backups, account deletion). Ask your operator how long logs and account data are kept and how to request deletion.

## Your rights

Depending on applicable law, you may have rights to access, correct, export, or delete personal data, or to object to certain processing. For a self-hosted instance, exercise those rights with the **operator who runs your deployment**.

## Contact

- **Privacy questions about a private instance:** contact the administrator of that Okkey deployment.
- **Project / open-source questions:** [GitHub Issues](https://github.com/okkeyapp/okkey/issues) or the support page linked from the store listing ([SUPPORT.md](./SUPPORT.md)).

## Document location

Canonical file in the public repository:

`apps/extension/store/PRIVACY.md`
