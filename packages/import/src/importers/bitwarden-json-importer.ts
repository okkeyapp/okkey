import {
  CipherWithIdExport,
  CollectionWithIdExport,
  FolderWithIdExport,
  isOrgUnEncrypted,
  isUnencrypted,
  type BitwardenJsonExport,
} from "../types/bitwarden-export.js";
import { ImportResult } from "../types/import-result.js";
import {
  decryptBitwardenPasswordProtectedExport,
  ImportInvalidPasswordError,
  ImportPasswordRequiredError,
  isBitwardenAccountEncryptedExport,
  isBitwardenPasswordProtected,
} from "../utils/bitwarden-password-protected.js";
import { BaseImporter } from "./base-importer.js";
import type { Importer } from "./importer.js";

export type BitwardenJsonImporterOptions = {
  password?: string;
};

export class BitwardenJsonImporter extends BaseImporter implements Importer {
  constructor(private readonly options: BitwardenJsonImporterOptions = {}) {
    super();
  }

  async parse(data: string): Promise<ImportResult> {
    const results = JSON.parse(data) as BitwardenJsonExport | Record<string, unknown>;
    if (results == null) {
      const result = new ImportResult();
      result.success = false;
      result.errorMessage = "Invalid Bitwarden JSON export";
      return result;
    }

    if (isBitwardenPasswordProtected(results)) {
      if (!this.options.password?.trim()) {
        throw new ImportPasswordRequiredError();
      }
      const clearText = await decryptBitwardenPasswordProtectedExport(results, this.options.password);
      return this.parse(clearText);
    }

    if (isBitwardenAccountEncryptedExport(results)) {
      const result = new ImportResult();
      result.success = false;
      result.errorMessage =
        "Account-encrypted Bitwarden exports are not supported. Export vault with a password.";
      return result;
    }

    if (!("items" in results) || !Array.isArray((results as { items?: unknown }).items)) {
      const result = new ImportResult();
      result.success = false;
      result.errorMessage = "Invalid Bitwarden JSON export";
      return result;
    }

    if (!isUnencrypted(results as BitwardenJsonExport)) {
      throw new ImportPasswordRequiredError();
    }

    const unencrypted = results as Extract<BitwardenJsonExport, { items: unknown[] }>;
    const importResult = new ImportResult();
    const groupingsMap = isOrgUnEncrypted(unencrypted)
      ? await this.parseCollections(unencrypted, importResult)
      : await this.parseFolders(unencrypted, importResult);

    unencrypted.items.forEach((c) => {
      const cipher = CipherWithIdExport.toView(c);
      cipher.id = "";
      cipher.organizationId = null;
      cipher.collectionIds = [];

      if (!this.organization && c.folderId != null && groupingsMap.has(c.folderId)) {
        importResult.folderRelationships.push([importResult.ciphers.length, groupingsMap.get(c.folderId)!]);
      }

      this.cleanupCipher(cipher);
      importResult.ciphers.push(cipher);
    });

    importResult.success = true;
    return importResult;
  }

  private async parseFolders(data: { folders?: Array<{ id: string; name: string }> }, importResult: ImportResult) {
    const groupingsMap = new Map<string, number>();
    if (data.folders == null) {
      return groupingsMap;
    }
    for (const f of data.folders) {
      const folderView = FolderWithIdExport.toView(f);
      folderView.name = folderView.name.replace(/\\/g, "/").replace(/^\/+/g, "").replace(/\/+$/g, "").trim();
      groupingsMap.set(f.id, importResult.folders.length);
      importResult.folders.push(folderView);
    }
    this.ensureFolderParentPaths(importResult);
    return groupingsMap;
  }

  /** Bitwarden nested folders use path names (`Parent/Child`); ensure parents exist as FolderViews. */
  private ensureFolderParentPaths(importResult: ImportResult) {
    const existing = new Set(importResult.folders.map((folder) => folder.name));
    for (const folder of [...importResult.folders]) {
      const parts = folder.name.split("/").filter(Boolean);
      for (let i = parts.length - 1; i > 0; i -= 1) {
        const parentName = parts.slice(0, i).join("/");
        if (!existing.has(parentName)) {
          const parent = FolderWithIdExport.toView({ id: "", name: parentName });
          importResult.folders.push(parent);
          existing.add(parentName);
        }
      }
    }
  }

  private async parseCollections(
    data: { collections?: Array<{ id: string; name: string }> },
    importResult: ImportResult,
  ) {
    const groupingsMap = new Map<string, number>();
    if (data.collections == null) {
      return groupingsMap;
    }
    for (const c of data.collections) {
      const collectionView = CollectionWithIdExport.toView(c);
      groupingsMap.set(c.id, importResult.collections.length);
      importResult.collections.push(collectionView);
    }
    return groupingsMap;
  }
}

export { ImportInvalidPasswordError, ImportPasswordRequiredError };
