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

## Theme (light/dark + accent)

Web UI uses **shadcnUI-compatible CSS variables** and Tailwind tokens.

- Dark mode: `darkMode: 'class'` (Tailwind) + `.dark { ... }` variables in `src/index.css`.
- Accent: `data-accent="a1" ... "a7"` on `document.documentElement`.
  - For each accent id we override `--primary` / `--accent` (and therefore Tailwind `primary/*` and `accent/*` colors).
  - Persisted locally via `localStorage` keys:
    - `okkey.theme` = `light|dark`
    - `okkey.accent` = `a1..a7` (default: `a2`)

Accent palette (ids `a1..a7`) comes from design colors:

- Light accents: `#171717, #3B82F6, #06B6D4, #059669, #F97316, #DB2777, #7C3AED`
- Dark accents:  `#FAFAFA, #3B82F6, #06B6D4, #34D399, #F97316, #F472B6, #A78BFA`

## Environment variables

Client-visible variables must use the `VITE_` prefix. See `.env.example`.
