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

## Free (Open-Source) Functionality

The open-source Core provides the FREE plan baseline:

- Upgrade to paid tiers is available only in SaaS or self-hosted deployments with a license.
- Authentication via email + email code.
- 2FA: authenticator app and backup codes.
- Self-hosted: only one workspace; enterprise features unavailable.
- SaaS: users can create FREE workspaces and upgrade to higher tiers.
- One personal vault per workspace; shared vaults are unavailable.
- Files are unavailable.
- Folders are available.
- Capsules are unavailable.
- Monitoring is unavailable.
- Tools are available: generator, import, export.
- Workspace settings: main settings available.
- Workspace settings: roles view-only for default roles.
- Workspace settings: profiles view-only for default profiles.
- Workspace settings: members view-only, owner only.
- Workspace settings: vaults view-only, personal vault only.
- Workspace settings: change plan available.
- Workspace settings: payments and billing available.
- Workspace settings: license available.
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
- attaches via Feature Interfaces
- cannot modify core tables (only add new tables)
- cannot override core auth or crypto flows
- cannot bypass Core crypto-version policy or downgrade protections
- cannot introduce legacy crypto exceptions for production traffic
- cannot redefine Core key lifecycle/zeroization policy for vault key material

---

## Integration Points

Core backend provides:

- Plugin Registry
- Feature Interfaces (AuthProvider, PolicyProvider, AuditProvider)
- license/feature-flag hooks

Enterprise implements:

- SSO / SAML / OIDC
- SCIM / directory sync
- audit logs
- org policies
- admin & reporting

---

## Build Modes

Open-source build:

- uses only core modules
- ships as `okkey/*` images

Enterprise build:

- includes enterprise plugins
- ships as `okkey-enterprise/*` images

---

## Database Compatibility

Core schema is stable and public.
Enterprise migrations **only add** tables and indexes.
No core table is altered or removed by enterprise code.
