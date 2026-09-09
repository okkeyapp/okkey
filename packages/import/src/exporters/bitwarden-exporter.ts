import { CipherType } from "../types/enums.js";
import type { ExportSourceItem } from "./okkey-exporter.js";
import { collectLoginLike, fieldValueToText, readFieldText, toCsv } from "./export-field-utils.js";
import { maybePasswordProtectJson } from "./okkey-exporter.js";
import { createZipFromFiles } from "../utils/zip.js";
import { normalizeFolderPath } from "../importers/okkey-json-importer.js";

function folderIdForPath(path: string | null, folderIds: Map<string, string>): string | null {
  if (!path) {
    return null;
  }
  const normalized = normalizeFolderPath(path);
  return folderIds.get(normalized) ?? null;
}

export async function buildBitwardenJsonExport(params: {
  items: ExportSourceItem[];
  includeFolders?: boolean;
  password?: string;
}): Promise<Uint8Array> {
  const includeFolders = params.includeFolders !== false;
  const folderIds = new Map<string, string>();
  const folders: Array<{ id: string; name: string }> = [];

  if (includeFolders) {
    for (const source of params.items) {
      const path = source.folderPath ? normalizeFolderPath(source.folderPath) : "";
      if (!path || folderIds.has(path)) {
        continue;
      }
      const id = `folder-${folderIds.size + 1}`;
      folderIds.set(path, id);
      folders.push({ id, name: path });
    }
  }

  const items = params.items
    .filter((source) => !source.item.deleted)
    .map((source) => itemToBitwardenCipher(source, folderIds));

  const payload = {
    encrypted: false,
    folders,
    items,
  };
  let json = `${JSON.stringify(payload, null, 2)}\n`;
  json = await maybePasswordProtectJson(json, params.password);
  return new TextEncoder().encode(json);
}

export async function buildBitwardenCsvExport(params: {
  items: ExportSourceItem[];
  includeFolders?: boolean;
}): Promise<Uint8Array> {
  const includeFolders = params.includeFolders !== false;
  const headers = [
    "folder",
    "favorite",
    "type",
    "name",
    "notes",
    "fields",
    "reprompt",
    "login_uri",
    "login_username",
    "login_password",
    "login_totp",
  ];
  const rows = params.items
    .filter((source) => !source.item.deleted)
    .map((source) => {
      const login = collectLoginLike(source.item);
      const type =
        source.item.categoryId === "credit_card"
          ? "card"
          : source.item.categoryId === "secure_note"
            ? "note"
            : "login";
      return [
        includeFolders ? source.folderPath ?? "" : "",
        source.favorite ? "1" : "",
        type,
        source.item.title,
        login.notes,
        "",
        "",
        login.url,
        login.username,
        login.password,
        login.totp,
      ];
    });
  return new TextEncoder().encode(toCsv(headers, rows));
}

export async function buildBitwardenZipExport(params: {
  items: ExportSourceItem[];
  includeFolders?: boolean;
  password?: string;
}): Promise<Uint8Array> {
  const jsonBytes = await buildBitwardenJsonExport({
    items: params.items,
    includeFolders: params.includeFolders,
    password: params.password,
  });
  const files: Record<string, Uint8Array | string> = {
    "data.json": jsonBytes,
  };
  for (const source of params.items) {
    if (!source.attachmentBytesByFieldId) {
      continue;
    }
    for (const [fieldId, blob] of source.attachmentBytesByFieldId.entries()) {
      const path = `attachments/${source.item.itemId}/${blob.fileName || fieldId}`;
      files[path] = blob.bytes;
    }
  }
  return createZipFromFiles(files);
}

function itemToBitwardenCipher(
  source: ExportSourceItem,
  folderIds: Map<string, string>,
): Record<string, unknown> {
  const item = source.item;
  const folderId = folderIdForPath(source.folderPath, folderIds);
  const base = {
    id: item.itemId,
    folderId,
    favorite: source.favorite,
    name: item.title,
    notes: collectLoginLike(item).notes || null,
    fields: [] as Array<{ name: string; value: string; type: number }>,
    reprompt: 0,
  };

  if (item.categoryId === "credit_card") {
    const expiry = readFieldText(item, "card-expiry");
    const [expMonth, expYear] = splitExpiry(expiry);
    return {
      ...base,
      type: CipherType.Card,
      card: {
        cardholderName: readFieldText(item, "card-holder") || null,
        brand: null,
        number: readFieldText(item, "card-number") || null,
        expMonth,
        expYear,
        code: readFieldText(item, "card-pin") || null,
      },
      login: null,
      secureNote: null,
      identity: null,
    };
  }

  if (item.categoryId === "secure_note" || item.categoryId === "personal_data") {
    const extraNotes = [
      collectLoginLike(item).notes,
      ...item.fields
        .filter((field) => !["note"].includes(field.id))
        .map((field) => `${field.label ?? field.id}: ${fieldValueToText(field)}`),
    ]
      .filter(Boolean)
      .join("\n");
    return {
      ...base,
      type: CipherType.SecureNote,
      notes: extraNotes || null,
      secureNote: { type: 0 },
      login: null,
      card: null,
      identity: null,
    };
  }

  const login = collectLoginLike(item);
  return {
    ...base,
    type: CipherType.Login,
    login: {
      uris: login.url ? [{ uri: login.url }] : [],
      username: login.username || null,
      password: login.password || null,
      totp: login.totp || null,
    },
    secureNote: null,
    card: null,
    identity: null,
  };
}

function splitExpiry(value: string): [string | null, string | null] {
  const match = value.match(/(\d{1,2})\s*[\/.-]\s*(\d{2,4})/);
  if (!match) {
    return [null, null];
  }
  return [match[1] ?? null, match[2] ?? null];
}
