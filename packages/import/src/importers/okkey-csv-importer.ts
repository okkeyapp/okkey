import { parseCsv } from "../utils/csv.js";
import {
  createEmptyOkkeyBundle,
  normalizeFolderPath,
  populateImportResultFromOkkeyBundle,
  type OkkeyJsonImporterOptions,
} from "./okkey-json-importer.js";
import type { OkkeyExportBundleV1, OkkeyExportItemV1 } from "../types/okkey-export.js";
import { ImportResult } from "../types/import-result.js";
import { normalizeItemPlaintextV2, ITEM_PLAINTEXT_SCHEMA_VERSION_V2 } from "@okkey/types";
import type { Importer } from "./importer.js";

const CSV_HEADERS = [
  "folder",
  "favorite",
  "categoryId",
  "title",
  "tags",
  "sections_json",
  "fields_json",
  "createdAtMs",
  "updatedAtMs",
  "archived",
  "item_json",
] as const;

export class OkkeyCsvImporter implements Importer {
  constructor(private readonly _options: OkkeyJsonImporterOptions = {}) {}

  async parse(data: string): Promise<ImportResult> {
    const rows = parseCsv(data, { header: true });
    if (!Array.isArray(rows) || rows.length === 0 || Array.isArray(rows[0])) {
      const result = new ImportResult();
      result.success = false;
      result.errorMessage = "Invalid Okkey CSV export";
      return result;
    }

    const bundle = createEmptyOkkeyBundle();
    const folderPaths = new Set<string>();

    for (const row of rows as Record<string, string>[]) {
      const entry = rowToExportItem(row);
      if (!entry) {
        continue;
      }
      if (entry.folderPath) {
        folderPaths.add(entry.folderPath);
      }
      bundle.items.push(entry);
    }

    bundle.folders = [...folderPaths].sort().map((path) => ({ path }));
    return populateImportResultFromOkkeyBundle(bundle);
  }
}

function rowToExportItem(row: Record<string, string>): OkkeyExportItemV1 | null {
  if (row.item_json?.trim()) {
    try {
      const parsed = JSON.parse(row.item_json) as unknown;
      const item = normalizeItemPlaintextV2(parsed);
      if (!item) {
        return null;
      }
      return {
        item,
        folderPath: normalizeFolderPath(row.folder ?? "") || null,
        favorite: parseBool(row.favorite),
      };
    } catch {
      return null;
    }
  }

  const title = (row.title ?? "").trim();
  const categoryId = (row.categoryId ?? "").trim();
  if (!title || !categoryId) {
    return null;
  }

  let sections = [];
  let fields = [];
  try {
    sections = row.sections_json ? (JSON.parse(row.sections_json) as unknown[]) : [];
    fields = row.fields_json ? (JSON.parse(row.fields_json) as unknown[]) : [];
  } catch {
    return null;
  }

  const createdAtMs = Number(row.createdAtMs) || Date.now();
  const updatedAtMs = Number(row.updatedAtMs) || createdAtMs;
  const tags = (row.tags ?? "")
    .split("|")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const rawItem = {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId: "import-temp",
    vaultId: "import-temp",
    title,
    categoryId,
    createdAtMs,
    updatedAtMs,
    archived: parseBool(row.archived) || undefined,
    sections,
    fields,
    ...(tags.length > 0 ? { tags } : {}),
  };
  const item = normalizeItemPlaintextV2(rawItem);
  if (!item) {
    return null;
  }
  return {
    item,
    folderPath: normalizeFolderPath(row.folder ?? "") || null,
    favorite: parseBool(row.favorite),
  };
}

function parseBool(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function serializeOkkeyCsv(bundle: OkkeyExportBundleV1): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const entry of bundle.items) {
    const tags = (entry.item.tags ?? []).join("|");
    const cells = [
      entry.folderPath ?? "",
      entry.favorite ? "true" : "false",
      entry.item.categoryId,
      entry.item.title,
      tags,
      JSON.stringify(entry.item.sections),
      JSON.stringify(entry.item.fields),
      String(entry.item.createdAtMs),
      String(entry.item.updatedAtMs),
      entry.item.archived ? "true" : "false",
      JSON.stringify(entry.item),
    ];
    lines.push(cells.map(escapeCsvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
