# Browser e2e (Playwright)

Minimal Chromium smoke for the password-manager chain called out in
[okkey-enterprise#110](https://github.com/okkeyapp/okkey-enterprise/issues/110)
(qa/web registration → unlock → login item → second device → recovery; extension load fixture).

Existing `yarn test:e2e` remains **API** email-provider tests. Browser suite is
`yarn test:browser`.

## Prerequisites

- Empty users table (first-run bootstrap / OTP skip) — CI uses a fresh Postgres service
- Infra: Postgres + Redis (`yarn infra:up` or compose)
- API with `AUTH_E2E_FIXED_CODE=424242` and `DEPLOY_ENV=dev` (never honored in prod)
- Web at `E2E_BASE_URL` (default `http://127.0.0.1:4173`) with `VITE_API_BASE_URL` pointing at the API

## Local

```bash
yarn install
yarn build:wasm && yarn build:email
# terminal A
AUTH_E2E_FIXED_CODE=424242 EMAIL_PROVIDER=logger yarn dev:api
# terminal B — build + preview (or yarn dev:web on :5173 and set E2E_BASE_URL)
VITE_API_BASE_URL=http://127.0.0.1:4000 yarn build:web
yarn --cwd apps/web preview --host 127.0.0.1 --port 4173
# terminal C
yarn test:browser:install
E2E_BASE_URL=http://127.0.0.1:4173 yarn test:browser
```

Extension scenario (optional):

```bash
yarn build:extension:chromium
E2E_EXTENSION=1 yarn test:browser -- e2e/tests/extension-smoke.spec.ts
```

## CI

Workflow `.github/workflows/browser-e2e.yml` runs on push to `dev`, schedule, and `workflow_dispatch`.
