import { ImportResult } from "../types/import-result.js";
import { CipherView } from "../types/views/cipher.view.js";
import { BaseImporter } from "./base-importer.js";
import type { Importer } from "./importer.js";

export class RoboFormCsvImporter extends BaseImporter implements Importer {
  parse(data: string): Promise<ImportResult> {
    const result = new ImportResult();
    const results = this.parseCsv(data, true);
    if (results == null) {
      result.success = false;
      return Promise.resolve(result);
    }

    let i = 1;
    results.forEach((value) => {
      const folder =
        !this.isNullOrWhitespace(value.Folder) && value.Folder.startsWith("/")
          ? value.Folder.replace("/", "")
          : value.Folder;
      this.processFolder(result, folder ?? undefined);

      const cipher = this.initLoginCipher();
      cipher.notes = this.getValueOrDefault(value.Note);
      cipher.name = this.getValueOrDefault(value.Name, "--") ?? "--";
      cipher.login!.username = this.getValueOrDefault(value.Login);
      cipher.login!.password = this.getValueOrDefault(value.Pwd) ?? this.getValueOrDefault(value.Password);
      cipher.login!.uris = this.makeUriArray(value.Url) ?? this.makeUriArray(value.URL);

      if (!this.isNullOrWhitespace(value.Rf_fields)) {
        this.parseRfFields(cipher, value.Rf_fields);
      }

      this.convertToNoteIfNeeded(cipher);
      this.cleanupCipher(cipher);

      if (i === results.length && cipher.name === "--" && this.isNullOrWhitespace(cipher.login?.password ?? "")) {
        return;
      }

      result.ciphers.push(cipher);
      i += 1;
    });

    if (this.organization) {
      this.moveFoldersToCollections(result);
    }

    result.success = true;
    return Promise.resolve(result);
  }

  private parseRfFields(cipher: CipherView, raw: string): void {
    raw.split("\n").forEach((field) => {
      const parts = field.split(":");
      if (parts.length < 3) {
        return;
      }
      const key = parts[0] === "-no-name-" ? "" : parts[0];
      const val = parts.length === 4 && parts[2] === "rck" ? parts[1] : parts[2];
      this.processKvp(cipher, key, val);
    });
  }
}
