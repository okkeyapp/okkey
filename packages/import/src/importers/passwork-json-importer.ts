import { CipherType, SecureNoteType } from "../types/enums.js";
import { ImportResult } from "../types/import-result.js";
import { CipherView, LoginView } from "../types/views/cipher.view.js";
import { BaseImporter } from "./base-importer.js";
import type { Importer } from "./importer.js";

type PassworkPassword = {
  name?: string;
  login?: string;
  password?: string;
  url?: string;
  description?: string;
  tags?: string[];
};

type PassworkExport = {
  passwords?: PassworkPassword[];
  vaults?: Array<{
    name?: string;
    folders?: Array<{ name?: string; passwords?: PassworkPassword[] }>;
    passwords?: PassworkPassword[];
  }>;
};

export class PassworkJsonImporter extends BaseImporter implements Importer {
  parse(data: string): Promise<ImportResult> {
    const result = new ImportResult();
    let parsed: PassworkExport;
    try {
      parsed = JSON.parse(data) as PassworkExport;
    } catch {
      result.success = false;
      result.errorMessage = "Invalid Passwork JSON";
      return Promise.resolve(result);
    }

    const addPassword = (entry: PassworkPassword) => {
      const cipher = new CipherView();
      cipher.type = CipherType.Login;
      cipher.login = new LoginView();
      cipher.name = this.getValueOrDefault(entry.name, "--") ?? "--";
      cipher.login.username = this.getValueOrDefault(entry.login);
      cipher.login.password = this.getValueOrDefault(entry.password);
      cipher.login.uris = this.makeUriArray(entry.url ?? "");
      cipher.notes = this.getValueOrDefault(entry.description);
      if (entry.tags?.length) {
        cipher.notes = [cipher.notes, `Tags: ${entry.tags.join(", ")}`].filter(Boolean).join("\n");
      }
      if (
        this.isNullOrWhitespace(cipher.login.username) &&
        this.isNullOrWhitespace(cipher.login.password) &&
        !this.isNullOrWhitespace(cipher.notes)
      ) {
        cipher.type = CipherType.SecureNote;
        cipher.secureNote.type = SecureNoteType.Generic;
      }
      this.cleanupCipher(cipher);
      result.ciphers.push(cipher);
    };

    parsed.passwords?.forEach(addPassword);
    parsed.vaults?.forEach((vault) => {
      vault.passwords?.forEach(addPassword);
      vault.folders?.forEach((folder) => {
        folder.passwords?.forEach(addPassword);
      });
    });

    result.success = result.ciphers.length > 0;
    return Promise.resolve(result);
  }
}
