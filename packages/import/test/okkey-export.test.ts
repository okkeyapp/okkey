import { describe, expect, it } from "vitest";

import { populateImportResultFromOkkeyBundle } from "../src/importers/okkey-json-importer.js";
import { serializeOkkeyCsv } from "../src/importers/okkey-csv-importer.js";
import { OkkeyCsvImporter } from "../src/importers/okkey-csv-importer.js";
import {
  buildOkkeyJsonExport,
  buildOkkeyZipExport,
} from "../src/exporters/okkey-exporter.js";
import { runExport } from "../src/exporters/registry.js";
import { mapImportResultToOkkeyItems } from "../src/mappers/to-okkey-item.js";
import { createImporter, runImport } from "../src/registry.js";
import {
  encryptOkkeyPasswordProtectedExport,
  looksLikeOkkeyPasswordProtectedJson,
} from "../src/utils/okkey-password-protected.js";
import { unzipToMap, createZipFromFiles } from "../src/utils/zip.js";
import { parseZipImport } from "../src/parse-import-input.js";
import { ITEM_PLAINTEXT_SCHEMA_VERSION_V2 } from "@okkey/types";
import type { OkkeyExportBundleV1 } from "../src/types/okkey-export.js";

function sampleItem() {
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId: "item-1",
    vaultId: "vault-1",
    title: "Demo Login",
    categoryId: "login",
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_100,
    sections: [
      { id: "credentials", title: "General", order: 0, isPreset: true },
      { id: "websites", title: "Websites", order: 1, isPreset: true },
    ],
    fields: [
      { id: "login", type: "text" as const, sectionId: "credentials", order: 0, label: "Login", value: { kind: "text" as const, text: "user@okkey.app" } },
      { id: "password", type: "password" as const, sectionId: "credentials", order: 1, label: "Password", value: { kind: "password" as const, password: "s3cret" } },
      { id: "website-1", type: "url" as const, sectionId: "websites", order: 0, label: "Website", value: { kind: "url" as const, url: "https://okkey.app" } },
    ],
    tags: ["work", "demo"],
  };
}

