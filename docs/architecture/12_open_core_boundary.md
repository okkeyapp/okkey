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

**Custom / “by request”** is **not** a `plan_tier` value. Use:

- `workspace.plan_custom_override` (boolean)
- `workspace.plan_feature_overrides` (sparse `PlanFeature → boolean`)

Catalog `plan_tier` stays for display/billing; when custom override is on, overrides win in `hasPlanFeature(..., { customOverride, featureOverrides })`.

Entitlements are resolved via `hasPlanFeature` in `@okkey/types` (`PLAN_FEATURE_MATRIX`), with deployment context:

| Deployment | Paid-feature source |
|---|---|
| **Confirmed hosted (`saas`)** | `workspace.plan_tier` (+ optional custom overrides) |
| **Self-hosted** | verified signed license after the enterprise plugin loads → ENTERPRISE matrix; otherwise FREE + `SELF_HOSTED_FREE_EXTRA`. **Do not** use `plan_tier` for gating. |

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

† SaaS FREE keeps `filesInItems` off (PREMIUM+). Self-hosted FREE enables `filesInItems` via `SELF_HOSTED_FREE_EXTRA` — attachments stay free on-prem.

‡ `PLAN_FEATURE_MATRIX.FREE.storageQuotas` is true (SaaS FREE). Self-hosted FREE forces `storageQuotas` off.

Do **not** confuse `plan_tier` with `ENTERPRISE_MODULES` (plugin load request).

### Self-host enterprise enablement vs `plan_tier`

Three related signals on self-hosted:

| Signal | Meaning |
|---|---|
| Plugin load request | `ENTERPRISE_MODULES` (see `services/api/.env.example`) requests load when the sibling Enterprise plugin path is loadable. Grammar: `true` / `1` / `yes` / `all`, or a comma-separated list of known module ids. Unknown tokens log a WARN and are ignored. If no known id remains, the plugin does not load. `VITE_ENTERPRISE_MODULES` is a separate web build flag (exact value `true` only; not an allowlist). |
| Plugin loaded | EE plugin routes register; `GET /public/features.enterpriseLicenseManagementAvailable=true`; self-host license panel mounts. Without a loaded plugin those plugin routes return **404**, the license panel is absent, and the feature matrix is FREE even if SQL says ENTERPRISE. Invitations (`POST /workspaces/:id/invitations`) and shared vaults (`/vaults`) are Core routes: on FREE they return 2xx within quota and `403 PLAN_QUOTA_EXCEEDED` above it (self-hosted FREE: 10 additional members, 1 shared vault). |
| Entitlements active | `enterpriseModulesActive` = plugin loaded **and** plugin confirmed a verified signed license. Then ENTERPRISE matrix via `resolveEntitlementPlanTier` / `hasPlanFeature` (`plan_tier` ignored). Without a verified license: FREE + `SELF_HOSTED_FREE_EXTRA`; paid writes return **403** `PLAN_FEATURE_REQUIRED`. Lapsed license: soft-lock writes **402** `PLAN_LICENSE_LAPSED` (panel still available while the plugin is loaded). |

`ENTERPRISE_MODULES` alone never enables entitlements. Setting `plan_tier=ENTERPRISE` alone does not load the plugin and does not unlock paid create/edit.

Behavior change: earlier builds treated a loadable sibling plus `ENTERPRISE_MODULES=true` as enough for the ENTERPRISE matrix. Now a verified signed license is required; after upgrade, instances without a valid license file lose module entitlements while the license panel remains if the plugin still loads.

Enterprise docs: feature gating and license enforcement in the Enterprise edition architecture docs.

### How `plan_tier` changes (SaaS vs Self-hosted)

| Deployment | Who changes `plan_tier` | Mechanism (future product surfaces) |
|---|---|---|
| **Confirmed hosted** | Subscription / billing lifecycle | Checkout → payment webhook → update `plan_tier` (and seats). Self-serve change-plan UI. |
| **Self-hosted** | Display / catalog only | Verified license decides paid create/edit. `plan_tier` stays FREE for new workspaces and does not gate features. **No** self-serve Stripe on self-hosted. |

Core stores the tier and matrix; commercial write paths (subscribe, invoices) live in the Enterprise edition. Self-host license files are verified by the loaded enterprise plugin.

### Enterprise plugin load fail-closed

`ENTERPRISE_MODULES` / `VITE_ENTERPRISE_MODULES=true` load the sibling plugin **only** when the sibling Enterprise plugin path exists and is loadable. Otherwise the plugin stays off (FREE matrix on self-host), even if SQL has `plan_tier=ENTERPRISE`.

### Existing `ENTERPRISE` rows (dev strategy)

- Rows already on `ENTERPRISE` **stay** `ENTERPRISE` - no remapping to `TEAM` / `PREMIUM`.
- New workspaces always default to `plan_tier=FREE` (including when the plugin is loaded). On self-host, paid create/edit require a verified license (`plan_tier` ignored).
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

**Open-core committed examples do not document SaaS env.** When the enterprise plugin is loaded, the API may load `OKKEY_DEPLOYMENT_MODE` from the Enterprise backend `.env`; Vite may load `VITE_DEPLOYMENT_MODE` from the Enterprise web `.env`. See the Enterprise edition `.env.example` files. Effective hosted mode also requires plugin confirmation; without it the instance runs as `self_hosted`.

