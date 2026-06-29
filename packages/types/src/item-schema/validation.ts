import type { ItemFieldV2, ItemPlaintextV2, ItemSectionV2, FieldValueV2 } from "./types.js";
import { ITEM_PLAINTEXT_SCHEMA_VERSION_V2 } from "./types.js";
import { emptyValueForFieldType } from "./field-defaults.js";

export interface ItemPlaintextValidationIssue {
  path: string;
  message: string;
}

export interface ItemPlaintextValidationResult {
  ok: boolean;
  issues: ItemPlaintextValidationIssue[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function normalizeFieldValue(type: string, value: unknown): FieldValueV2 {
  if (!isRecord(value) && value !== null && value !== undefined) {
    return { kind: "unknown", declaredType: type, raw: value };
  }
  if (!isRecord(value)) {
    return emptyValueForFieldType(type);
  }
  const kind = value.kind;
  if (typeof kind !== "string") {
    return { kind: "unknown", declaredType: type, raw: value };
  }
  switch (kind) {
    case "text":
      return { kind: "text", text: typeof value.text === "string" ? value.text : "" };
    case "password":
      return { kind: "password", password: typeof value.password === "string" ? value.password : "" };
    case "totp":
      return {
        kind: "totp",
        secretBase32: typeof value.secretBase32 === "string" ? value.secretBase32 : "",
        periodSeconds: typeof value.periodSeconds === "number" ? value.periodSeconds : 30,
        digits: typeof value.digits === "number" ? value.digits : 6,
      };
    case "url":
      return { kind: "url", url: typeof value.url === "string" ? value.url : "" };
    case "note":
      return { kind: "note", note: typeof value.note === "string" ? value.note : "" };
    case "file":
      return {
        kind: "file",
        attachmentId: typeof value.attachmentId === "string" ? value.attachmentId : undefined,
        name: typeof value.name === "string" ? value.name : "",
        mimeType: typeof value.mimeType === "string" ? value.mimeType : undefined,
        sizeBytes: typeof value.sizeBytes === "number" ? value.sizeBytes : undefined,
        url: typeof value.url === "string" ? value.url : undefined,
      };
    case "unknown":
      return {
        kind: "unknown",
        declaredType: typeof value.declaredType === "string" ? value.declaredType : type,
        raw: "raw" in value ? value.raw : value,
      };
    default:
      return { kind: "unknown", declaredType: type, raw: value };
  }
}

export function normalizeItemFieldV2(raw: unknown): ItemFieldV2 | undefined {
  if (!isRecord(raw)) return undefined;
  const id = raw.id;
  const type = raw.type;
  const sectionId = raw.sectionId;
  const order = raw.order;
  if (typeof id !== "string" || typeof type !== "string" || typeof sectionId !== "string") {
    return undefined;
  }
  const orderNum = typeof order === "number" && Number.isFinite(order) ? order : 0;
  const label = typeof raw.label === "string" ? raw.label : undefined;
  return {
    id,
    type,
    sectionId,
    order: orderNum,
    label,
    value: normalizeFieldValue(type, raw.value),
  };
}

export function normalizeItemSectionV2(raw: unknown): ItemSectionV2 | undefined {
  if (!isRecord(raw)) return undefined;
  const id = raw.id;
  const title = raw.title;
  const order = raw.order;
  if (typeof id !== "string" || typeof title !== "string") {
    return undefined;
  }
  const orderNum = typeof order === "number" && Number.isFinite(order) ? order : 0;
  const isPreset = typeof raw.isPreset === "boolean" ? raw.isPreset : undefined;
  return { id, title, order: orderNum, isPreset };
}

/** Best-effort structural normalization for forward-compatible clients. */
export function normalizeItemPlaintextV2(raw: unknown): ItemPlaintextV2 | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.schemaVersion !== ITEM_PLAINTEXT_SCHEMA_VERSION_V2) return undefined;
  const itemId = raw.itemId;
  const vaultId = raw.vaultId;
  const title = raw.title;
  const categoryId = raw.categoryId;
  const createdAtMs = raw.createdAtMs;
  const updatedAtMs = raw.updatedAtMs;
  if (
    typeof itemId !== "string" ||
    typeof vaultId !== "string" ||
    typeof title !== "string" ||
    typeof categoryId !== "string" ||
    typeof createdAtMs !== "number" ||
    typeof updatedAtMs !== "number"
  ) {
    return undefined;
  }
  const sectionsRaw = Array.isArray(raw.sections) ? raw.sections : [];
  const fieldsRaw = Array.isArray(raw.fields) ? raw.fields : [];
  const sections: ItemSectionV2[] = [];
  for (const s of sectionsRaw) {
    const n = normalizeItemSectionV2(s);
    if (n) sections.push(n);
  }
  const fields: ItemFieldV2[] = [];
  for (const f of fieldsRaw) {
    const n = normalizeItemFieldV2(f);
    if (n) fields.push(n);
  }
  const deleted = typeof raw.deleted === "boolean" ? raw.deleted : undefined;
  const deletedAtMs =
    typeof raw.deletedAtMs === "number" && Number.isFinite(raw.deletedAtMs)
      ? raw.deletedAtMs
      : undefined;
  const archived = typeof raw.archived === "boolean" ? raw.archived : undefined;
  const tagsRaw = Array.isArray(raw.tags) ? raw.tags : [];
  const tags = tagsRaw
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId,
    vaultId,
    title,
    categoryId,
    createdAtMs,
    updatedAtMs,
    deleted,
    ...(deletedAtMs !== undefined ? { deletedAtMs } : {}),
    archived,
    sections,
    fields,
    ...(tags.length > 0 ? { tags } : {}),
  };
}

/** Structural checks without knowing secret values. */
export function validateItemPlaintextV2(item: ItemPlaintextV2): ItemPlaintextValidationResult {
  const issues: ItemPlaintextValidationIssue[] = [];
  if (item.schemaVersion !== ITEM_PLAINTEXT_SCHEMA_VERSION_V2) {
    issues.push({ path: "schemaVersion", message: "expected v2" });
  }
  if (!item.categoryId) {
    issues.push({ path: "categoryId", message: "required" });
  }
  const sectionIds = new Set(item.sections.map((s) => s.id));
  for (const f of item.fields) {
    if (!sectionIds.has(f.sectionId)) {
      issues.push({ path: `fields[${f.id}].sectionId`, message: "unknown section" });
    }
  }
  if (!item.deleted) {
    if (item.sections.length === 0 && item.fields.length > 0) {
      issues.push({ path: "sections", message: "fields present but no sections" });
    }
  }
  return { ok: issues.length === 0, issues };
}
