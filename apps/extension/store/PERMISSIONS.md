# Permissions justification — Okkey extension (store review)

**Version:** `1.0.0.1000`  

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
| `idle` | Lock the unlocked vault when the OS locks / device sleeps (`chrome.idle`), including while the popup is closed. |
| `alarms` | Run vault idle-lock and clipboard auto-clear timers in the service worker after the popup is closed. |
| `offscreen` | **Chromium only.** Clear the system clipboard from an offscreen document after the configured timeout (MV3 service workers cannot use the Clipboard API). **Omitted on Firefox** — Firefox has no `offscreen` API; the same clear runs via `navigator.clipboard` in the background script (`extensionVaultLifecycle`). |
| `clipboardRead` / `clipboardWrite` | Read/clear the clipboard only to remove values the user copied from Okkey vault fields (matched by an internal copy token + exact text). Ordinary copies outside Okkey are not cleared. |
| `webRequest` | Observe HTTP authentication challenges (`onAuthRequired` only) so the user can choose a vault login for that origin. Both Chromium and Firefox. |
| `webRequestAuthProvider` | **Chromium only.** Required to answer `onAuthRequired` asynchronously in Manifest V3 (`asyncBlocking`). Not declared on Firefox. |
| `webRequestBlocking` | **Firefox only.** Lets `onAuthRequired` return credentials asynchronously with a Promise under Firefox MV3. Not declared on Chromium. |
| Host permission `<all_urls>` | Content scripts must run on arbitrary http(s) origins to **detect login/register forms** and **autofill** credentials the user explicitly saved for those sites. The same host access lets `onAuthRequired` see challenges on those origins. Password managers cannot limit hosts to a fixed allowlist. |

### HTTP basic authentication — reviewer note (EN)

Okkey can answer an HTTP basic authentication challenge with a vault login, and only after the user turns the feature on (it is off by default) and confirms that specific challenge. The confirmation shows the requesting origin and the matching saved login. `http://` challenges add a second confirmation because the password would travel in cleartext. There is no silent fill and no “always for this site” choice. A repeat challenge asks again.

Chromium declares `webRequest` and `webRequestAuthProvider` and responds with `asyncBlocking`. Firefox declares `webRequest` and `webRequestBlocking` and returns a Promise from a `blocking` listener. Firefox has supported `webRequestBlocking` in Manifest V3 for the whole range of our `strict_min_version` (`121.0`). `webRequestAuthProvider` exists from Firefox 126 and `asyncBlocking` from Firefox 128, so the Firefox package does not declare `webRequestAuthProvider` and does not depend on `asyncBlocking`. Chromium does not declare `webRequestBlocking`.

**What we do not do with these permissions:** the extension does not read all requests, does not read request or response bodies, does not observe the Authorization header, and does not answer without confirmation. While the setting is off, Okkey supplies no credentials and the browser shows its own dialog.

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
- User configures their own self-hosted Okkey instance URL; Okkey does not offer a hosted cloud service for the extension (localhost is fine for development).

**Why `<all_urls>` instead of optional hosts only:** Autofill must work on first visit to sites the user already saved. Requiring a per-origin click-grant before every new site breaks the core password-manager UX. This matches industry practice (Bitwarden, 1Password, etc.).

### Chromium CSP note

`wasm-unsafe-eval` is required to instantiate the local crypto WASM module for vault unlock. This is not remote code execution.

---

## Firefox / AMO data practices (summary)

- **Data collected by the extension locally:** vault ciphertext cache, preferences, auth session tokens for the configured instance.
- **Data transmitted:** only to the **user-configured** Okkey server URL (sync, device registration, encrypted item blobs). User configures their own self-hosted Okkey instance URL; Okkey does not offer a hosted cloud service for the extension.
- **Does not sell data / no third-party ad trackers** in the extension package.

