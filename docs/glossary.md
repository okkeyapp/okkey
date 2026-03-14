# Glossary

This glossary defines common terms used across Okkey Core and Okkey Enterprise.

## Core
The open-source core in the `okkey/` repository. Core must run fully without any Enterprise code. It provides clients, shared SDKs, the core backend services, and the Rust crypto engine.

## Enterprise
Private extensions in the `okkey-enterprise/` repository. Enterprise adds optional capabilities on top of Core and never replaces Core behavior.

## Plugin
A module loaded via the Core Plugin Registry that implements one or more Feature Interfaces. Plugins can add routes, background workers, or database migrations without modifying Core behavior.

## Feature Interface
A stable extension contract exposed by the Core backend (for example: `AuthProvider`, `PolicyProvider`, `AuditProvider`). Plugins implement Feature Interfaces to integrate Enterprise capabilities.

## User
A registered Okkey account that can authenticate and use the product.

## Device
A trusted device from which a user signs in. New devices require explicit confirmation before becoming trusted.

## Storage / Account
A user account with all encrypted data, including workspaces, vaults, and items. Access is protected by the master password.

## Workspace
A group of vaults and members. Workspaces can be personal, family, or company spaces. Feature availability can depend on the workspace plan.

## Member
A user who has access to a workspace. Members are invited by email and receive Roles and Profiles.

## Plan
A workspace subscription tier that controls available functionality. Plans can be personal or business tiers and are enforced through feature gating.

## Vault
A secure container inside a workspace that stores items. Vaults can be personal or shared. Each vault has its own encryption key.

## Item
A record stored in a vault (login, card, secure note, SSH key, and so on). Items contain fields and metadata.

## Field
A typed value inside an item (text, password, TOTP, URL, note, file, etc.).

## Section
A named grouping of fields inside an item. Preset sections come first; custom sections can be reordered with their fields.

## Folder
A personal, user-only grouping of items. Folders can be nested. Deleting a folder does not delete the contained items.

## Capsule
A secure sharing mechanism for items, fields, or files. Capsules support access controls such as expiration, view limits, password access, and recipient restrictions.

## Monitoring
Security analytics and health metrics for a workspace (password strength, reuse, weak passwords, passkey/2FA coverage, and related reports).

## Tools
Utility functions available in the product: generator, import, and export workflows.

## Role
Workspace-level permissions for settings and administrative actions (for example: Owner, Admin, User). Custom roles can be defined.

## Profile
Vault-level and item-level access profiles that define permissions for records, fields, and item actions. Profiles are applied per member and per vault.
