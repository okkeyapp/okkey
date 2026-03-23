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

Vaults can be personal or shared. A personal vault is created for every member by default, cannot be deleted, and remains in the workspace even if the member is removed. If the member is re-invited, their personal vault and items become available again.

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

## Fields and Sections

Items consist of typed fields (text, password, TOTP, URL, note, file, etc.). Fields are grouped into named sections. Preset sections and fields appear first, while custom sections and fields can be reordered by the user.

---

## Folders

Folders are personal, user-only groupings of items. Folders can be nested. Deleting a folder does not delete items inside it.
Folder definitions and assignments are synchronized as encrypted metadata.

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

### Item plaintext schema v1 (client-only)

Core v1 defines a minimal JSON structure for an item before encryption (`schemaVersion: 1`): stable `itemId`, `vaultId`, a `title` string, `createdAtMs` / `updatedAtMs`, and optional `deleted` for tombstones. Category-specific fields and sections are deferred to task **5.2**. The serialized JSON is encrypted with **VaultKey** (see `@okkey/crypto/vault-item` `encryptVaultItemPayload`) and sent as sync `encryptedPayload`; the server never parses this JSON. Append request builders for the HTTP API live under `@okkey/sync/item-sync`.

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

## Capsules (Secure Sharing)

Capsules allow secure sharing of an entire item, a specific field, or a file. Capsules support controls such as expiration time, view limits, password access, and recipient restrictions. The shared content is decrypted only on the recipient side.

---

## Access Roles

Workspace supports roles. By default there are 3 roles: Owner, Admin, User, each with specific permissions.
Owners and Admins can create custom roles with access rights to workspace settings sections and functional parts of those sections.

---

## Access Profiles

Vault supports customizable profiles.
Profiles are needed for distributing access to records in vaults, record fields, and functional parts of records.

There are 2 built-in profiles that cannot be changed or deleted:
- Extended - automatically applied to Owners and Admins
- Simple - rights to read records and save to personal vault

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
