import { BaseImporter } from "./base-importer.js";
import type { Importer } from "./importer.js";
import { ImportResult } from "../types/import-result.js";

/** 1Password CSV (common export columns). */
export class OnePasswordCsvImporter extends BaseImporter implements Importer {
  parse(data: string): Promise<ImportResult> {
    const result = new ImportResult();
    const rows = this.parseCsv(data, true);
    if (rows == null) {
      result.success = false;
      result.errorMessage = "Invalid 1Password CSV export";
      return Promise.resolve(result);
    }

    for (const row of rows) {
      const cipher = this.initLoginCipher();
      cipher.name = this.getValueOrDefault(row.Title ?? row.title ?? row.Name, "--") ?? "--";
      cipher.login!.username = this.getValueOrDefault(row.Username ?? row.username);
      cipher.login!.password = this.getValueOrDefault(row.Password ?? row.password);
      cipher.login!.uris = this.makeUriArray(row.Url ?? row.URL ?? row.url ?? "");
      cipher.login!.totp = this.getValueOrDefault(row.OTPAuth ?? row.otpauth ?? row.Totp);
      cipher.notes = this.getValueOrDefault(row.Notes ?? row.notes ?? row.Note);
      cipher.favorite = ["true", "1", "yes"].includes(
        (row.Favorite ?? row.favorite ?? "").toLowerCase(),
      );
      const tags = (row.Tags ?? row.tags ?? "")
        .split(/[;,]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (tags.length > 0) {
        cipher.notes = [cipher.notes, `Tags: ${tags.join(", ")}`].filter(Boolean).join("\n");
      }
      this.cleanupCipher(cipher);
      result.ciphers.push(cipher);
    }

    result.success = true;
    return Promise.resolve(result);
  }
}
