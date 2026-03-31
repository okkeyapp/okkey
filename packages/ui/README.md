# @okkey/ui

Shared UI layer for Okkey clients (React + Tailwind + shadcn-style primitives).

## Peer dependencies

Consumers must install compatible versions of:

- `react`
- `react-dom`

Version range is aligned with `apps/web` (React 18.3.x).

## Build

From the `okkey` repo root:

```bash
yarn --cwd packages/ui build
```

Output goes to `dist/` (ignored by git). CI and other packages should run `build` before relying on `main`/`types` entry points.

## Local development with `apps/web`

The web app resolves `@okkey/ui` to `packages/ui/src` via Vite alias so you can edit components without rebuilding after every change.

Design system gallery (theme, tokens, primitives):

- Dev server: `yarn dev:web` → open [http://localhost:5173/dev/ui](http://localhost:5173/dev/ui)

To show the gallery link in a production build, set `VITE_SHOW_DEV_LINKS=true`.

## Adding shadcn components

Configuration for the shadcn CLI lives in [`apps/web/components.json`](../../apps/web/components.json). Aliases point at this package (`@workspace/ui/...`).

From `apps/web`, run for example:

```bash
cd apps/web && npx shadcn@latest add input
```

Then re-export new primitives from `src/index.ts` as needed (task **7.4**).

## Usage

```tsx
import { Button, cn } from "@okkey/ui";
```

Refresh `Button` from the registry when needed:

```bash
cd apps/web && npx shadcn@latest add button --overwrite
```

`--radius` in `apps/web/src/index.css` must be a length (e.g. `0.5rem`) so Tailwind `rounded-md` / `rounded-lg` map correctly via `tailwind.config.ts`.
