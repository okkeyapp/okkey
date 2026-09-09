import type { ExportSourceItem } from "./okkey-exporter.js";
import { collectLoginLike } from "./export-field-utils.js";
import { createZipFromFiles } from "../utils/zip.js";
import { generateEntityId } from "@okkey/id";

/** Build a minimal 1PUX archive (export.data + empty files/). */
export function buildOnePassword1PuxExport(items: ExportSourceItem[]): Uint8Array {
  const uuid = () => generateEntityId().replace(/[^a-zA-Z0-9]/g, "").slice(0, 26).toUpperCase() || "A".repeat(26);

  const vaultItems = items
    .filter((source) => !source.item.deleted)
    .map((source) => {
      const login = collectLoginLike(source.item);
      return {
        uuid: uuid(),
        favIndex: source.favorite ? 1 : 0,
        createdAt: Math.floor(source.item.createdAtMs / 1000),
        updatedAt: Math.floor(source.item.updatedAtMs / 1000),
        state: "active",
        categoryUuid: source.item.categoryId === "credit_card" ? "002" : source.item.categoryId === "secure_note" ? "003" : "001",
        overview: {
          title: source.item.title,
          url: login.url || undefined,
          tags: source.item.tags ?? [],
        },
        details: {
          loginFields: [
            { value: login.username, designation: "username", name: "username", type: "T" },
            { value: login.password, designation: "password", name: "password", type: "P" },
          ],
          notesPlain: login.notes || undefined,
          password: login.password || undefined,
        },
      };
    });

  const exportData = {
    accounts: [
      {
        attrs: { accountName: "Okkey", name: "Okkey" },
        vaults: [
          {
            attrs: { name: "Private", type: "P", uuid: uuid() },
            items: vaultItems,
          },
        ],
      },
    ],
  };

  return createZipFromFiles({
    "export.data": `${JSON.stringify(exportData)}\n`,
    "export.attributes": `${JSON.stringify({ documentId: uuid(), createdAt: Math.floor(Date.now() / 1000) })}\n`,
  });
}
