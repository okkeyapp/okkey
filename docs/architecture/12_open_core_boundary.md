# Open-Core Boundary

This document defines the architectural boundary between **open-source core** and **enterprise extensions**.

---

## Core Guarantees

The open-source core must:

- run fully without enterprise modules
- expose stable extension interfaces
- keep core schema backwards compatible
- keep cryptography and vault logic open and auditable

---

## Enterprise Rules

Enterprise code:

- lives only in `okkey-enterprise/`
- attaches via Feature Interfaces
- cannot modify core tables (only add new tables)
- cannot override core auth or crypto flows

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
