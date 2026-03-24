import type { UUID } from "../uuid.js";
import {
  FOLDER_PLAINTEXT_SCHEMA_VERSION,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
  type FolderPlaintextV1,
  type ItemFolderAssignPlaintextV1,
} from "./types.js";

const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseFolderPlaintextUtf8(bytes: Uint8Array): FolderPlaintextV1 | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) return undefined;
  if (raw.schemaVersion !== FOLDER_PLAINTEXT_SCHEMA_VERSION) return undefined;
  if (typeof raw.folderId !== "string" || !isUuid(raw.folderId)) return undefined;
  if (typeof raw.vaultId !== "string" || !isUuid(raw.vaultId)) return undefined;
  if (typeof raw.name !== "string") return undefined;
  if (raw.parentFolderId !== null && (typeof raw.parentFolderId !== "string" || !isUuid(raw.parentFolderId))) {
    return undefined;
  }
  if (typeof raw.createdAtMs !== "number" || !Number.isFinite(raw.createdAtMs)) return undefined;
  if (typeof raw.updatedAtMs !== "number" || !Number.isFinite(raw.updatedAtMs)) return undefined;
  if (raw.deleted !== undefined && typeof raw.deleted !== "boolean") return undefined;

  return {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
    folderId: raw.folderId as UUID,
    vaultId: raw.vaultId as UUID,
    name: raw.name,
    parentFolderId: (raw.parentFolderId as UUID | null) ?? null,
    createdAtMs: raw.createdAtMs,
    updatedAtMs: raw.updatedAtMs,
    ...(raw.deleted === true ? { deleted: true } : {}),
  };
}

export function parseItemFolderAssignPlaintextUtf8(
  bytes: Uint8Array,
): ItemFolderAssignPlaintextV1 | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) return undefined;
  if (raw.schemaVersion !== ITEM_FOLDER_ASSIGN_SCHEMA_VERSION) return undefined;
  if (typeof raw.itemId !== "string" || !isUuid(raw.itemId)) return undefined;
  if (typeof raw.vaultId !== "string" || !isUuid(raw.vaultId)) return undefined;
  if (raw.folderId !== null && (typeof raw.folderId !== "string" || !isUuid(raw.folderId))) {
    return undefined;
  }

  return {
    schemaVersion: ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
    itemId: raw.itemId as UUID,
    vaultId: raw.vaultId as UUID,
    folderId: (raw.folderId as UUID | null) ?? null,
  };
}