When AMO asks for a privacy policy URL, use the public GitHub URL documented in [URLS.md](./URLS.md) ([PRIVACY.md](./PRIVACY.md)).

### `data_collection_permissions` (manifest / gecko)

New AMO submissions require `browser_specific_settings.gecko.data_collection_permissions` (linter: `MISSING_DATA_COLLECTION_PERMISSIONS`). Okkey declares:

```json
"data_collection_permissions": {
  "required": ["authenticationInfo", "browsingActivity", "websiteContent"]
}
```

| Type | Why |
|------|-----|
| `authenticationInfo` | Sign-in / device registration / vault unlock against the user-configured instance; encrypted credential blobs sync to that server. |
| `browsingActivity` | Active tab URL is used to match saved login website URLs for autofill suggestions. |
| `websiteContent` | Content scripts read login/register form fields on pages the user visits in order to detect and fill. |

Not declared: third-party analytics, ad trackers, or Okkey-operated cloud. All network I/O goes to the **user-set** Server URL.

`strict_min_version` remains `121.0` (MV3 / API floor). Firefox 140+ shows the built-in data-collection consent UI; on 121–139 reviewers / users still see this document + [PRIVACY.md](./PRIVACY.md).

### Firefox web-ext lint triage

| Code | Severity | Disposition |
|------|----------|-------------|
| `MISSING_DATA_COLLECTION_PERMISSIONS` | error (submit blocker) | **Fixed** — see gecko `data_collection_permissions` above. |
| Unsupported `offscreen` permission | warning/error on Firefox | **Fixed** — `offscreen` is Chromium-only in `wxt.config.ts`. |
| `webRequestBlocking` on Firefox MV3 | — | **Accepted.** Firefox MV3 still allows `webRequestBlocking` so `onAuthRequired` can return a Promise. The Firefox build declares it; the Chromium build does not (Chrome MV3 would reject it for a regular extension). `webRequestAuthProvider` is omitted on Firefox because this package's floor is Firefox 121 and that permission starts at 126. `web-ext lint` reports 0 errors from these permissions. |
| `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION` | warning | **Accepted.** `data_collection_permissions` exists from Firefox 140, and `strict_min_version` stays `121.0` (MV3 / API floor, above). Firefox 121–139 ignore the unknown key. On those versions the consent copy is this document plus [PRIVACY.md](./PRIVACY.md), not the built-in Firefox 140 UI. Raising the floor to 140 only to clear the warning would drop supported browsers. |
| `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` | warning | **Accepted.** The same key needs Firefox for Android 142. With no `gecko_android` override, `gecko.strict_min_version` is also the Android floor, so the linter warns that 121 predates Android support for the key. The desktop API floor stays 121; we do not add an Android-only minimum just to silence the warning. |
| `UNSAFE_VAR_ASSIGNMENT` | warning | **Keep with justification** — content-script / generator overlays assign to `innerHTML` / `insertAdjacentHTML` inside an extension **shadow DOM**. Dynamic user strings go through `escapeHtml`; markup templates and SVG icon snippets are extension-controlled constants (not remote HTML). No page-origin HTML is assigned into the overlay. Refactoring every assignment to pure DOM APIs is out of scope for this pack; treat remaining hits as reviewed false positives for XSS. |

Sources rebuild: [SOURCES.md](./SOURCES.md).

---

## RU — краткое обоснование (для локали / внутренней вставки)

Okkey — менеджер паролей с **self-hosted** инстансом. Пользователь указывает URL своего сервера, входит через web (PKCE), подтверждает устройство, разблокирует сейф локально мастер-паролем. Автозаполнение определяет формы входа на сайтах и подставляет логин/пароль/TOTP только для записей с подходящим «Вебсайт URL». Расшифровка только на клиенте (WASM); сервер не видит plaintext. Удалённый код не выполняется. Доступ к сайтам (`<all_urls>`) нужен для детекта форм и autofill — как у других password manager’ов.
