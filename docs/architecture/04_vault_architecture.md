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

Folder definitions, renames, moves, deletes, and per-user **item → folder** assignments are appended to the **same vault event log** as items, but ciphertext uses a **personal metadata key** derived from the user’s password share **C** and `vaultId` (SHA-256 domain separation), not the shared `VaultKey`. Workspace members who share a vault therefore cannot decrypt another user’s folder tree or assignments. See `05_sync_architecture.md` (`FOLDER_*`, `ITEM_FOLDER_ASSIGN`).

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

### Item plaintext schema (client-only)

Items are encrypted **only on the client** with **VaultKey** (`@okkey/crypto/vault-item` `encryptVaultItemPayload`) and sent as sync `encryptedPayload`; the server stores opaque bytes and never parses JSON.

- **v1** (`schemaVersion: 1`): minimal fields — `itemId`, `vaultId`, `title`, `createdAtMs`, `updatedAtMs`, optional `deleted` tombstone. Legacy; new writes use v2.
- **v2** (`schemaVersion: 2`, `ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST`): adds `categoryId`, `sections[]`, `fields[]` (typed values: text, password, TOTP, URL, note, file placeholder, unknown forward-compat). Preset sections/fields per category are defined in `@okkey/types` (`createPresetItemPlaintextV2`, category registry). Replay normalizes v1 → v2 via `migrateItemPlaintextV1ToV2` / `parseAndNormalizeItemPlaintextUtf8`.

Append request builders: `@okkey/sync/item-sync`. Adding a category or field type: extend the registry in `@okkey/types` and bump docs; keep **unknown** field/value handling so older clients do not break on newer payloads.

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

Core v1 backend flow:
- `POST /vaults/:vaultId/shares` adds/updates explicit `vault_members` row, stores `vault_keys.encrypted_vault_key` for recipient, and appends sync `VAULT_SHARE`.
- `POST /vaults/:vaultId/shares/revoke` removes explicit recipient membership, applies wrapped rotated keys for all remaining active recipients, and appends `VAULT_KEY_ROTATION`.
- `GET /vaults/:vaultId/key` returns current user wrapped key only (never plaintext `VaultKey`).

Security constraints:
- VaultKey plaintext never leaves the client.
- Server validates ACL and workspace membership, but stores only ciphertext wraps.
- Revoke + rotation blocks revoked users from decrypting **new** ciphertext (old local snapshots remain an accepted trade-off).

---

## Capsules (Secure Sharing)

Capsules allow secure sharing of an entire item, a specific field, or a file. Capsules support controls such as expiration time, view limits, password access, and recipient restrictions. The shared content is decrypted only on the recipient side.

Core v1 capsules protocol notes:
- Server stores only opaque `encrypted_payload` and non-secret policies (expiry/view limit/password KDF hash).
- Public access is by unguessable capsule id + optional password gate; decryption key transport is client responsibility.
- Allowed key transport modes: `fragment` and `out_of_band` only.
- Backend rate-limits public open attempts and never stores plaintext password (only salted KDF hash).
- Unsafe key placement in URL query/path is blocked by policy (`CAPSULE_UNSAFE_KEY_TRANSPORT`), because query/path values can leak via request logs and referrer chains.

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
