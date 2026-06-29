import type { EntityId } from "../entity-id.js";

/** Wire schema version inside encrypted JSON (`schemaVersion`). */
export const ITEM_PLAINTEXT_SCHEMA_VERSION_V1 = 1 as const;
export const ITEM_PLAINTEXT_SCHEMA_VERSION_V2 = 2 as const;

export const ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST = ITEM_PLAINTEXT_SCHEMA_VERSION_V2;

/** Stable category codes (extend by adding new ids + presets). */
export const ITEM_CATEGORY_LOGIN = "login" as const;
export const ITEM_CATEGORY_SECURE_NOTE = "secure_note" as const;
export const ITEM_CATEGORY_CREDIT_CARD = "credit_card" as const;

export type ItemCategoryId =
  | typeof ITEM_CATEGORY_LOGIN
  | typeof ITEM_CATEGORY_SECURE_NOTE
  | typeof ITEM_CATEGORY_CREDIT_CARD
  | (string & {});

/**
 * Field types for Core v1 registry. Unknown future types are accepted on the wire
 * and normalized to {@link FieldValueUnknown}.
 */
export type FieldTypeId =
  | "text"
  | "password"
  | "totp"
  | "url"
  | "note"
  | "file"
  | (string & {});

export type FieldValueV2 =
  | FieldValueText
  | FieldValuePassword
  | FieldValueTotp
  | FieldValueUrl
  | FieldValueNote
  | FieldValueFile
  | FieldValueUnknown;

export interface FieldValueText {
  kind: "text";
  text: string;
}

export interface FieldValuePassword {
  kind: "password";
  password: string;
}

export interface FieldValueTotp {
  kind: "totp";
  /** Base32 secret; empty until user configures */
  secretBase32: string;
  periodSeconds?: number;
  digits?: number;
}

export interface FieldValueUrl {
  kind: "url";
  url: string;
}

export interface FieldValueNote {
  kind: "note";
  note: string;
}

export interface FieldValueFile {
  kind: "file";
  /** Opaque client-side ref when implemented (5.3+); empty in Core v1 */
  attachmentId?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
}

/** Forward-compat bucket for unrecognized `type` / shape (older clients keep raw JSON). */
export interface FieldValueUnknown {
  kind: "unknown";
  declaredType: string;
  raw: unknown;
}

export interface ItemSectionV2 {
  id: string;
  title: string;
  order: number;
  /** Preset sections stay first by convention; UX may still reorder in 5.3. */
  isPreset?: boolean;
}

export interface ItemFieldV2 {
  id: string;
  type: FieldTypeId;
  sectionId: string;
  order: number;
  label?: string;
  value: FieldValueV2;
}

/**
 * Plaintext item v2 (client-only). Encrypted as UTF-8 JSON with VaultKey for sync.
 * @see ITEM_PLAINTEXT_SCHEMA_VERSION_V2
 */
export interface ItemPlaintextV2 {
  schemaVersion: typeof ITEM_PLAINTEXT_SCHEMA_VERSION_V2;
  itemId: EntityId;
  vaultId: EntityId;
  title: string;
  categoryId: ItemCategoryId;
  createdAtMs: number;
  updatedAtMs: number;
  deleted?: boolean;
  sections: ItemSectionV2[];
  fields: ItemFieldV2[];
  /** User-defined labels; omitted when empty. */
  tags?: string[];
}
