# @okkey/types

Public shared types for Okkey Core.

## Usage

```ts
import type {
  AppendEventRequest,
  FetchEventsResult,
  SyncEvent,
} from "@okkey/types";
```

## Item plaintext (vault records)

Encrypted JSON before `encryptVaultItemPayload` uses `schemaVersion` **2** for new data (`ItemPlaintextV2`): `categoryId`, `sections`, `fields` with typed values. Factories: `createPresetItemPlaintextV2`, `createItemDeleteTombstoneV2`. Legacy v1 payloads migrate on replay. See `docs/architecture/04_vault_architecture.md`.
