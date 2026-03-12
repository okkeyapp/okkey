Before implementing any feature read:

- ARCHITECTURE.md

## Import Rules
- apps → can import packages
- packages → can import types
- services → can import packages/types
- packages → CANNOT import apps

## Core Architecture Principles
1. All cryptographic operations are performed only in Rust crypto engine.
2. Backend never has access to decrypted vault data.
3. All clients use a single Vault SDK.
4. Synchronization is implemented via event log.
5. All applications use shared packages.
