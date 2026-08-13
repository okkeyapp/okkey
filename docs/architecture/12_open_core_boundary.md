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

Commercial workspace plan is `workspace.plan_tier`:

- **`FREE`** — open-source baseline
- **`ENTERPRISE`** — all paid entitlements (today)

Entitlements are resolved only via `hasPlanFeature(planTier, feature)` in `@okkey/types` (`PLAN_FEATURE_MATRIX`).  
Later product plans (`PREMIUM` / `FAMILY` / `TEAM`) are added by extending the matrix — call sites stay on `hasPlanFeature`.

Current matrix:

| Feature | FREE | ENTERPRISE |
|---|---|---|
| `capsules` | yes | yes |
| `capsuleAccessSettings` | no | yes |
| `customWorkspaceRoles` | no | yes |
| `customWorkspaceProfiles` | no | yes |
| `sharedVaults` | no | yes |
| `additionalWorkspaceMembers` | no | yes |
| `paidPlanBadge` | no | yes |

Do **not** confuse `plan_tier` with `ENTERPRISE_MODULES` (plugin loading).

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
- Workspace settings: roles view-only for default roles (custom roles require ENTERPRISE plan + enterprise module).
- Workspace settings: profiles view-only for default profiles.
- Workspace settings: members — owner only in OSS; inviting additional members requires enterprise `workspace-members` plugin **and** `additionalWorkspaceMembers` plan feature.
- Workspace settings: vaults — personal vault metadata editable when ENTERPRISE plan **and** `workspace-shared-vaults` module (popup inject); shared vaults require the same plugin **and** `sharedVaults` plan feature.
- Workspace settings: change plan / payments / license surfaces exist as product shells.
- Personal settings: main settings available.
- Personal settings: storage available except confidential sections, biometrics, and PIN.
- Personal settings: login methods only email confirmation.
- Personal settings: 2FA only authenticator app and backup codes.
- Personal settings: recovery unavailable.
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

Local upgrade of legacy / FREE rows when developing with enterprise modules:

```sql
UPDATE workspaces
SET plan_tier = 'ENTERPRISE'
WHERE plan_tier IN ('FREE', 'TEAM', 'PREMIUM', 'FAMILY');
```
