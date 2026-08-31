import { ImportResult } from "../types/import-result.js";
import { BaseImporter } from "./base-importer.js";
import type { Importer } from "./importer.js";

/** My Kaspersky / KPM CSV: url,username,password,name,extra */
export class KasperskyCsvImporter extends BaseImporter implements Importer {
  parse(data: string): Promise<ImportResult> {
    const result = new ImportResult();
    const results = this.parseCsv(data, true);
    if (results == null) {
      result.success = false;
      return Promise.resolve(result);
    }

    results.forEach((value, index) => {
      const url = value.url ?? value.URL ?? "";
      if (this.isNullOrWhitespace(url)) {
        result.errors.push({ type: "row", message: "Missing URL", row: index + 2 });
        return;
      }
      const cipher = this.initLoginCipher();
      cipher.name = this.getValueOrDefault(value.name ?? value.Name, this.nameFromUrl(url) ?? "--") ?? "--";
      cipher.login!.username = this.getValueOrDefault(value.username ?? value.Username);
      cipher.login!.password = this.getValueOrDefault(value.password ?? value.Password);
      cipher.login!.uris = this.makeUriArray(url);
      cipher.notes = this.getValueOrDefault(value.extra ?? value.Extra);
      this.cleanupCipher(cipher);
      result.ciphers.push(cipher);
    });

    result.success = result.ciphers.length > 0;
    return Promise.resolve(result);
  }
}
