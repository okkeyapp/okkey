import { createPresetItemPlaintextV2, ITEM_CATEGORY_LOGIN, ITEM_CATEGORY_SECURE_NOTE, ITEM_CATEGORY_CREDIT_CARD, normalizeItemPlaintextV2 } from "@okkey/types";
import { generateEntityId } from "@okkey/id";

import { ImportResult } from "../types/import-result.js";
import type { OkkeyNativeImportEntry } from "../types/okkey-export.js";
import { FolderView } from "../types/views/folder.view.js";
import type { Importer } from "./importer.js";
import { normalizeFolderPath } from "./okkey-json-importer.js";

/**
 * Minimal 1PUX parser: expects export.data JSON with accounts[].vaults[].items[].
 * @see https://support.1password.com/1pux-format/
 */
export class OnePassword1PuxImporter implements Importer {
  async parse(data: string): Promise<ImportResult> {
    const result = new ImportResult();
    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      result.success = false;
      result.errorMessage = "Invalid 1Password 1PUX export.data";
      return result;
    }

    const accounts = (parsed as { accounts?: unknown[] })?.accounts;
    if (!Array.isArray(accounts)) {
      result.success = false;
      result.errorMessage = "Invalid 1Password 1PUX export.data";
      return result;
    }

    const pathToIndex = new Map<string, number>();

    for (const account of accounts) {
      const vaults = (account as { vaults?: unknown[] })?.vaults;
      if (!Array.isArray(vaults)) {
        continue;
      }
      for (const vault of vaults) {
        const vaultName =
          typeof (vault as { attrs?: { name?: string } }).attrs?.name === "string"
            ? (vault as { attrs: { name: string } }).attrs.name
            : "1Password";
        const items = (vault as { items?: unknown[] }).items;
        if (!Array.isArray(items)) {
          continue;
        }
        for (const rawItem of items) {
          const entry = map1PuxItem(rawItem, vaultName);
          if (!entry) {
            continue;
          }
          const cipherIndex = result.nativeEntries.length;
          result.nativeEntries.push(entry);
          if (entry.folderPath) {
            ensureFolder(result, pathToIndex, entry.folderPath);
            const folderIndex = pathToIndex.get(entry.folderPath);
            if (folderIndex != null) {
              result.folderRelationships.push([cipherIndex, folderIndex]);
            }
          }
        }
      }
    }

    result.success = true;
    return result;
  }
}

function map1PuxItem(raw: unknown, vaultName: string): OkkeyNativeImportEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as {
    state?: string;
    favorite?: boolean;
    categoryUuid?: string;
    overview?: { title?: string; url?: string; tags?: string[]; icons?: unknown };
    details?: {
      loginFields?: Array<{ designation?: string; value?: string; name?: string }>;
      notesPlain?: string;
      password?: string;
      sections?: Array<{
        title?: string;
        fields?: Array<{ title?: string; value?: { string?: string; concealed?: string; totp?: string; url?: string }; n?: string }>;
      }>;
    };
  };
  if (record.state && record.state !== "active") {
    return null;
  }

  const title = record.overview?.title?.trim() || "Untitled";
  const tags = Array.isArray(record.overview?.tags) ? record.overview.tags.filter(Boolean) : [];
  const categoryUuid = (record.categoryUuid ?? "").toUpperCase();
  const now = Date.now();
  const itemId = generateEntityId();
  const vaultId = "import-temp";

  let item;
  if (categoryUuid.includes("001") || categoryUuid === "001" || !categoryUuid) {
    // Login
    item = createPresetItemPlaintextV2({
      categoryId: ITEM_CATEGORY_LOGIN,
      itemId,
      vaultId,
      title,
      nowMs: now,
    });
    const username =
      record.details?.loginFields?.find((field) => field.designation === "username")?.value ?? "";
    const password =
      record.details?.loginFields?.find((field) => field.designation === "password")?.value ??
      record.details?.password ??
      "";
    setText(item, "login", username);
    setText(item, "password", password);
    if (record.overview?.url) {
      setText(item, "website-1", record.overview.url);
    }
  } else if (categoryUuid.includes("002") || categoryUuid === "002") {
    item = createPresetItemPlaintextV2({
      categoryId: ITEM_CATEGORY_CREDIT_CARD,
      itemId,
      vaultId,
      title,
      nowMs: now,
    });
  } else {
    item = createPresetItemPlaintextV2({
      categoryId: ITEM_CATEGORY_SECURE_NOTE,
      itemId,
      vaultId,
      title,
      nowMs: now,
    });
    if (record.details?.notesPlain) {
      setText(item, "note", record.details.notesPlain);
    }
  }

  if (record.details?.notesPlain && item.categoryId === ITEM_CATEGORY_LOGIN) {
    setText(item, "note", record.details.notesPlain);
  }
  if (tags.length > 0) {
    item = { ...item, tags };
  }

  const normalized = normalizeItemPlaintextV2(item);
  if (!normalized) {
    return null;
  }

  return {
    item: normalized,
    folderPath: normalizeFolderPath(vaultName) || null,
    favorite: Boolean(record.favorite),
    attachmentRefs: [],
  };
}

function setText(
  item: ReturnType<typeof createPresetItemPlaintextV2>,
  fieldId: string,
  text: string,
): void {
  const field = item.fields.find((entry) => entry.id === fieldId);
  if (!field) {
    return;
  }
  if (field.type === "password") {
    field.value = { kind: "password", password: text };
  } else if (field.type === "url") {
    field.value = { kind: "url", url: text };
  } else if (field.type === "note") {
    field.value = { kind: "note", note: text };
  } else if (field.type === "totp") {
    field.value = { kind: "totp", secretBase32: text };
  } else {
    field.value = { kind: "text", text };
  }
}

function ensureFolder(
  result: ImportResult,
  pathToIndex: Map<string, number>,
  path: string,
): void {
  if (pathToIndex.has(path)) {
    return;
  }
  pathToIndex.set(path, result.folders.length);
  const view = new FolderView();
  view.name = path;
  result.folders.push(view);
}
