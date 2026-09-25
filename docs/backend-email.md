# Backend email templates and delivery (Core API)

Transactional email uses:

1. **`@okkey/i18n`** — ICU MessageFormat strings in `packages/i18n/src/locales/email/{en,ru}.json` (no HTML in translations; namespaced keys `email.*`).
2. **`@okkey/email-templates`** — React Email components and render pipeline (`renderEmailTemplate` → `subject`, `html`, `text`).
3. **`services/api`** — locale resolution, transport (`logger` / `smtp` / `ses` / `http-api`), feature hooks.

## Environment

| Variable | Purpose |
|----------|---------|
| `EMAIL_FROM` | `From` header |
| `EMAIL_DEFAULT_LOCALE` | Instance default when user/header/body do not specify a language (`en` or `ru`) |
| `EMAIL_PROVIDER` | `logger` \| `smtp` \| `ses` \| `http-api` |
| `PUBLIC_APP_URL` | Base URL for invite and other CTA links (required to send workspace invites) |
| `OKKEY_SALES_EMAIL` | Sales inbox for `POST /workspaces/:id/plan-change-requests` (manual plan upgrades). Default: `aleksandr-zoryn@ya.ru` in development/test, `hello@okkey.io` otherwise. SaaS operators typically set this in `okkey-enterprise/backend/.env`. |

See `services/api/.env.example` for SMTP, SES, and HTTP API variables and commented presets (Yandex / Mail.ru / Gmail SMTP, AWS SES, Yandex Cloud Postbox).

**Transports are protocols, not vendors.** Personal mailboxes and Unisender Go / Postmark / Resend / OVH all use `smtp`. AWS SES and SES-compatible APIs (including Yandex Cloud Postbox) use `ses` with a replaceable `EMAIL_SES_ENDPOINT`. Do not put a vendor mailbox password in production SaaS env; prefer transactional SMTP or SES.

Personal SMTP risks: provider rate limits, spam folders, account blocks, mailbox password in `.env`. Fine for a single self-hosted user; not for a team product.

## Locale selection

For a given recipient and request:

1. `users.locale` when set (`en` / `ru`)
2. Explicit JSON field where the API defines it (e.g. `locale` on email login start/resend)
3. `Accept-Language` on the incoming HTTP request
4. `EMAIL_DEFAULT_LOCALE`
5. Fallback `en`

## Developer workflow

- **Preview only (no API):** from repo root run `yarn dev:email` — React Email dev server on port **3030** for files under `packages/email-templates/emails/`.
- **Build packages:** `yarn build:email` (compiles `@okkey/i18n` then `@okkey/email-templates`). Required before `yarn dev:api` and `yarn test:api` (both run `build:email` first).
- **Change copy:** edit `packages/i18n/src/locales/email/en.json` and `ru.json` (ICU). Change layout/styles: `packages/email-templates/src/components/*.tsx`.
- **Tests:** `email.qa.fallbackProbeOnlyInEn` is intentionally present **only** in `en.json` (fallback coverage). If you add a Russian string for that key, update the corresponding unit test expectation in `services/api/test/email.catalog.test.ts`.

## Adding a template

1. Add ICU keys under `email.*` in both locale files.
2. Add a React component under `packages/email-templates/src/components/`.
3. Add a branch in `packages/email-templates/src/pipeline.tsx` and bump `EMAIL_TEMPLATE_VERSIONS` in `versions.ts`.
4. Add a preview file in `packages/email-templates/emails/*.tsx`.
5. Wire `EmailTemplateService` in `services/api/src/email/service.ts` if it is a new product template.

## Error codes (internal / logs)

| Code | Meaning |
|------|---------|
| `EMAIL_TEMPLATE_NOT_FOUND` | (reserved; unknown id) |
| `EMAIL_TEMPLATE_MISSING_VARIABLE` | Required variable missing or empty |
| `EMAIL_RENDER_FAILED` | Render/ICU failure |
| `EMAIL_SEND_FAILED` | Transport failed after successful render |
| `EMAIL_TRANSPORT_ERROR` | Low-level SMTP/API failure |

2FA notices use best-effort send helpers: API success does not depend on mail delivery.

## API action → email (Core v1)

Transactional mail is sent from `EmailTemplateService` when the corresponding API path or service method runs. Use this matrix when tracing a full login / device / 2FA flow.

| Trigger | Template id (catalog) | Notes |
|--------|------------------------|--------|
| `POST /auth/email/start`, `POST /auth/email/resend` | `auth_email_code` | Login / registration challenge; **never** includes TOTP secrets or backup codes. |
| `POST /devices/register` → `pending_approval` | `device_approval_request` | Best-effort async send; locale from user + `Accept-Language` / body. |
| `POST /auth/two-factor/totp/enroll/confirm` (success) | `two_factor_enabled` | Best-effort (`sendTwoFactorEnabledBestEffort`). |
| `POST /auth/two-factor/backup-codes/regenerate` (success) | `two_factor_backup_codes_regenerated` | Best-effort (`sendTwoFactorBackupCodesRegeneratedBestEffort`). |
| Enterprise `POST /workspaces/:workspaceId/invitations` | `workspace_invite` | Requires `PUBLIC_APP_URL` and a real transport; missing config → `EMAIL_NOT_CONFIGURED` (503). Send failure deletes the pending row → `EMAIL_SEND_FAILED` (503). CTA is `{PUBLIC_APP_URL}/invite/:token`. |
| `POST /workspaces/:workspaceId/plan-change-requests` | `plan_change_request` | Sent to `OKKEY_SALES_EMAIL` (not the requester). Manual fulfillment only; does not change `plan_tier`. |

`POST /auth/register/complete` does **not** send email by itself; the user already proved email ownership via the challenge tied to `auth_state_id`.

## Related paths

- `packages/i18n/` — locales + `formatEmailMessage`
- `packages/email-templates/` — React Email + `renderEmailTemplate`
- `services/api/src/email/` — transport, `EmailTemplateService`, locale helpers
- `docs/architecture/06_backend_architecture.md` — backend overview
