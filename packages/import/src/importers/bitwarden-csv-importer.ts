import { CipherRepromptType, CipherType, FieldType, SecureNoteType } from "../types/enums.js";
import { ImportResult } from "../types/import-result.js";
import { CipherView, FieldView, LoginView, SecureNoteView } from "../types/views/cipher.view.js";
import { BaseImporter } from "./base-importer.js";
import type { Importer } from "./importer.js";

export class BitwardenCsvImporter extends BaseImporter implements Importer {
  parse(data: string): Promise<ImportResult> {
    const result = new ImportResult();
    const results = this.parseCsv(data, true);
    if (results == null) {
      result.success = false;
      return Promise.resolve(result);
    }

    results.forEach((value) => {
      if (this.organization && !this.isNullOrWhitespace(value.collections)) {
        value.collections.split(",").forEach((col) => this.processFolder(result, col.trim()));
      } else if (!this.organization) {
        this.processFolder(result, value.folder);
      }

      const cipher = new CipherView();
      cipher.favorite = !this.organization && this.getValueOrDefault(value.favorite, "0") !== "0";
      cipher.type = CipherType.Login;
      cipher.notes = this.getValueOrDefault(value.notes);
      cipher.name = this.getValueOrDefault(value.name, "--") ?? "--";
      cipher.reprompt = CipherRepromptType.None;

      if (!this.isNullOrWhitespace(value.fields)) {
        const fields = this.splitNewLine(value.fields);
        for (const line of fields) {
          if (this.isNullOrWhitespace(line)) {
            continue;
          }
          const delimPosition = line.lastIndexOf(": ");
          if (delimPosition === -1) {
            continue;
          }
          const field = new FieldView();
          field.name = line.substring(0, delimPosition);
          field.value = line.length > delimPosition + 2 ? line.substring(delimPosition + 2) : "";
          field.type = FieldType.Text;
          cipher.fields.push(field);
        }
      }

      const valueType = value.type != null ? value.type.toLowerCase() : null;
      if (valueType === "note") {
        cipher.type = CipherType.SecureNote;
        cipher.secureNote = new SecureNoteView();
        cipher.secureNote.type = SecureNoteType.Generic;
      } else {
        cipher.type = CipherType.Login;
        cipher.login = new LoginView();
        cipher.login.totp = this.getValueOrDefault(value.login_totp || value.totp);
        cipher.login.username = this.getValueOrDefault(value.login_username || value.username);
        cipher.login.password = this.getValueOrDefault(value.login_password || value.password);
        const uris = this.parseSingleRowCsv(value.login_uri || value.uri || "");
        cipher.login.uris = this.makeUriArray(uris ?? undefined);
      }

      this.cleanupCipher(cipher);
      result.ciphers.push(cipher);
    });

    if (this.organization) {
      this.moveFoldersToCollections(result);
    }

    result.success = true;
    return Promise.resolve(result);
  }
}
