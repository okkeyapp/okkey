# Okkey Web (`@okkey/web`)

SPA on **Vite + React + TypeScript**. Core HTTP API runs separately (`yarn dev:api` from the monorepo root).

## Requirements

- Node.js and Yarn as in the [root `package.json`](../package.json) `engines` field.

## Setup

From the monorepo root (`okkey/`):

```sh
yarn install
cp apps/web/.env.example apps/web/.env   # optional; defaults work for many dev flows
```

## Scripts (from monorepo root)

| Command        | Description                    |
|----------------|--------------------------------|
| `yarn dev:web` | Vite dev server (port **5173**) |
| `yarn build:web` | Production build → `dist/` |
| `yarn test:web` | Unit/component tests (Vitest) |

From `apps/web/` you can run `yarn dev`, `yarn build`, `yarn test`, `yarn test:watch` directly.

## Testing

- **Vitest** + **Testing Library** + **jsdom** for component tests.
- `yarn test:watch` runs Vitest in watch mode from this package.

The root `yarn test` runs API tests, E2E, then `yarn test:web`.

## Environment variables

Client-visible variables must use the `VITE_` prefix. See `.env.example`.
