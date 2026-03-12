# Okkey Architecture

Okkey is a zero-knowledge password manager.

Main architecture principles:

1. Zero-knowledge encryption
2. Client-side cryptography
3. Split-key architecture
4. Event log synchronization
5. Offline-first
6. SaaS + Self-hosted deployment

Clients:
- Web
- Mobile
- Desktop
- Browser extension

Main components:

- Vault SDK
- Rust Crypto Engine
- Backend API
- Event Sync Engine

See details in documents:

- docs/architecture/01_system_overview.md
- docs/architecture/02_repo_structure.md
- docs/architecture/03_crypto_architecture.md
- docs/architecture/04_vault_architecture.md
- docs/architecture/05_sync_architecture.md
- docs/architecture/06_backend_architecture.md
- docs/architecture/07_clients_architecture.md
- docs/architecture/08_security_model.md
- docs/architecture/09_self_hosting.md
- docs/architecture/10_authentication_flows.md
- docs/architecture/11_database_schema.md
