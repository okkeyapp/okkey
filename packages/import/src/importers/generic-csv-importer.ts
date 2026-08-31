import { ImportResult } from "../types/import-result.js";
import { BaseImporter } from "./base-importer.js";
import type { Importer } from "./importer.js";

/** Generic CSV with common column names (Chrome, Yandex, ESET, etc.). */
export class GenericCsvImporter extends BaseImporter implements Importer {
  parse(data: string): Promise<ImportResult> {
    const result = new ImportResult();
    const results = this.parseCsv(data, true);
    if (results == null) {
      result.success = false;
      return Promise.resolve(result);
    }

    results.forEach((value) => {
      const keys = Object.keys(value).reduce<Record<string, string>>((acc, key) => {
        acc[key.toLowerCase()] = key;
        return acc;
      }, {});

      const url =
        value[keys.url ?? ""] ??
        value[keys.uri ?? ""] ??
        value[keys.website ?? ""] ??
        value[keys.hostname ?? ""] ??
        "";
      const username =
        value[keys.username ?? ""] ?? value[keys.login ?? ""] ?? value[keys.user ?? ""] ?? "";
      const password = value[keys.password ?? ""] ?? value[keys.pass ?? ""] ?? "";
      const name =
        value[keys.name ?? ""] ?? value[keys.title ?? ""] ?? this.nameFromUrl(url) ?? "--";
      const note = value[keys.note ?? ""] ?? value[keys.notes ?? ""] ?? value[keys.comment ?? ""] ?? "";

      const cipher = this.initLoginCipher();
      cipher.name = name;
      cipher.login!.username = this.getValueOrDefault(username);
      cipher.login!.password = this.getValueOrDefault(password);
      cipher.login!.uris = this.makeUriArray(url);
      cipher.notes = this.getValueOrDefault(note);
      this.convertToNoteIfNeeded(cipher);
      this.cleanupCipher(cipher);
      result.ciphers.push(cipher);
    });

    result.success = result.ciphers.length > 0;
    return Promise.resolve(result);
  }
}
