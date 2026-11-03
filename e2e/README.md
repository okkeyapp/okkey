# Browser e2e (Playwright)

Minimal Chromium smoke for the password-manager chain: registration → unlock →
login item → second device → recovery password rotation → extension PKCE sign-in.

Existing `yarn test:e2e` remains **API** email-provider tests. Browser suite is
`yarn test:browser`.

## Security

OTP for returning-user flows is read from **Mailpit** (real SMTP to the API).
There is **no** fixed-code / env bypass in `createCode()` — production auth code
generation is unchanged by this harness.

## Prerequisites

- Empty users table (first-run bootstrap / OTP skip) — CI uses a fresh Postgres service
- Infra: Postgres + Redis + Mailpit (`SMTP :1025`, HTTP `:8025`)
- API with `EMAIL_PROVIDER=smtp`, `EMAIL_SMTP_HOST=127.0.0.1`, `EMAIL_SMTP_PORT=1025`, `EMAIL_DELIVERY_MODE=sync`
- Web at `E2E_BASE_URL` (default `http://127.0.0.1:4173`) with `VITE_API_BASE_URL` pointing at the API

## Local

```bash
yarn install
# build like apps/web/Dockerfile (vite build — not apps/web `tsc -b`)
yarn build:wasm && yarn build:ts-sdk && yarn build:i18n && yarn build:email-templates
yarn --cwd apps/web vite build

# Mailpit (example)
docker run --rm -p 1025:1025 -p 8025:8025 axllent/mailpit:v1.22.3

# terminal A — API
EMAIL_PROVIDER=smtp EMAIL_SMTP_HOST=127.0.0.1 EMAIL_SMTP_PORT=1025 \
  EMAIL_DELIVERY_MODE=sync yarn dev:api

# terminal B — web preview
yarn --cwd apps/web preview --host 127.0.0.1 --port 4173

# terminal C
yarn test:browser:install
E2E_BASE_URL=http://127.0.0.1:4173 E2E_MAILPIT_URL=http://127.0.0.1:8025 yarn test:browser
```

Extension scenario (test 5 — PKCE → device trust → unlock → item). Build the
extension and set `E2E_EXTENSION=1`. Headed Chromium needs a display; in CI we
use `xvfb-run`:

```bash
yarn build:extension:chromium
E2E_EXTENSION=1 xvfb-run --auto-servernum yarn test:browser
```

Personal-data bootstrap after first unlock opens `#editItem`; the Login create
helper dismisses that dialog — there is no production build flag to skip it.

## CI

Workflow `.github/workflows/browser-e2e.yml` runs on pull requests targeting
`dev`, `release/**`, `hotfix/**`, and `main`, on pushes to `release/**` and
`hotfix/**`, a weekly schedule, and `workflow_dispatch`. Pushes to `dev` and
feature branches do not start it. Web is built like `apps/web/Dockerfile`;
extension is built and exercised under `xvfb-run`.