List / switch / delete stay in Core. **`POST /workspaces` is not a Core route.**

---

## Free (Open-Source) Functionality

The open-source Core provides the FREE plan baseline:

- Upgrade to paid **hosted** tiers uses `plan_tier`. Self-hosted enterprise uses a verified signed license after the plugin loads - not `plan_tier` as the enablement gate.
- Authentication via email + email code.
- 2FA: authenticator app and backup codes.
- Self-hosted: only one workspace; enterprise feature modules unavailable in OSS builds.
- SaaS multi-workspace create is **not** open-source (lives in the Enterprise edition).
- One personal vault per workspace. Shared vaults are Core (`sharedVaults` is granted on every catalog tier, including FREE) and limited by `maxSharedVaults` (self-hosted FREE: 1; over quota `403 PLAN_QUOTA_EXCEEDED`).
- Folders are available.
- Capsules are available; access settings are unavailable (no expiry, view limits, password, or recipient restrictions).
- Monitoring is unavailable.
- Tools are available: generator, import, export.
- Workspace settings: main settings available.
- Workspace settings: roles view-only for default roles (custom roles require a plan with `customWorkspaceRoles` + enterprise module).
- Workspace settings: profiles view-only for default profiles.
- Workspace settings: members — invitations are Core (`POST /workspaces/:id/invitations`, preview `GET /invitations/:token`, accept `POST /invitations/:token/accept`). `additionalWorkspaceMembers` is granted on every catalog tier, including FREE; seats are limited by `maxAdditionalMembers` (self-hosted FREE: 10 additional members via `SELF_HOSTED_FREE_QUOTA_OVERRIDES`; SaaS FREE catalog: 3). Over quota the API returns `403 PLAN_QUOTA_EXCEEDED`.
- Workspace settings: vaults — personal and shared vault routes are Core (`POST /workspaces/:id/vaults`, `/vaults`, shares and key wrap/rotate). `sharedVaults` is granted on every catalog tier, including FREE, and limited by `maxSharedVaults` (self-hosted FREE: 1; SaaS FREE catalog: 1). Over quota the API returns `403 PLAN_QUOTA_EXCEEDED`. The personal vault default name is set only at create/register.
- Files in items: enabled on self-hosted FREE (`SELF_HOSTED_FREE_EXTRA`); on SaaS require PREMIUM+ `filesInItems` (and workspace toggle either way).
- Workspace settings: change plan / payments / license surfaces exist as product shells.
- Personal settings: main settings available.
- Personal settings: storage available except confidential sections, biometrics, and PIN.
- Personal settings: login methods only email confirmation.
- Personal settings: 2FA only authenticator app and backup codes.
- Personal settings: recovery key available to all accounts; trusted devices/contacts gated by account-level paid entitlement.
- Personal settings: devices available.

---

## Enterprise Rules

Enterprise code:

- lives only in the Enterprise edition
- attaches via Plugin Registry / Feature Interfaces
- cannot modify core tables (only add new tables)
- cannot override core auth or crypto flows
- cannot bypass Core crypto-version policy or downgrade protections
- cannot introduce legacy crypto exceptions for production traffic
- cannot redefine Core key lifecycle/zeroization policy for vault key material

Private SaaS / paid surfaces (examples):

- `workspace-roles` — custom roles CRUD
- `workspace-profiles` — custom profiles CRUD
- `workspace-tenancy` — `POST /workspaces` when deployment mode is `saas`

Invitations and shared vaults are not enterprise plugins. They are Core routes, quota-limited by `additionalWorkspaceMembers` / `maxAdditionalMembers` and `sharedVaults` / `maxSharedVaults`.

---

## Integration Points

Core backend provides:

- Plugin Registry (`ApiEnterprisePlugin`)
- Feature Interfaces (AuthProvider, PolicyProvider, AuditProvider)
- plan feature matrix + deployment-mode workspace limit
- license/feature-flag hooks

Enterprise implements:

- SSO / SAML / OIDC
- SCIM / directory sync
- audit logs
- org policies
- admin & reporting
- SaaS workspace tenancy
- custom workspace roles

---

## Build Modes

Open-source build:

- uses only core modules
- ships as `okkey/*` images
- default deployment mode `self_hosted`, `ENTERPRISE_MODULES=false`

Enterprise / SaaS build:

- includes enterprise plugins
- ships as Enterprise edition images
- Hosted: effective deployment mode `saas` (enterprise env request plus plugin confirmation) + loaded plugin (workspace features via `plan_tier`)
- Self-hosted enterprise: `self_hosted` + loaded plugin. Plugin load unlocks EE routes and the license panel; a verified signed license unlocks paid create/edit (`plan_tier` ignored). Without a verified license → FREE + `SELF_HOSTED_FREE_EXTRA` (writes **403**; lapsed → **402**).

---

## Database Compatibility

Core schema is stable and public.
Enterprise migrations **only add** tables and indexes.
No core table is altered or removed by enterprise code.

On self-hosted with a verified license, entitlements are ENTERPRISE regardless of `plan_tier`. Confirmed hosted uses catalog tiers / billing webhooks.

Custom selective plans use `plan_custom_override` + `plan_feature_overrides` (migration `0031_workspace_plan_custom_override.sql`) instead of inventing a `CUSTOM` tier string.