describe("okkey export/import round-trip", () => {
  it("round-trips JSON with tags, folder, favorite", async () => {
    const bytes = await buildOkkeyJsonExport({
      items: [
        {
          item: sampleItem(),
          folderPath: "Work/Clients",
          favorite: true,
        },
      ],
      includeFolders: true,
    });
    const text = new TextDecoder().decode(bytes);
    const result = await runImport("okkeyjson", text);
    expect(result.success).toBe(true);
    expect(result.nativeEntries).toHaveLength(1);
    expect(result.folders.some((folder) => folder.name === "Work/Clients")).toBe(true);

    const drafts = mapImportResultToOkkeyItems({ result, vaultId: "vault-new" });
    expect(drafts[0]?.item.title).toBe("Demo Login");
    expect(drafts[0]?.item.tags).toEqual(["work", "demo"]);
    expect(drafts[0]?.item.categoryId).toBe("login");
    expect(drafts[0]?.favorite).toBe(true);
    expect(drafts[0]?.item.vaultId).toBe("vault-new");
    expect(drafts[0]?.item.itemId).not.toBe("item-1");
  });

  it("encrypts and decrypts Okkey password-protected JSON", async () => {
    const clear = await buildOkkeyJsonExport({
      items: [{ item: sampleItem(), folderPath: null, favorite: false }],
    });
    const protectedBytes = await buildOkkeyJsonExport({
      items: [{ item: sampleItem(), folderPath: null, favorite: false }],
      password: "export-pass",
    });
    const protectedText = new TextDecoder().decode(protectedBytes);
    expect(looksLikeOkkeyPasswordProtectedJson(protectedText)).toBe(true);

    const importer = createImporter("okkeyjson", { password: "export-pass" });
    const result = await importer.parse(protectedText);
    expect(result.success).toBe(true);
    expect(result.nativeEntries[0]?.item.title).toBe("Demo Login");

    // wrong password path covered by envelope helper
    const envelope = await encryptOkkeyPasswordProtectedExport(
      new TextDecoder().decode(clear),
      "other",
    );
    expect(envelope.format).toBe("okkey");
  });

  it("round-trips CSV via sections/fields JSON columns", async () => {
    const bundle: OkkeyExportBundleV1 = {
      format: "okkey",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      folders: [{ path: "Inbox" }],
      items: [
        {
          item: sampleItem(),
          folderPath: "Inbox",
          favorite: true,
        },
      ],
    };
    const csv = serializeOkkeyCsv(bundle);
    const result = await new OkkeyCsvImporter().parse(csv);
    expect(result.success).toBe(true);
    expect(result.nativeEntries[0]?.item.tags).toEqual(["work", "demo"]);
  });

  it("writes ZIP with attachments and re-reads export.json", async () => {
    const attachment = new TextEncoder().encode("file-bytes");
    const bytes = await buildOkkeyZipExport({
      items: [
        {
          item: {
            ...sampleItem(),
            fields: [
              ...sampleItem().fields,
              {
                id: "file-1",
                type: "file",
                sectionId: "credentials",
                order: 3,
                label: "Doc",
                value: { kind: "file", name: "note.txt", attachmentId: "att-1", sizeBytes: 10 },
              },
            ],
          },
          folderPath: null,
          favorite: false,
          attachmentBytesByFieldId: new Map([
            ["file-1", { fileName: "note.txt", bytes: attachment }],
          ]),
        },
      ],
    });
    const files = await unzipToMap(bytes);
    expect(files.has("export.json")).toBe(true);
    expect(
      [...files.keys()].some((name) => name.includes("attachments/") && name.endsWith("note.txt")),
    ).toBe(true);

    const parsed = await createImporter("okkeyzip").parse(
      new TextDecoder().decode(files.get("export.json")!),
    );
    expect(parsed.nativeEntries[0]?.attachmentRefs[0]?.fileName).toBe("note.txt");
  });

  it("round-trips custom favicon via JSON base64", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
    const bytes = await buildOkkeyJsonExport({
      items: [
        {
          item: {
            ...sampleItem(),
            faviconId: "old-favicon-id",
            faviconSource: "manual",
          },
          folderPath: null,
          favorite: false,
          faviconBytes: { fileName: "favicon.png", bytes: png, source: "manual" },
        },
      ],
    });
    const text = new TextDecoder().decode(bytes);
    const bundle = JSON.parse(text) as OkkeyExportBundleV1;
    expect(bundle.items[0]?.item.faviconId).toBeUndefined();
    expect(bundle.items[0]?.favicon?.source).toBe("manual");
    expect(bundle.items[0]?.favicon?.dataBase64).toBeTruthy();

    const result = await runImport("okkeyjson", text);
    expect(result.nativeEntries[0]?.favicon?.dataBase64).toBeTruthy();

    const drafts = mapImportResultToOkkeyItems({ result, vaultId: "vault-new" });
    expect(drafts[0]?.faviconPng).toEqual(png);
    expect(drafts[0]?.item.faviconSource).toBe("manual");
    expect(drafts[0]?.item.faviconId).toBeUndefined();
  });

  it("round-trips custom favicon via ZIP file", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 9, 8, 7, 6]);
    const bytes = await buildOkkeyZipExport({
      items: [
        {
          item: {
            ...sampleItem(),
            faviconId: "old-favicon-id",
            faviconSource: "manual",
          },
          folderPath: null,
          favorite: false,
          faviconBytes: { fileName: "favicon.png", bytes: png, source: "manual" },
        },
      ],
    });
    const files = await unzipToMap(bytes);
    const faviconPath = [...files.keys()].find((name) => name.includes("favicons/"));
    expect(faviconPath).toBeTruthy();
    expect(files.get(faviconPath!)).toEqual(png);

    const parsedBundle = await parseZipImport(bytes, "okkeyzip");
    expect(parsedBundle.attachmentFiles.has(faviconPath!)).toBe(true);

    const parsed = await createImporter("okkeyzip").parse(parsedBundle.text);
    const drafts = mapImportResultToOkkeyItems({
      result: parsed,
      vaultId: "vault-new",
      attachmentFiles: parsedBundle.attachmentFiles,
    });
    expect(drafts[0]?.faviconPng).toEqual(png);
    expect(drafts[0]?.item.faviconSource).toBe("manual");
  });

  it("clamps updatedAtMs to createdAtMs when earlier or missing", async () => {
    const createdAtMs = 1_700_000_000_000;
    const bytes = await buildOkkeyJsonExport({
      items: [
        {
          item: {
            ...sampleItem(),
            createdAtMs,
            updatedAtMs: createdAtMs - 60_000,
          },
          folderPath: null,
          favorite: false,
        },
      ],
    });
    const text = new TextDecoder().decode(bytes);
    const result = await runImport("okkeyjson", text);
    expect(result.nativeEntries[0]?.item.createdAtMs).toBe(createdAtMs);
    expect(result.nativeEntries[0]?.item.updatedAtMs).toBe(createdAtMs);

    const drafts = mapImportResultToOkkeyItems({ result, vaultId: "vault-new" });
    expect(drafts[0]?.item.updatedAtMs).toBe(drafts[0]?.item.createdAtMs);
  });

  it("exports chrome csv via runExport", async () => {
    const result = await runExport({
      formatId: "chromecsv",
      items: [{ item: sampleItem(), folderPath: null, favorite: false }],
    });
    expect(result.fileName.endsWith(".csv")).toBe(true);
    const text = new TextDecoder().decode(result.bytes);
    expect(text).toContain("user@okkey.app");
    expect(text).toContain("https://okkey.app");
  });

  it("createZipFromFiles round-trips", async () => {
    const zip = createZipFromFiles({ "a.txt": "hello" });
    const map = await unzipToMap(zip);
    expect(new TextDecoder().decode(map.get("a.txt")!)).toBe("hello");
  });

  it("parses 1Password CSV", async () => {
    const csv = `Title,Url,Username,Password,Notes,Favorite,Tags
Demo,https://example.com,alice,secret,hi,TRUE,work;home
`;
    const result = await runImport("onepasswordcsv", csv);
    expect(result.success).toBe(true);
    expect(result.ciphers[0]?.name).toBe("Demo");
    expect(result.ciphers[0]?.login?.username).toBe("alice");
  });
});
