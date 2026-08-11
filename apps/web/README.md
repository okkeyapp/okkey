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
| List (no demo data) | `src/components/workspace/ItemsListLeftPane.tsx` |

Flow: validate form → build `ItemPlaintextV2` → `buildItemCreateAppendRequest` (`@okkey/sync/item-sync`) → vault event outbox → optional `ITEM_FOLDER_ASSIGN` via workspace personal sync.

### Current limitations

1. **Personal vault only for save** — encryption uses the account split-key (`vaultKey` from unlock). Choosing a **shared** vault shows an error (`web.newItemPopup.saveErrorSharedVaultUnsupported`). `resolveVaultItemEncryptionKey` does not unwrap `GET /vaults/:vaultId/key` yet.
2. **Category required fields** — only **Login / Password** defines required fields (`itemCategoryDefaultSections.ts`: name, login, password, website URL). Other categories have no default sections and no category-specific validation rules.
3. **Tags** — UI exists (`NewItemTagsSection`) but tags are **not** written into the item plaintext payload.
4. **List metadata** — favorites, archive, and trash flags are always `false` in the list mapper; there is no client metadata layer for them yet.
5. **Shared vault items in the list** — sync fetches events for all workspace vaults, but decryption uses the personal-vault key path today, so items in shared vaults may not appear until per-vault key unwrap is implemented.
6. **Incremental replay** — vault event fetch replays one API page per refresh; large vaults may need paginated replay (same pattern as `SyncOutboxClient.fetchAllAfterVersion`).

Demo records (`itemsListLeftPane.demo.json`) are **removed** from the left pane; the list reflects synced workspace items only.

### TODO (to complete the feature)

1. **Shared vault key unwrap** — on unlock, keep decrypted identity keys in memory (see `decryptUserIdentityFromEncryptedBlob`); implement hybrid unwrap of `encryptedVaultKey` (`meta.key_wrap_scheme = hybrid_ecc_pq_v1`, `entity = vault_key_wrap`) via `decryptHybrid` in `@okkey/crypto`; use result as `encryptVaultItemPayload` / `decryptVaultItemPayload` key in `resolveVaultItemEncryptionKey`.
2. **Enable save to any accessible vault** — remove the personal-only guard in `NewItemPopup` after (1); use the same resolver for list sync decryption.
3. **Category registry** — per-category default sections, required-field rules, and validation (mirror `getDefaultSectionsForCategory` + `validateNewItemForm` for secure note, card, etc.).
4. **Tags and list flags** — extend plaintext schema or workspace-personal metadata; wire list filters (favorites / archive / deleted).
5. **Item detail & edit** — right pane for `?item=`; `ITEM_UPDATE` outbox path and form prefill.
6. **Tests** — integration tests for create → list → folder assign; crypto round-trip with real WASM payloads.

See also: [`docs/architecture/04_vault_architecture.md`](../../docs/architecture/04_vault_architecture.md) (item schema, vault keys), [`docs/architecture/05_sync_architecture.md`](../../docs/architecture/05_sync_architecture.md) (`ITEM_CREATE`, folder assign).

## Environment variables

Client-visible variables must use the `VITE_` prefix. See `.env.example`.

### FREE vs Enterprise web modules

| Variable | Default | Effect |
|----------|---------|--------|
| `VITE_ENTERPRISE_MODULES` | `false` | When `true`, loads enterprise web modules (`workspace-roles`, `workspace-profiles`, `workspace-tenancy`, `workspace-members`, `workspace-shared-vaults`) from sibling `okkey-enterprise/` |
| `VITE_DEPLOYMENT_MODE` | `self_hosted` | `saas` enables multi-workspace create UI (requires enterprise modules) |

**FREE (open-source only)**

```sh
cd okkey
cp apps/web/.env.example apps/web/.env   # VITE_ENTERPRISE_MODULES=false
yarn dev:api    # terminal 1
yarn dev:web    # terminal 2 → http://localhost:5173
```

Workspace → **Settings → Roles**: built-in roles (read-only), custom roles upsell, **Create** disabled.  
Workspaces page: no additional-workspace create tile (self-hosted OSS = 1 workspace).

**Enterprise (Core + okkey-enterprise)**

```sh
# repositories/okkey and repositories/okkey-enterprise as siblings
cd okkey
echo 'VITE_ENTERPRISE_MODULES=true' >> apps/web/.env
echo 'ENTERPRISE_MODULES=true' >> services/api/.env
# Optional SaaS multi-workspace:
# echo 'VITE_DEPLOYMENT_MODE=saas' >> apps/web/.env
# echo 'OKKEY_DEPLOYMENT_MODE=saas' >> services/api/.env
yarn dev:web
```

With `ENTERPRISE_MODULES=true`, new workspaces get `plan_tier=ENTERPRISE`. Upgrade existing local rows:

```sql
UPDATE workspaces SET plan_tier = 'ENTERPRISE' WHERE plan_tier IN ('FREE','TEAM','PREMIUM','FAMILY');
```

Start the API with `ENTERPRISE_MODULES=true` so custom role/profile CRUD, member invites, shared-vault create/share, and (when SaaS) `POST /workspaces` register from `okkey-enterprise/backend/`.

Custom roles UI loads from `okkey-enterprise/web/workspace-roles/`.  
Additional members UI: `okkey-enterprise/web/workspace-members/`.  
Shared vaults UI: `okkey-enterprise/web/workspace-shared-vaults/`.  
SaaS create UI gates via `okkey-enterprise/web/workspace-tenancy/` (`canCreateWorkspace` when `VITE_DEPLOYMENT_MODE=saas`).

Plan entitlements use `hasPlanFeature` (`FREE` | `ENTERPRISE`). Module presence alone does not unlock paid features on a FREE workspace; without modules, paid routes are absent (404).
