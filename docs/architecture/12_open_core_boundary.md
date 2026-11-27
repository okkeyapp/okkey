# Open-Core Boundary

This document defines the architectural boundary between **open-source core** and **enterprise extensions**.

---

## Core Guarantees

The open-source core must:

- run fully without enterprise modules
- expose stable extension interfaces
- keep core schema backwards compatible
- keep cryptography and vault logic open and auditable
- keep Q-Day crypto roadmap and production policy inside Core
- enforce first-release policy: production writes are `v2` by default, with no legacy client-data obligations

---

## Plan tiers (Core)

Commercial workspace plan is `workspace.plan_tier` (catalog):

| Tier | Group | Role |
|---|---|---|
| `FREE` | Personal | Open-source / SaaS default baseline |
| `PREMIUM` | Personal | Individual paid |
| `TEAM` | Business | Team paid |
| `ENTERPRISE` | Business | Top catalog tier (full matrix today) |

`FAMILY` is not a catalog tier. Migration rewrites stored rows to `PREMIUM`; `normalizePlanTier` still reads an unmigrated `FAMILY` token as `PREMIUM`.

**Custom / "by request"** is **not** a `plan_tier` value. Use:

- `workspace.plan_custom_override` (boolean)
- `workspace.plan_feature_overrides` (sparse `PlanFeature → boolean`)

Catalog `plan_tier` stays for display/billing; when custom override is on, overrides win in `hasPlanFeature(..., { customOverride, featureOverrides })`.

Entitlements are resolved via `hasPlanFeature` in `@okkey/types` (`PLAN_FEATURE_MATRIX`), with deployment context:

| Deployment | Paid-feature source |
|---|---|
| **SaaS (effective)** | `workspace.plan_tier` (+ optional custom overrides). Hosted is effective only when env requests `saas` **and** the loaded plugin confirms a signed hosted token. |
| **Self-hosted** | `enterpriseModulesActive` (sibling plugin loaded **and** license verified) → ENTERPRISE matrix; otherwise FREE + `SELF_HOSTED_FREE_EXTRA`. **Do not** use `plan_tier` for gating. Env ∧ sibling alone is **not** enough. |

Soft numeric limits live in `PLAN_QUOTA_LIMITS` / `getPlanQuotaLimits` (same self-host rule).

| Feature | FREE | PREMIUM | TEAM | ENTERPRISE |
|---|---|---|---|---|
| `capsules` | yes | yes | yes | yes |
| `capsuleAccessSettings` | no | no | yes | yes |
| `filesInItems` | no† | yes | yes | yes |
| `monitoring` | no | yes | yes | yes |
| `accountRecovery` | no | yes | yes | yes |
| `trustedContacts` | no | yes | yes | yes |
| `storageQuotas` | yes‡ | yes | yes | yes |
| `sharedVaults` | yes | yes | yes | yes |
| `additionalWorkspaceMembers` | yes | yes | yes | yes |
| `customWorkspaceRoles` | no | no | yes | yes |
| `customWorkspaceProfiles` | no | no | yes | yes |
| `paidPlanBadge` | no | yes | yes | yes |

† SaaS FREE keeps `filesInItems` off (PREMIUM+). Self-hosted FREE enables `filesInItems` via `SELF_HOSTED_FREE_EXTRA` - attachments stay free on-prem.

‡ `PLAN_FEATURE_MATRIX.FREE.storageQuotas` is true (SaaS FREE). Self-hosted FREE forces `storageQuotas` off.

Do **not** confuse `plan_tier` with `ENTERPRISE_MODULES` (plugin load request only).

### Self-host enterprise enablement vs `plan_tier`

Three gates on self-hosted:

| Gate | Meaning |
|---|---|
| Plugin load request | `ENTERPRISE_MODULES` grammar (`true` / `all` / known comma-list ids) **and** loadable sibling `okkey-enterprise`. Web: `VITE_ENTERPRISE_MODULES === "true"` only. An allowlist of **only unknown** ids does **not** load. Without a successful load, plugin routes (custom workspace roles, custom profiles, and similar) are absent (404). Invitations (`POST /workspaces/:id/invitations`) and shared vaults (`/vaults`) are Core routes: on FREE they return 2xx within quota and `403 PLAN_QUOTA_EXCEEDED` above it (self-hosted FREE: 10 additional members, 1 shared vault). |
| License verified | Loaded plugin confirms a verified license → `enterpriseModulesActive=true` (also exposed on `GET /public/features`). Env flags alone never set this. License management UI mounts when `enterpriseLicenseManagementAvailable` (plugin loaded) for absent / invalid / expired / active - that flag does **not** unlock gated features. |
| Workspace feature matrix | `enterpriseModulesActive` → ENTERPRISE matrix via `resolveEntitlementPlanTier` / `hasPlanFeature` (`plan_tier` ignored). Otherwise → FREE + `SELF_HOSTED_FREE_EXTRA` even if SQL says ENTERPRISE. |

