import { ITEM_PLAINTEXT_SCHEMA_VERSION } from "../item-plaintext-v1.js";
import type { ItemPlaintextV1 } from "../item-plaintext-v1.js";
import type { ItemPlaintextV2 } from "./types.js";
import { ITEM_PLAINTEXT_SCHEMA_VERSION_V2 } from "./types.js";
import { migrateItemPlaintextV1ToV2 } from "./migrate.js";
import { normalizeItemPlaintextV2 } from "./validation.js";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function parseItemPlaintextV1(raw: unknown): ItemPlaintextV1 | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.schemaVersion !== ITEM_PLAINTEXT_SCHEMA_VERSION) return undefined;
  if (
    typeof raw.itemId !== "string" ||
    typeof raw.vaultId !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.createdAtMs !== "number" ||
    typeof raw.updatedAtMs !== "number"
  ) {
    return undefined;
  }
  const deleted = typeof raw.deleted === "boolean" ? raw.deleted : undefined;
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
    itemId: raw.itemId,
    vaultId: raw.vaultId,
    title: raw.title,
    createdAtMs: raw.createdAtMs,
    updatedAtMs: raw.updatedAtMs,
    deleted,
  };
}

/**
 * Parse decrypted JSON and normalize to v2. Returns `null` for unsupported schema versions
 * (replay should skip those events).
 */
export function parseAndNormalizeItemPlaintextUtf8(bytes: Uint8Array): ItemPlaintextV2 | null {
  const text = new TextDecoder().decode(bytes);
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const sv = raw.schemaVersion;
  if (sv === ITEM_PLAINTEXT_SCHEMA_VERSION) {
    const v1 = parseItemPlaintextV1(raw);
    if (!v1) return null;
    return migrateItemPlaintextV1ToV2(v1);
  }
  if (sv === ITEM_PLAINTEXT_SCHEMA_VERSION_V2) {
    return normalizeItemPlaintextV2(raw) ?? null;
  }
  return null;
}
