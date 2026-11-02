# Contributing

Okkey accepts bug fixes, tests, and documentation in this public repository. Pull requests use [Conventional Commits](https://www.conventionalcommits.org/) so release notes can be generated from them. See [CHANGELOG.md](CHANGELOG.md).

Be kind to other people in the project. [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) is the community standard. Report vulnerabilities in private, using [SECURITY.md](SECURITY.md). Do not open a public issue for a vulnerability.

## Local setup

Install the toolchain pinned by the repository:

- Node.js `>=25 <26` (`package.json` `engines`)
- Yarn `1.22.22` (`packageManager` in `package.json`; the `engines` range is `^1.22.0`)
- Rust `1.86.0` with the `wasm32-unknown-unknown` target (`rust-toolchain.toml`)
- Docker, for local Postgres, Redis, and MinIO
- `wasm-pack` `0.13.1` when you build the crypto WASM package (the version used in `.github/workflows/unit-tests.yml`)

Check what is on your `PATH`:

```bash
./scripts/check-env.sh
```

Mobile and desktop app directories are not part of the Yarn workspaces. Skip those checks:

```bash
SKIP_MOBILE=1 SKIP_DESKTOP=1 ./scripts/check-env.sh
```

Install dependencies and copy the env files the processes actually load:

```bash
yarn install --frozen-lockfile
cp .env.example .env
cp services/api/.env.example services/api/.env
cp apps/web/.env.example apps/web/.env
```

Set `OKKEY_SALES_EMAIL` in `services/api/.env` to a real address. The API refuses to start when it is empty. There is no default.

`yarn dev:api` and `yarn dev:worker` load `services/api/.env`. The worker also reads `services/worker/.env` first, when that file exists, as optional overrides. Copy it only when you need an override:

```bash
cp services/worker/.env.example services/worker/.env
```

Start local infrastructure (Postgres, Redis, MinIO) from the root `docker-compose.yml`:

```bash
yarn infra:up
yarn infra:ps
```

The root `.env.example` uses database user `okkey`, password `okkey`, database `okkey`, on port `5432`, and Redis on port `6379`. Those match the defaults in `services/api/src/config.ts`.

Start the apps:

```bash
yarn dev:api
yarn dev:worker
yarn dev:web
```

`yarn dev` starts the API and the web app together. `yarn dev:api` and `yarn dev:worker` run `scripts/ensure-api-dev-deps.mjs` first, which builds the WASM package when it is missing. The first build needs `wasm-pack`.

The web dev server is <http://localhost:5173>. `VITE_API_BASE_URL` in `apps/web/.env.example` is `http://localhost:4000`.

Stop infrastructure with `yarn infra:down`.

If you do not have `psql` or `redis-cli` installed, the repo wrappers talk to the Compose services:

```bash
./scripts/psql --help
./scripts/redis-cli --help
```

The browser extension is in `apps/extension`. It is not part of the v1.0.0-beta.2 container release. Local commands that exist today:

```bash
yarn dev:extension
yarn --cwd apps/extension test
```

## Tests

`yarn test` runs `yarn test:api`, `yarn test:security`, `yarn test:e2e`, and `yarn test:web`.

API tests need Postgres and Redis. Start them with `yarn infra:up` first. `yarn test:api` builds the WASM package, the TypeScript SDK, and the email templates (`yarn build:email`), then runs `services/api/test/*.test.ts`.

```bash
yarn infra:up
yarn test:api
yarn test:e2e
yarn test:security
yarn test:web
yarn check:crypto
```

`yarn check:crypto` runs `cargo test --locked --manifest-path rust/crypto-engine/Cargo.toml`.

Other test commands used in CI (`.github/workflows/unit-tests.yml`):

```bash
yarn build:wasm
yarn build:ts-sdk
yarn build:i18n
yarn --cwd packages/ui build
yarn --cwd packages/import build
yarn --cwd packages/import test
yarn --cwd packages/vault test
yarn --cwd packages/vault-ui test
yarn --cwd packages/ui test
node --test packages/id/test/*.test.mjs
node --test packages/crypto/test/*.test.mjs
```

Browser end-to-end tests:

```bash
yarn test:browser:install
yarn test:browser
```

Supply-chain script tests:

```bash
yarn test:supply-chain
```

Crypto fuzz tests use nightly Rust `nightly-2026-03-20` and `cargo-fuzz` `0.12.0`, as in `.github/workflows/crypto-fuzz-quick.yml`:

```bash
yarn fuzz:crypto:install
yarn fuzz:crypto:quick
```

## Pull requests

Branch from `dev`. Unit tests run on every pull request and on pushes to `dev` (`.github/workflows/unit-tests.yml`).

1. Create a branch from the latest `dev`.
2. Keep the change focused.
3. Add or update tests when you change crypto, access control, or routing.
4. Commit with a Conventional Commit subject in the imperative mood, under 72 characters. Types used in this repository include `feat`, `fix`, `chore`, `docs`, `refactor`, and `test`.
5. Open the pull request against `dev`.
6. Fill in what changed and how you tested it.

Workflows that run on pull requests include `unit-tests`, `security-suite`, `supply-chain`, `crypto-fuzz-quick`, and `browser-e2e`. `browser-e2e` is limited to the branches listed in `.github/workflows/browser-e2e.yml`, which include `dev` and `release/**`.

Do not send master passwords, vault keys, recovery keys, or session tokens in an issue or a pull request.
