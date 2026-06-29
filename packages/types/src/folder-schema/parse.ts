import type { EntityId } from "../entity-id.js";
import { isEntityId } from "../entity-id.js";
import {
  FOLDER_PLAINTEXT_SCHEMA_VERSION,
  FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2,
  ITEM_FAVORITE_SET_SCHEMA_VERSION_V2,
  type FolderPlaintextV1,
  type FolderPlaintextV2,
  type ItemFolderAssignPlaintextV1,
  type ItemFolderAssignPlaintextV2,
  type ItemFavoriteSetPlaintextV2,
} from "./types.js";

function isEntityIdField(value: string): boolean {
  return isEntityId(value);
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
  if (typeof raw.folderId !== "string" || !isEntityIdField(raw.folderId)) return undefined;
  if (typeof raw.vaultId !== "string" || !isEntityIdField(raw.vaultId)) return undefined;
  if (typeof raw.name !== "string") return undefined;
  if (raw.parentFolderId !== null && (typeof raw.parentFolderId !== "string" || !isEntityIdField(raw.parentFolderId))) {
    return undefined;
  }
  if (typeof raw.createdAtMs !== "number" || !Number.isFinite(raw.createdAtMs)) return undefined;
  if (typeof raw.updatedAtMs !== "number" || !Number.isFinite(raw.updatedAtMs)) return undefined;
  if (raw.deleted !== undefined && typeof raw.deleted !== "boolean") return undefined;

  return {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
    folderId: raw.folderId as EntityId,
    vaultId: raw.vaultId as EntityId,
    name: raw.name,
    parentFolderId: (raw.parentFolderId as EntityId | null) ?? null,
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
  if (typeof raw.itemId !== "string" || !isEntityIdField(raw.itemId)) return undefined;
  if (typeof raw.vaultId !== "string" || !isEntityIdField(raw.vaultId)) return undefined;
  if (raw.folderId !== null && (typeof raw.folderId !== "string" || !isEntityIdField(raw.folderId))) {
    return undefined;
  }

  return {
    schemaVersion: ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
    itemId: raw.itemId as EntityId,
    vaultId: raw.vaultId as EntityId,
    folderId: (raw.folderId as EntityId | null) ?? null,
  };
}

export function parseFolderPlaintextV2Utf8(bytes: Uint8Array): FolderPlaintextV2 | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) return undefined;
  if (raw.schemaVersion !== FOLDER_PLAINTEXT_SCHEMA_VERSION_V2) return undefined;
  if (typeof raw.folderId !== "string" || !isEntityIdField(raw.folderId)) return undefined;
  if (typeof raw.workspaceId !== "string" || !isEntityIdField(raw.workspaceId)) return undefined;
  if (typeof raw.name !== "string") return undefined;
  if (raw.parentFolderId !== null && (typeof raw.parentFolderId !== "string" || !isEntityIdField(raw.parentFolderId))) {
    return undefined;
  }
  if (typeof raw.createdAtMs !== "number" || !Number.isFinite(raw.createdAtMs)) return undefined;
  if (typeof raw.updatedAtMs !== "number" || !Number.isFinite(raw.updatedAtMs)) return undefined;
  if (raw.deleted !== undefined && typeof raw.deleted !== "boolean") return undefined;
  if (
    raw.sortOrder !== undefined &&
    (typeof raw.sortOrder !== "number" || !Number.isInteger(raw.sortOrder) || raw.sortOrder < 0)
  ) {
    return undefined;
  }

  return {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
    folderId: raw.folderId as EntityId,
    workspaceId: raw.workspaceId as EntityId,
    name: raw.name,
    parentFolderId: (raw.parentFolderId as EntityId | null) ?? null,
    createdAtMs: raw.createdAtMs,
    updatedAtMs: raw.updatedAtMs,
    ...(typeof raw.sortOrder === "number" ? { sortOrder: raw.sortOrder } : {}),
    ...(raw.deleted === true ? { deleted: true } : {}),
  };
}

export function parseItemFolderAssignPlaintextV2Utf8(
  bytes: Uint8Array,
): ItemFolderAssignPlaintextV2 | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) return undefined;
  if (raw.schemaVersion !== ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2) return undefined;
  if (typeof raw.itemId !== "string" || !isEntityIdField(raw.itemId)) return undefined;
  if (typeof raw.workspaceId !== "string" || !isEntityIdField(raw.workspaceId)) return undefined;
  if (raw.folderId !== null && (typeof raw.folderId !== "string" || !isEntityIdField(raw.folderId))) {
    return undefined;
  }

  return {
    schemaVersion: ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2,
    itemId: raw.itemId as EntityId,
    workspaceId: raw.workspaceId as EntityId,
    folderId: (raw.folderId as EntityId | null) ?? null,
  };
}

export function parseItemFavoriteSetPlaintextV2Utf8(
  bytes: Uint8Array,
): ItemFavoriteSetPlaintextV2 | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) return undefined;
  if (raw.schemaVersion !== ITEM_FAVORITE_SET_SCHEMA_VERSION_V2) return undefined;
  if (typeof raw.itemId !== "string" || !isEntityIdField(raw.itemId)) return undefined;
  if (typeof raw.workspaceId !== "string" || !isEntityIdField(raw.workspaceId)) return undefined;
  if (typeof raw.favorite !== "boolean") return undefined;

  return {
    schemaVersion: ITEM_FAVORITE_SET_SCHEMA_VERSION_V2,
    itemId: raw.itemId as EntityId,
    workspaceId: raw.workspaceId as EntityId,
    favorite: raw.favorite,
  };
}
