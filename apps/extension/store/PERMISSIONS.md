# Permissions justification — Okkey extension (store review)

**Version:** `1.0.0-beta.2` (`manifest` `1.0.0.2`)  
**Single purpose:** A password manager that unlocks a client-side encrypted vault and autofills credentials the user saved for websites they visit, against a **user-configured self-hosted** Okkey instance.

Paste the blocks below into CWS / Edge / Opera / AMO permission or “single purpose” fields. Adapt wording slightly per console limits; keep facts identical.

---

## Short reviewer blurb (EN)

Okkey is a self-hosted password manager extension. Users set their own Okkey web/API base URL, sign in via the instance’s web login (PKCE), approve the extension as a trusted device, then unlock the vault locally with their master password. Autofill detects login forms on http(s) pages and fills username, password, and TOTP only for items the user saved with matching website URLs. Cryptography runs in the extension (WASM); the server never receives vault plaintext. We do not execute remote code. Host access is required to detect forms and fill on arbitrary sites the user browses — the same model as other password managers.

---

## Manifest permissions

| Permission | Why we need it |
|------------|----------------|
| `storage` | Persist server URL profile, encrypted vault cache, device prefs (theme/PIN), session handles. Master password is **never** written to storage. |
| `tabs` | Know the active tab URL for autofill matching, open the self-hosted web app for login/edit deep links, and coordinate save-password prompts after navigation. |
| `idle` | Lock the unlocked vault when the device goes idle/locked (user-configurable idle timeout), without locking merely because the popup closed. |
| Host permission `<all_urls>` | Content scripts must run on arbitrary http(s) origins to **detect login/register forms** and **autofill** credentials the user explicitly saved for those sites. Password managers cannot limit hosts to a fixed allowlist. |

### Host permission / autofill — detailed justification (EN)

**What we access:** DOM of pages the user navigates to (login form fields only for detection/fill UX), plus the page URL for matching against saved item website URLs (`entire-site` / `exact-url` / `none`).

**What we do with it:**

1. Detect username, password, and OTP/TOTP fields (including common register vs login patterns).
2. Show an on-page suggestion UI for matching vault items after the user unlocks Okkey.
3. Fill chosen credentials into the focused form; optionally offer to save a new/updated login after submit.
4. Match uses only website URLs the user attached to login items — scopes include “do not autofill”.

**What we do *not* do:**

- No keylogging, no scraping of unrelated page content for ads/analytics.
- No selling browsing data.
- No injecting or evaluating remote scripts; all code ships in the store package.
- No mandatory connection to `app.okkey.io`; the user points the extension at **their** Okkey deployment (self-host / localhost for development).

**Why `<all_urls>` instead of optional hosts only:** Autofill must work on first visit to sites the user already saved. Requiring a per-origin click-grant before every new site breaks the core password-manager UX. This matches industry practice (Bitwarden, 1Password, etc.).

### Chromium CSP note

`wasm-unsafe-eval` is required to instantiate the local crypto WASM module for vault unlock. This is not remote code execution.

---

## Firefox / AMO data practices (summary)

- **Data collected by the extension locally:** vault ciphertext cache, preferences, auth session tokens for the configured instance.
- **Data transmitted:** only to the **user-configured** Okkey server URL (sync, device registration, encrypted item blobs). Not to a fixed Okkey SaaS unless the user enters that URL themselves.
- **Does not sell data / no third-party ad trackers** in the extension package.

When AMO asks for a privacy policy URL, use the self-host placeholder policy page documented in [URLS.md](./URLS.md).

---

## RU — краткое обоснование (для локали / внутренней вставки)

Okkey — менеджер паролей с **self-hosted** инстансом. Пользователь указывает URL своего сервера, входит через web (PKCE), подтверждает устройство, разблокирует сейф локально мастер-паролем. Автозаполнение определяет формы входа на сайтах и подставляет логин/пароль/TOTP только для записей с подходящим «Вебсайт URL». Расшифровка только на клиенте (WASM); сервер не видит plaintext. Удалённый код не выполняется. Доступ к сайтам (`<all_urls>`) нужен для детекта форм и autofill — как у других password manager’ов.
