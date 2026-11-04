# Security model

Okkey encrypts vault items in the browser. The server stores ciphertext, account records, and one share of the account key. The statements below match the v1.0.0-beta.2 code.

An independent security audit has not been done. This release is not production-ready.

## What the browser encrypts

Vault item fields are encrypted in the browser with XChaCha20-Poly1305 before they are sent. The server stores the ciphertext and does not parse the item JSON.

File bytes attached to items are encrypted in the browser with a separate key, then written to object storage (MinIO in the default Compose install). The file key is wrapped for the vault.

The account private key (an Ed25519 signing key and an ML-KEM-768 decapsulation key) is encrypted in the browser before registration. The server stores the ciphertext and the two public keys.

The recovery key wraps the account vault key in the browser. The server stores that wrapped blob and a public possession key derived from the recovery key. The recovery secret is shown in the browser so you can copy it or download a PDF. The server does not store that secret.

Folder names and which item sits in which folder are encrypted in the browser and stored in a personal event log.

The crypto implementations used for these operations live in the Rust engine under `rust/crypto-engine`, and the browser calls them through the WASM build. The engine also includes AES-256-GCM, Argon2id, X25519, and Ed25519.

## What the server stores

The server stores account email, device records, sessions, workspaces, vault membership, and the encrypted blobs above. Item history is an event log of those ciphertext payloads.

It also stores a 32-byte server share of the account key (`server_key_share`) and the Argon2id salt and params version used for the master password. The master password is not sent to the server.

Authenticator app secrets are sealed on the server with a key derived from `SESSION_SECRET`, and the server opens them to check a code. Backup codes are stored as hashes peppered with `SESSION_SECRET`, not as plaintext. These values are account sign-in data. They are separate from vault items.

With `EMAIL_PROVIDER=logger` (the Compose default), one-time email codes are written to the worker logs. With SMTP, your mail server receives those codes. The messages do not include the master password, the recovery key, or vault item plaintext.

**Monitoring** for **Compromised passwords** hashes the password with SHA-1 in the browser and sends the first 5 characters of that hash to Have I Been Pwned (`https://api.pwnedpasswords.com/range`). The full password stays on the device. The screen states this.

Favicon preview defaults to `FAVICON_PROVIDER=direct`. The API then requests icon URLs from the website stored on a login item. Set `FAVICON_PROVIDER=off` in `.env` to stop those requests.

## Keys and unlock

The account vault key is a 32-byte value. It is not stored whole. The browser rebuilds it as the XOR of three 32-byte shares:

- the server share, stored on the server and also copied into this browser's `localStorage`
- the device share, saved in the same `localStorage` entry
- the password share, derived with Argon2id from the **Master password** and the salt stored on the server

The device signing key is a non-extractable WebCrypto key in IndexedDB. The two shares used in the XOR above are the `localStorage` values, not that signing key.

**PIN code** and **Biometric unlock** are unlock methods on this browser. They do not replace the recovery key.

A person who has only the database has the server share and the ciphertext. Rebuilding the vault key from that copy still takes the device share and the master password, or the recovery key.

Local unlock keeps both the server share and the device share in this site's browser data. With the master password, that data rebuilds the vault key on the device, without a new request to the server. The master password strength and the security of the device are what protect that copy.

## Account recovery

Registration ends on **Save your recovery key**. The vault stays blocked until you copy the key or download the PDF. The screen tells you the key is shown once, and that anyone with the key can restore the vault.

**Forgot master password?** can restore the account with that **Recovery key**, including in a browser that has no local vault data. The new browser is registered as a pending device. It receives a one-time challenge and signs that challenge with the possession key derived from the recovery key. The server checks the signature against the stored public possession key. After 5 failed attempts on the session, or 10 on the account, within 15 minutes, further attempts receive HTTP 429 for 15 minutes. The screen says "Too many attempts. Try again later." Restoring rotates the recovery key. You have to save the new one.

**Trusted devices** and **Trusted contacts** are unavailable in the web app. The restore screen says web recovery via a remote trusted device is not available yet, and interactive contact recovery in the web app is not available yet.

If you lose the master password and the recovery key, this server cannot rebuild the vault key.

## Threat model

The protections in this release are aimed at these cases:

- The server, or a person who can read Postgres and MinIO, sees ciphertext for vault items and files, plus the server share, and does not see the master password.
- This browser's site data holds the server share and the device share. With the master password, that copy rebuilds the vault key on the device. The strength of the master password and the security of the device protect it.
- A client that submits a lower crypto version than the vault already uses is rejected.
- A malformed encrypted blob is rejected instead of being stored as a successful write.
- Public capsule links do not carry the decryption key in the URL query string or path. The API refuses that placement.
- Container images for `api`, `worker`, and `web` are signed in the publish workflow. The installer checks those signatures by default. See [install.md](install.md).

The default Compose file publishes the API on `127.0.0.1` only. Other machines reach Okkey through a reverse proxy you configure. The example proxy lives in `deploy/docker/proxy`. Public TLS is configured there.

The default `.env` from the installer sets `DEPLOY_ENV=dev`, `CRYPTO_ALLOWED_PROFILE_VERSIONS=2`, and `CRYPTO_ROLLOUT_MODE=compat`. Only profile 2 is allowed. New registrations use KDF v2.

## What this release does not cover

- An independent security audit has not been done.
- v1.0.0-beta.2 is not production-ready.
- The browser extension is not part of this release.
- The master password can be 4 characters. That is the minimum the registration screen enforces.
- The server can open authenticator secrets, because it seals them with `SESSION_SECRET`.
- A person with access to the host can read `~/okkey/.env`, the database, the object store, and the worker logs.
- **Create vault** for a shared vault, and inviting more members, are unavailable on a default self-hosted server.
- Capsule **Advanced settings** show "Not available on your current plan" on a default self-hosted server.
- **Trusted devices** and **Trusted contacts** are unavailable in the web app. The restore screen says web recovery via a remote trusted device is not available yet, and interactive contact recovery in the web app is not available yet.
- Compromised-password checks contact Have I Been Pwned, as described above.
- Clearing this browser's site data removes the local copies of the server share and the device share. The server still stores the server share. Unlocking again on this browser takes the recovery key, or another browser that still has the site data.