Setting `plan_tier=ENTERPRISE` alone does **not** load modules or unlock paid create/edit. Self-host paid access requires `enterpriseModulesActive`. Signed license issuance lives in **`okkey-license`**.

Canonical contract: Project store `docs/license-and-updates.md`. Enterprise docs: `okkey-enterprise/docs/architecture/04_feature_gating.md`, `10_license_enforcement.md`.

### How `plan_tier` changes (SaaS vs Self-hosted)

| Deployment | Who changes `plan_tier` | Mechanism (future product surfaces) |
|---|---|---|
| **SaaS (effective)** | Subscription / billing lifecycle | Checkout → payment webhook → update `plan_tier` (and seats). Self-serve plan change. |
| **Self-hosted** | Display / catalog only | Verified license decides paid create/edit. `plan_tier` stays FREE for new workspaces and does not gate features. **No** self-serve Stripe on self-hosted. |

Core stores the tier and matrix; commercial write paths (subscribe, invoices) live in `okkey-enterprise`. Self-host license issuance lives in **`okkey-license`**.

### Enterprise modules fail-closed

`ENTERPRISE_MODULES` / `VITE_ENTERPRISE_MODULES` request plugin bootstrap **only**. They do **not** enable entitlements. The sibling `okkey-enterprise` path must exist and be loadable, and on self-host the loaded plugin must confirm a verified license before `enterpriseModulesActive` is true. Otherwise the FREE matrix applies on self-host, even if SQL has `plan_tier=ENTERPRISE` or the env load request is set.

### Existing `ENTERPRISE` rows (dev strategy)

- Rows already on `ENTERPRISE` **stay** `ENTERPRISE` - no remapping to `TEAM` / `PREMIUM`.
- New workspaces always default to `plan_tier=FREE` (including when the plugin is loaded). On self-host, paid create/edit require `enterpriseModulesActive` (`plan_tier` ignored).
- Optional local display upgrade (does not change self-host gating):

```sql
UPDATE workspaces
SET plan_tier = 'ENTERPRISE'
WHERE plan_tier IN ('FREE', 'TEAM', 'PREMIUM', 'FAMILY');
```

---

## Deployment mode (Core)

Runtime keys `OKKEY_DEPLOYMENT_MODE` (API) / `VITE_DEPLOYMENT_MODE` (web):

| Mode | Default | Workspace policy |
|---|---|---|
| `self_hosted` | yes | Owner may have **at most one** workspace (API-enforced) |
| `saas` | no | Multi-workspace **create** only via private enterprise tenancy plugin |

**Requested vs effective.** Env may **request** hosted (`OKKEY_DEPLOYMENT_MODE=saas`). Effective `saas` applies only after the loaded plugin confirms a signed hosted token. Until then the instance runs as `self_hosted` (see `GET /public/features` → `deploymentMode`).

**Open-core committed examples do not document SaaS env.** When an `ENTERPRISE_MODULES` load request succeeds, the API may load `OKKEY_DEPLOYMENT_MODE` from `okkey-enterprise/backend/.env`; Vite may load `VITE_DEPLOYMENT_MODE` from `okkey-enterprise/web/.env`. See those repos' `.env.example` files. Env request alone never makes hosted mode effective.

List / switch / delete stay in Core. **`POST /workspaces` is not a Core route.**

---

## Free (Open-Source) Functionality

The open-source Core provides the FREE plan baseline:

