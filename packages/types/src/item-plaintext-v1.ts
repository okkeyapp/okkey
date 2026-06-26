import type { EntityId } from "./entity-id.js";

/**
 * Plaintext item model v1 (client-only). Serialized to JSON, then encrypted with VaultKey for sync payloads.
 * Server never sees this structure.
 * @see ITEM_PLAINTEXT_SCHEMA_VERSION_V2 — v2 adds categories, sections, fields.
 */
export const ITEM_PLAINTEXT_SCHEMA_VERSION = 1 as const;

export interface ItemPlaintextV1 {
  schemaVersion: typeof ITEM_PLAINTEXT_SCHEMA_VERSION;
  itemId: EntityId;
  vaultId: EntityId;
  /** User-visible label; v2 keeps title; field catalog is in {@link import("./item-schema/types.js").ItemPlaintextV2} */
  title: string;
  /** Epoch ms for deterministic replay ordering */
  createdAtMs: number;
  updatedAtMs: number;
  /** When true, item is removed from materialized state after replay */
  deleted?: boolean;
}
