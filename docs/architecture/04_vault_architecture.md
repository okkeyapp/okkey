# Vault Architecture

Vault is a container for storing secret data.

Vault is the main unit of security and sharing.

---

## Data Hierarchy
```text
Account
  └ Workspace
    └ Vault
      └ Item
        └ Attachment
```

### Workspace

Workspace is a logical vault group.

Example:
- Workspace: Personal
- Workspace: Company

### Vault

Vault is a safe.

Examples:
- Personal
- Team
- DevOps
- Finance

Each vault has its own key (VaultKey)

### Item

Item is a record inside vault.

Example:
- Login
- Credit card
- Secure note
- API key
- SSH key

### Item Structure

Example item structure:
```text
id
vault_id
type
title
fields
tags
created_at
updated_at
```

---

## Encryption Flow
```text
Item data
↓
encrypt
↓
VaultKey
↓
store encrypted
```

---

## Vault Sharing

Vault can be shared with other users.

Each user receives **their own copy of the vault key**.

### Sharing Model
```text
VaultKey
↓
encrypt(UserPublicKey)
↓
EncryptedVaultKey_for_user
```

Server stores only:
- encrypted keys

---

## Access Roles

Workspace supports roles. By default there are 3 roles: owner, admin, user with their own permissions.
Also owner and admin can create additional roles with various access rights to workspace settings sections, as well as to functional parts of these sections.

---

## Access Profiles

Vault supports customizable profiles.
Profiles are needed for distributing access to records in vaults, record fields, and functional parts of records.

There are 2 built-in profiles that cannot be changed or deleted:
- Extended - Automatically applied to owners and admins
- Simple - Rights to read records and save to personal vault

You can also create additional profiles with flexible permissions, for example:
- Freelancer 1 - access to 3 categories of records, to selected record fields, only Mon-Fri 9:00-18:00

---
## Access Storage
Server stores:
- vault_members
- encrypted_vault_keys
- roles
- ...

---

## Removing User Access

When removing a user - delete encrypted key

But user could have saved the old key.

Therefore VaultKey rotation is performed

---

## Vault Key Rotation

Process:
- generate new VaultKey
- decrypt items with old key
- encrypt with new key
- distribute new key

---

## Attachments

Attachments are stored separately.

Object storage - File: encrypted client-side - AttachmentKey: encrypted with VaultKey
