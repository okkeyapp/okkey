# Database Schema (Core)

This document describes the **core** database schema of Okkey.

Backend stores only:
- metadata
- encrypted blobs
- events

Backend **never stores decrypted vault data**.

---

## Main Tables

Main tables:
```text
users
devices
sessions
workspaces
workspace_members
roles
profiles
vaults
vault_members
vault_profiles
vault_keys
items
capsules
events
attachments
```

### users

Users table.
```text
id (snowflake bigint string)
email
public_key
public_pq_key (nullable for legacy rows; ML-KEM-768 encapsulation key, base64 text on wire)
encrypted_private_key
server_key_share
password_kdf_salt (nullable for pre-4.9 rows)
password_kdf_params_version (nullable for pre-4.9 rows)
created_at
updated_at
```

### devices

Registered devices.
```text
id (snowflake bigint string)
user_id
device_fingerprint
device_name
device_public_key
device_share
platform
os_name
os_version
app_version
client_type
user_agent
ip_first
ip_last
status (trusted|pending|revoked)
created_at
last_seen_at
approved_by
approved_at
rejected_at
rejection_reason
revoked_at
```
Unique key:
```text
(user_id, device_fingerprint, device_public_key)
```

### sessions

Active user sessions.
```text
id (snowflake bigint string)
user_id
device_id
token_hash
expires_at
created_at
```

### workspaces

Logical vault group.
```text
id (snowflake bigint string)
name
owner_id
plan_tier
created_at
```

### workspace_members

Members of a workspace with assigned roles.
```text
id (snowflake bigint string)
workspace_id
user_id
role_id
created_at
```

### roles

Workspace roles and their permissions.
```text
id (snowflake bigint string)
workspace_id
name
description
permissions_json
is_system
builtin_key (nullable; owner | admin | user for built-in)
created_at
updated_at
```

`permissions_json` is a per-resource matrix. Each resource (`settings`, `roles`, `profiles`, `members`, `vaults`, `billing`) has:

```text
get: 0 | 1 | 2
post: 0 | 1
put: 0 | 1 | 2
delete: 0 | 1 | 2
```

Values: `0` — no access; `1` — full access; `2` — own objects only (`get` / `put` / `delete`).  
Built-in defaults: `owner`/`admin` — all `1`; `user` — all `0`.  
See `okkey-enterprise/docs/api/workspace-roles.md` for the enterprise custom-roles contract.

### profiles

Vault access profiles for items, fields, and actions.
```text
id (snowflake bigint string)
workspace_id
name
permissions_json
is_system
created_at
updated_at
```

### vaults

Vault is a safe.
```text
id (snowflake bigint string)
workspace_id
name
is_personal
owner_id (nullable)
crypto_version (smallint, 1–65535; floor for vault crypto profile; new rows use v2)
created_at
updated_at
```

### vault_members

Users who have access to the vault.
```text
id (snowflake bigint string)
vault_id
user_id
role
created_at
```

### vault_profiles

Profile assignments per user per vault.
```text
id (snowflake bigint string)
vault_id
user_id
profile_id
created_at
```

### vault_keys

Encrypted vault keys for users.
```text
id (snowflake bigint string)
vault_id
user_id
encrypted_vault_key
created_at
```

Each user has **their own copy of the vault key**.

### items

Items inside vault.
```text
id (snowflake bigint string)
vault_id
encrypted_data
created_at
updated_at
version
```

encrypted_data contains:
```text
title
fields
sections
folder_ids
notes
tags
```

### capsules

Secure share links and their encrypted payloads.
```text
id (snowflake bigint string)
workspace_id
creator_id
type
encrypted_payload
access_policy
expires_at
view_limit
view_count
created_at
```

### events

Event log for synchronization.
```text
id (snowflake bigint string)
vault_id
actor_id
event_type
encrypted_payload
version
payload_schema_version
idempotency_key (nullable, unique per vault when set)
client_created_at (nullable)
created_at
```

### Event Types
```text
ITEM_CREATE
ITEM_UPDATE
ITEM_DELETE
FOLDER_CREATE
FOLDER_UPDATE
FOLDER_DELETE
ITEM_FOLDER_ASSIGN
VAULT_CREATE
VAULT_SHARE
VAULT_KEY_ROTATION
DEVICE_ADD
DEVICE_REMOVE
```

### attachments

Attachments are stored separately.
```text
id (snowflake bigint string)
vault_id
item_id
storage_key
encrypted_key
size
created_at
```

Encrypted files and favicons are stored in object storage, e.g. S3, MinIO, under the shared `attachments/...` keyspace.
`item_id` is the client-side item id from the encrypted event log and is not a foreign key to the legacy `items` table.

---

## Enterprise Extensions

Enterprise **never modifies** core tables. It only adds new tables and migrations.
Enterprise schema docs live in `okkey-enterprise/docs/architecture/05_database_extensions.md`.

Example enterprise tables:
```text
audit_logs
sso_configs
scim_directory
organization_policies
enterprise_settings
```

---

## Relationships
```text
User
└ Devices
└ Sessions
└ WorkspaceMembers
└ VaultMembers
└ VaultProfiles

Workspace
└ WorkspaceMembers
└ Roles
└ Profiles
└ Vaults
└ Capsules

Vault
└ VaultMembers
└ VaultProfiles
└ VaultKeys
└ Items
└ Events
└ Attachments
```

---

## Indexes

Critically important indexes:
```text
users.email
devices.user_id
sessions.user_id
sessions.expires_at
workspaces.owner_id
workspace_members.workspace_id
workspace_members.user_id
vaults.workspace_id
vault_members.vault_id
vault_members.user_id
vault_profiles.vault_id
vault_profiles.user_id
vault_keys.vault_id
vault_keys.user_id
items.vault_id
events.vault_id
events.created_at
attachments.vault_id
```

---

## Migrations (Core)

Core migrations live in:
`services/api/migrations/`

Initial schema migration:
`services/api/migrations/0001_init.sql`

Enterprise extensions must add their own migrations without modifying Core tables.
