# Database Schema

This document describes the main database schema of Okkey.

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
vaults
vault_members
vault_keys
items
events
attachments
```

### users

Users table.
```text
id (uuid)
email
public_key
encrypted_private_key
server_key_share
created_at
updated_at
```

### devices

Registered devices.
```text
id (uuid)
user_id
device_name
device_public_key
device_share
created_at
last_seen_at
```

### sessions

Active user sessions.
```text
id (uuid)
user_id
device_id
token_hash
expires_at
created_at
```

### workspaces

Logical vault group.
```text
id (uuid)
name
owner_id
created_at
```

### vaults

Vault is a safe.
```text
id (uuid)
workspace_id
name
created_at
updated_at
```

### vault_members

Users who have access to the vault.
```text
id (uuid)
vault_id
user_id
role
created_at
```

### vault_keys

Encrypted vault keys for users.
```text
id (uuid)
vault_id
user_id
encrypted_vault_key
created_at
```

Each user has **their own copy of the vault key**.

### items

Items inside vault.
```text
id (uuid)
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
notes
tags
```

### events

Event log for synchronization.
```text
id (uuid)
vault_id
actor_id
event_type
encrypted_payload
version
created_at
```

### Event Types
```text
ITEM_CREATE
ITEM_UPDATE
ITEM_DELETE
VAULT_CREATE
VAULT_SHARE
VAULT_KEY_ROTATION
DEVICE_ADD
DEVICE_REMOVE
```

### attachments

Attachments are stored separately.
```text
id (uuid)
vault_id
item_id
storage_key
encrypted_key
size
created_at
```

Files are stored in object storage, e.g. S3, MinIO

---

## Relationships
```text
User
└ Devices
└ Sessions
└ VaultMembers

Workspace
└ Vaults

Vault
└ VaultMembers
└ VaultKeys
└ Items
└ Events
```

---

## Indexes

Critically important indexes:
```text
users.email
devices.user_id
sessions.user_id
vault_members.vault_id
vault_keys.user_id
items.vault_id
events.vault_id
```

---

## Security Considerations

Database stores only:
- encrypted vault data
- encrypted vault keys
- encrypted events

Server cannot:
- decrypt vault
- read passwords
- read secrets

---

## Data Integrity

Each item has:
- version
- timestamp

This is used for:
- conflict resolution
- event ordering
