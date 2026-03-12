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
