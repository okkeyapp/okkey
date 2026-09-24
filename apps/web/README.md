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

## Theme (light / dark / system + accent)

Web UI uses **shadcnUI-compatible CSS variables** and Tailwind tokens.

- Dark mode: `darkMode: 'class'` (Tailwind) + `.dark { ... }` variables in `src/index.css`. Resolved theme follows `okkey.theme` and, when set to `auto`, `prefers-color-scheme` (OS-level on macOS, Windows, and Linux browsers).
- Accent: `data-accent="a1" ... "a7"` on `document.documentElement`.
  - For each accent id we override `--primary` / `--accent` (and therefore Tailwind `primary/*` and `accent/*` colors).
  - Persisted locally via `localStorage` keys:
    - `okkey.theme` = `light|dark|auto` (default: `auto`)
    - `okkey.accent` = `a1..a7` (default: `a2`)

Accent palette (ids `a1..a7`) comes from design colors:

- Light accents: `#171717, #3B82F6, #06B6D4, #059669, #F97316, #DB2777, #7C3AED`
- Dark accents:  `#FAFAFA, #3B82F6, #06B6D4, #34D399, #F97316, #F472B6, #A78BFA`

## Routing

React Router paths, the route tree, and guest-session rules live under **`src/routes/`**. Conventions and a checklist for new routes: [`src/routes/README.md`](src/routes/README.md).

## Item create (web) — implementation status

The **New item** popup can create encrypted vault items and show them in the items list. Relevant code:

| Area | Location |
|------|----------|
| Form + validation | `src/components/items/NewItemForm.tsx`, `src/items/validateNewItemForm.ts` |
| Plaintext mapping | `src/items/keyFormToItemPlaintext.ts` |
| Sync + outbox | `src/items/workspaceVaultItemsSync.ts`, `src/items/WorkspaceItemsContext.tsx` |
| Vault key resolution | `src/items/resolveVaultItemEncryptionKey.ts` |
| Vault profile ACL (client) | `src/items/WorkspaceVaultProfilesContext.tsx`, `@okkey/types` `profile-permits` |
| List (no demo data) | `src/components/workspace/ItemsListLeftPane.tsx` |

Flow: validate form → resolve per-vault encryption key → build `ItemPlaintextV2` → `buildItemCreateAppendRequest` (`@okkey/sync/item-sync`) → vault event outbox → optional `ITEM_FOLDER_ASSIGN` via workspace personal sync.

### Current limitations

1. **Category required fields** — only **Login / Password** defines required fields (`itemCategoryDefaultSections.ts`: name, login, password, website URL). Other categories have no default sections and no category-specific validation rules.
2. **Tags** — UI exists (`NewItemTagsSection`) but tags are **not** written into the item plaintext payload.
3. **Incremental replay** — vault event fetch replays one API page per refresh; large vaults may need paginated replay (same pattern as `SyncOutboxClient.fetchAllAfterVersion`).
4. **Profile content ACL** — enforced on the Web client after decrypt (`GET /workspaces/:id/me/vault-profiles` + `profilePermits`). Server sync ACL remains membership-based (zero-knowledge).

Demo records (`itemsListLeftPane.demo.json`) are **removed** from the left pane; the list reflects synced workspace items only.

### TODO (to complete the feature)

1. **Category registry** — per-category default sections, required-field rules, and validation (mirror `getDefaultSectionsForCategory` + `validateNewItemForm` for secure note, card, etc.).
2. **Tags and list flags** — extend plaintext schema or workspace-personal metadata; wire list filters (favorites / archive / deleted).
3. **Tests** — integration tests for create → list → folder assign; crypto round-trip with real WASM payloads; shared-vault create with unwrap.

See also: [`docs/architecture/04_vault_architecture.md`](../../docs/architecture/04_vault_architecture.md) (item schema, vault keys), [`docs/architecture/05_sync_architecture.md`](../../docs/architecture/05_sync_architecture.md) (`ITEM_CREATE`, folder assign).

## Environment variables

Client-visible variables must use the `VITE_` prefix. See `.env.example`.

### FREE vs Enterprise web modules

Open-core builds ship OSS stubs for enterprise UI surfaces. Enabling the private enterprise web overlay (and SaaS / legal operator env) is documented only in **`okkey-enterprise/web/.env.example`** — not in Core committed examples.

**FREE (open-source only)**

```sh
cd okkey
cp apps/web/.env.example apps/web/.env
yarn dev:api    # terminal 1
yarn dev:web    # terminal 2 → http://localhost:5173
```

Workspace → **Settings → Roles**: built-in roles (read-only), custom roles upsell, **Create** disabled.  
Workspaces page: no additional-workspace create tile (self-hosted OSS = 1 workspace).

**Enterprise (Core + okkey-enterprise)**

```sh
# repositories/okkey and repositories/okkey-enterprise as siblings
cd okkey
# Web: Core apps/web/.env → VITE_ENTERPRISE_MODULES=true
#      okkey-enterprise/web/.env → VITE_DEPLOYMENT_MODE=saas (see that repo’s .env.example)
echo 'ENTERPRISE_MODULES=true' >> services/api/.env
echo 'OKKEY_DEPLOYMENT_MODE=saas' >> services/api/.env   # required for POST /workspaces
yarn dev:api
yarn dev:web
```

With `ENTERPRISE_MODULES=true` (self_hosted), new workspaces from registration still get `plan_tier=ENTERPRISE`. SaaS `POST /workspaces` always creates **FREE**. Upgrade existing local rows:

```sql
UPDATE workspaces SET plan_tier = 'ENTERPRISE' WHERE plan_tier IN ('FREE','TEAM','PREMIUM','FAMILY');
```

Start the API with `ENTERPRISE_MODULES=true` **and** `OKKEY_DEPLOYMENT_MODE=saas` so custom role/profile CRUD, member invites, shared-vault create/share, and `POST /workspaces` register from `okkey-enterprise/backend/`. Without `OKKEY_DEPLOYMENT_MODE=saas`, the create-workspace UI may appear (Vite) but `POST /workspaces` returns **404**.

Custom roles UI loads from `okkey-enterprise/web/workspace-roles/`.  
Additional members UI: `okkey-enterprise/web/workspace-members/`.  
Shared vaults UI: `okkey-enterprise/web/workspace-shared-vaults/`.  
SaaS create UI and privacy-policy overlay: see `okkey-enterprise/web/.env.example` and `web/workspace-tenancy/`, `web/legal/`.

Plan entitlements use `hasPlanFeature` over catalog tiers `FREE` | `PREMIUM` | `FAMILY` | `TEAM` | `ENTERPRISE` (plus optional `plan_custom_override`). Module presence alone does not unlock paid features on a FREE workspace; without modules, paid routes are absent (404).

SaaS changes `plan_tier` via subscription; self-hosted via license / specialist activation (see `docs/architecture/12_open_core_boundary.md`).