- Upgrade to paid **SaaS** tiers uses `plan_tier` after hosted mode is confirmed. Self-hosted enterprise uses `enterpriseModulesActive` (plugin loaded + verified license) - not `plan_tier` as the enablement gate, and not env ∧ sibling alone.
- Authentication via email + email code.
- 2FA: authenticator app and backup codes.
- Self-hosted: only one workspace; enterprise feature modules unavailable in OSS builds without a loadable sibling and verified license.
- SaaS multi-workspace create is **not** open-source (lives in `okkey-enterprise`) and requires effective hosted mode.
- One personal vault per workspace. Shared vaults are Core (`sharedVaults` is granted on every catalog tier, including FREE) and limited by `maxSharedVaults` (self-hosted FREE: 1; over quota `403 PLAN_QUOTA_EXCEEDED`).
- Folders are available.
- Capsules are available; access settings are unavailable (no expiry, view limits, password, or recipient restrictions).
- Monitoring is unavailable.
- Tools are available: generator, import, export.
- Workspace settings: main settings available.
- Workspace settings: roles view-only for default roles (custom roles require a plan with `customWorkspaceRoles` + enterprise plugin with verified license for create/edit).
- Workspace settings: profiles view-only for default profiles.
- Workspace settings: members - invitations are Core (`POST /workspaces/:id/invitations`, preview `GET /invitations/:token`, accept `POST /invitations/:token/accept`). `additionalWorkspaceMembers` is granted on every catalog tier, including FREE; seats are limited by `maxAdditionalMembers` (self-hosted FREE: 10 additional members via `SELF_HOSTED_FREE_QUOTA_OVERRIDES`; SaaS FREE catalog: 3). Over quota the API returns `403 PLAN_QUOTA_EXCEEDED`.
- Workspace settings: vaults - personal and shared vault routes are Core (`POST /workspaces/:id/vaults`, `/vaults`, shares and key wrap/rotate). `sharedVaults` is granted on every catalog tier, including FREE, and limited by `maxSharedVaults` (self-hosted FREE: 1; SaaS FREE catalog: 1). Over quota the API returns `403 PLAN_QUOTA_EXCEEDED`. The personal vault default name is set only at create/register.
- Files in items: enabled on self-hosted FREE (`SELF_HOSTED_FREE_EXTRA`); on SaaS require PREMIUM+ `filesInItems` (and workspace toggle either way).
- Workspace settings: change plan / payments / license surfaces exist as product shells. Self-hosted Plan settings mount the license panel when the plugin is loaded (`enterpriseLicenseManagementAvailable`) for all license states.
- Personal settings: main settings available.
- Personal settings: storage available except confidential sections, biometrics, and PIN.
- Personal settings: login methods only email confirmation.
- Personal settings: 2FA only authenticator app and backup codes.
- Personal settings: recovery key available to all accounts; trusted devices/contacts gated by account-level paid entitlement.
- Personal settings: devices available.

---

## Enterprise Rules

Enterprise code:

- lives only in `okkey-enterprise/`
- attaches via Plugin Registry / Feature Interfaces
- cannot modify core tables (only add new tables)
- cannot override core auth or crypto flows
- cannot bypass Core crypto-version policy or downgrade protections
- cannot introduce legacy crypto exceptions for production traffic
- cannot redefine Core key lifecycle/zeroization policy for vault key material

Private SaaS / paid surfaces (examples):

- `workspace-roles` - custom roles CRUD
- `workspace-profiles` - custom profiles CRUD
- `workspace-tenancy` - `POST /workspaces` when deployment mode is effective `saas`

Invitations and shared vaults are not enterprise plugins. They are Core routes, quota-limited by `additionalWorkspaceMembers` / `maxAdditionalMembers` and `sharedVaults` / `maxSharedVaults`.

---

## Integration Points

Core backend provides:

- Plugin Registry (`ApiEnterprisePlugin`)
- Feature Interfaces (AuthProvider, PolicyProvider, AuditProvider)
- plan feature matrix + deployment-mode workspace limit
- license/feature-flag hooks (`enterpriseModulesActive`, `enterpriseLicenseManagementAvailable`, hosted confirmation)

Enterprise implements:

- SSO / SAML / OIDC
- SCIM / directory sync
- audit logs
- org policies
- admin & reporting
- SaaS workspace tenancy
- custom workspace roles
- license verification and hosted-token confirmation

---

## Build Modes

Open-source build:

- uses only core modules
- ships as `okkey/*` images
- default deployment mode `self_hosted`, `ENTERPRISE_MODULES=false`

Enterprise / SaaS build:

- includes enterprise plugins
- ships as `okkey-enterprise/*` images
- SaaS: env may request `saas` + `ENTERPRISE_MODULES` load request; workspace features follow `plan_tier` only when hosted is **effective** (plugin confirmed signed hosted token)
- Self-hosted enterprise: `self_hosted` + loadable sibling. Paid create/edit require `enterpriseModulesActive` (license verified). Env / sibling alone does not unlock entitlements. Modules inactive → FREE + `SELF_HOSTED_FREE_EXTRA`.

---

## Database Compatibility

Core schema is stable and public.
Enterprise migrations **only add** tables and indexes.
No core table is altered or removed by enterprise code.

On self-hosted, entitlements are ENTERPRISE only when `enterpriseModulesActive` is true, regardless of `plan_tier`. Plugin loaded without a verified license stays FREE for gating. Effective SaaS uses catalog tiers / billing webhooks.

Custom selective plans use `plan_custom_override` + `plan_feature_overrides` (migration `0031_workspace_plan_custom_override.sql`) instead of inventing a `CUSTOM` tier string.
