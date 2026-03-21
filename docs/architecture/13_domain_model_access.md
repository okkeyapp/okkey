# Domain Model and Access Rules (Core)

This document defines the core domain model and access rules for Okkey Core. It is aligned with the glossary and the vault architecture.

## Scope

- Core entities: workspaces, vaults, items, roles, profiles
- Access boundaries between workspace settings and vault content
- Core-only behavior (no enterprise-specific rules)

## Core Entities

### User
A registered Okkey account.

### Device
A trusted device used by the user to access a storage/account.

### Workspace
A group of vaults and members. A workspace can be personal, family, or company.

### Member
A user who has access to a workspace. Members are invited by email.

### Vault
A secure container inside a workspace. Each vault has its own encryption key (VaultKey).

Vault types:
- Personal vault: created for each member by default, cannot be deleted.
- Shared vault: shared among members of a workspace.

### Item
A record stored in a vault (login, card, secure note, SSH key, etc.).

### Field
A typed value inside an item (text, password, TOTP, URL, note, file, etc.).

### Section
A named grouping of fields inside an item.

### Folder
A personal, user-only grouping of items. Folders can be nested. Deleting a folder does not delete items.

### Role
Workspace-level permissions for settings and administrative actions.

### Profile
Vault-level and item-level access profile. Profiles are applied per member and per vault.

## Relationships

```
User
  └ Member (in Workspace)
       ├ Role (workspace-level)
       └ Profiles (per Vault)

Workspace
  └ Vault
       └ Item
            └ Field / Section

Folder (personal) -> Item (reference)
```

## Access Layers

Access is evaluated in two layers:

1. Workspace settings and administrative actions are controlled by **Roles**.
2. Vault content access (items, fields, actions) is controlled by **Profiles**.

Roles do not grant access to vault content by themselves. Profiles do not grant access to workspace settings by themselves.

### Default Roles

- Owner: full access to all workspace settings and admin actions.
- Admin: full access except critical actions (for example: deleting workspace, billing if restricted).
- User: no access to workspace settings.

### Default Profiles

- Extended: full access to vault content (applied to Owners/Admins by default).
- Simple: read items and save to personal vault.

## Access Rules (Core)

### Workspace Membership

- A user must be a workspace member to access any vaults in that workspace.
- Removing a member removes access to all vaults in the workspace.

### Vault Access

- Access to a vault requires an explicit profile assignment for that member and vault.
- Personal vaults are visible only to their owner; they cannot be deleted.
- Shared vaults require both membership and a profile on that vault.

### Item Access

- Item read/write permissions are controlled by the profile assigned for the vault.
- Field-level visibility can be restricted by profile settings.
- Item actions (copy, share, export) are controlled by profile settings.

### Folders

- Folders are per-user and never visible to other members.
- Folder changes are synced as encrypted metadata.

### Sharing and Key Distribution

- Each vault has a VaultKey.
- Each member receives their own encrypted copy of the VaultKey.
- When a member is removed, their encrypted key is deleted and a key rotation is performed to invalidate cached access.

### Capsules (Core)

- Capsules are a core sharing mechanism for items, fields, or files.
- Access controls (expiration, view limits, password) are enforced on the server for access policies, while decryption happens client-side.

## Access Evaluation (Simplified)

```
if not member_of_workspace(user, workspace):
  deny

if action in workspace_settings:
  allow if role_permits(user.role, action)

if action in vault_content:
  allow if profile_permits(user.profile_for(vault), action)
```

## Core vs Enterprise Boundaries

Core rules above apply without enterprise code.
Enterprise extensions may add:
- additional role/profile permissions
- organization policies (enforcement hooks)
- SSO/SCIM provisioning

Enterprise features must not alter Core behavior, only extend it.

