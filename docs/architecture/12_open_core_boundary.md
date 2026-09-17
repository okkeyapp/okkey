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
| `FAMILY` | Personal | Multi-seat personal (vaults / members / roles) |
| `TEAM` | Business | Team paid |
| `ENTERPRISE` | Business | Top catalog tier (full matrix today) |

**Custom / “by request”** is **not** a `plan_tier` value. Use:

- `workspace.plan_custom_override` (boolean)
- `workspace.plan_feature_overrides` (sparse `PlanFeature → boolean`)

Catalog `plan_tier` stays for display/billing; when custom override is on, overrides win in `hasPlanFeature(..., { customOverride, featureOverrides })`.

Entitlements are resolved only via `hasPlanFeature` in `@okkey/types` (`PLAN_FEATURE_MATRIX`). Soft numeric limits live in `PLAN_QUOTA_LIMITS` / `getPlanQuotaLimits`.

| Feature | FREE | PREMIUM | FAMILY | TEAM | ENTERPRISE |
|---|---|---|---|---|---|
| `capsules` | yes | yes | yes | yes | yes |
| `capsuleAccessSettings` | no | yes | yes | yes | yes |
| `filesInItems` | no | yes | yes | yes | yes |
| `monitoring` | no | yes | yes | yes | yes |
| `accountRecovery` | no | yes | yes | yes | yes |
| `trustedContacts` | no | yes | yes | yes | yes |
| `storageQuotas` | no | yes | yes | yes | yes |
| `sharedVaults` | no | no | yes | yes | yes |
| `additionalWorkspaceMembers` | no | no | yes | yes | yes |
| `customWorkspaceRoles` | no | no | yes | yes | yes |
| `customWorkspaceProfiles` | no | no | yes | yes | yes |
| `paidPlanBadge` | no | yes | yes | yes | yes |

Do **not** confuse `plan_tier` with `ENTERPRISE_MODULES` (plugin loading).

### How `plan_tier` changes (SaaS vs Self-hosted)

| Deployment | Who changes `plan_tier` | Mechanism (future product surfaces) |
|---|---|---|
| **SaaS** | Subscription / billing lifecycle | Checkout → payment webhook → update `plan_tier` (and seats). Self-serve “Сменить тариф”. |
| **Self-hosted** | License / specialist activation | Specialist request or license key → `validateLicense()` + set `plan_tier` / custom overrides. **No** self-serve Stripe on self-hosted. |

Core stores the tier and matrix; commercial write paths (subscribe, invoices, license blob) live in `okkey-enterprise`.

### Existing `ENTERPRISE` rows (dev strategy)

- Rows already on `ENTERPRISE` **stay** `ENTERPRISE` — no remapping to `TEAM` / `PREMIUM`.
- With `ENTERPRISE_MODULES=true`, new workspaces still default to `ENTERPRISE` (local full-feature convenience, not a payment flow).
- Optional local upgrade of FREE/personal tiers when developing with modules:

```sql
UPDATE workspaces
SET plan_tier = 'ENTERPRISE'
WHERE plan_tier IN ('FREE', 'TEAM', 'PREMIUM', 'FAMILY');
```

---

## Deployment mode (Core)

`OKKEY_DEPLOYMENT_MODE` / `VITE_DEPLOYMENT_MODE`:

| Mode | Default | Workspace policy |
|---|---|---|
| `self_hosted` | yes | Owner may have **at most one** workspace (API-enforced) |
| `saas` | no | Multi-workspace **create** only via private enterprise tenancy plugin |

List / switch / delete stay in Core. **`POST /workspaces` is not a Core route.**

---

## Free (Open-Source) Functionality

The open-source Core provides the FREE plan baseline:

- Upgrade to paid tiers is available only in SaaS or self-hosted deployments with a license / enterprise build.
- Authentication via email + email code.
- 2FA: authenticator app and backup codes.
- Self-hosted: only one workspace; enterprise feature modules unavailable in OSS builds.
- SaaS multi-workspace create is **not** open-source (lives in `okkey-enterprise`).
- One personal vault per workspace; shared vaults are unavailable.
- Folders are available.
- Capsules are available; access settings are unavailable (no expiry, view limits, password, or recipient restrictions).
- Monitoring is unavailable.
- Tools are available: generator, import, export.
- Workspace settings: main settings available.
- Workspace settings: roles view-only for default roles (custom roles require a plan with `customWorkspaceRoles` + enterprise module).
- Workspace settings: profiles view-only for default profiles.
- Workspace settings: members — owner only in OSS; inviting additional members requires enterprise `workspace-members` plugin **and** `additionalWorkspaceMembers` plan feature.
- Workspace settings: vaults — personal vault metadata editable when `sharedVaults` plan feature **and** `workspace-shared-vaults` module (popup inject); shared vaults require the same plugin **and** `sharedVaults` plan feature.
- Files in items require `filesInItems` plan feature (and workspace toggle).
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

- lives only in `okkey-enterprise/`
- attaches via Plugin Registry / Feature Interfaces
- cannot modify core tables (only add new tables)
- cannot override core auth or crypto flows
- cannot bypass Core crypto-version policy or downgrade protections
- cannot introduce legacy crypto exceptions for production traffic
- cannot redefine Core key lifecycle/zeroization policy for vault key material

Private SaaS / paid surfaces (examples):

- `workspace-roles` — custom roles CRUD
- `workspace-profiles` — custom profiles CRUD
- `workspace-members` — invite / manage additional members + vault-access orchestration, including public invite preview (`GET /invitations/:token`), accept (`POST /invitations/:token/accept`), and pending VaultKey wraps (Core keeps `GET …/members` + list loaders)
- `workspace-shared-vaults` — shared vault create/delete/access/shares orchestration + UI popups (Core keeps list/get/patch personal + `GET …/key`; wrap/rotate crypto in Core `VaultSharingService`)
- `workspace-tenancy` — `POST /workspaces` when `OKKEY_DEPLOYMENT_MODE=saas`

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
- additional workspace members (invite / vault-access)
- shared vaults product surface (create/share/access UI + routes)

---

## Build Modes

Open-source build:

- uses only core modules
- ships as `okkey/*` images
- `OKKEY_DEPLOYMENT_MODE=self_hosted`, `ENTERPRISE_MODULES=false`

Enterprise / SaaS build:

- includes enterprise plugins
- ships as `okkey-enterprise/*` images
- SaaS: `OKKEY_DEPLOYMENT_MODE=saas` + `ENTERPRISE_MODULES=true`
- Self-hosted enterprise: `self_hosted` + enterprise modules (1 workspace, ENTERPRISE plan features)

---

## Database Compatibility

Core schema is stable and public.
Enterprise migrations **only add** tables and indexes.
No core table is altered or removed by enterprise code.

Local upgrade of legacy / FREE rows when developing with enterprise modules (optional; existing ENTERPRISE rows are left as-is):

```sql
UPDATE workspaces
SET plan_tier = 'ENTERPRISE'
WHERE plan_tier IN ('FREE', 'TEAM', 'PREMIUM', 'FAMILY');
```

Custom selective plans use `plan_custom_override` + `plan_feature_overrides` (migration `0031_workspace_plan_custom_override.sql`) instead of inventing a `CUSTOM` tier string.
