import { CipherType, FieldType, SecureNoteType } from "../types/enums.js";
import { ImportResult } from "../types/import-result.js";
import { CardView, CipherView, LoginView } from "../types/views/cipher.view.js";
import { BaseImporter } from "./base-importer.js";
import type { Importer } from "./importer.js";

type NordPassCsvParsed = Record<string, string> & {
  type?: string;
};

export class NordPassCsvImporter extends BaseImporter implements Importer {
  parse(data: string): Promise<ImportResult> {
    const result = new ImportResult();
    const results = this.parseCsv(data, true) as NordPassCsvParsed[] | null;
    if (results == null) {
      result.success = false;
      return Promise.resolve(result);
    }

    results.forEach((record) => {
      const recordType = this.evaluateType(record);
      if (recordType === undefined) {
        return;
      }

      this.processFolder(result, record.folder);
      const cipher = new CipherView();
      cipher.name = this.getValueOrDefault(record.name, "--") ?? "--";
      cipher.notes = this.getValueOrDefault(record.note);

      if (record.custom_fields) {
        try {
          const customFieldsParsed = JSON.parse(record.custom_fields) as Array<{ label: string; type: string; value: string }>;
          customFieldsParsed.forEach((field) => {
            const fieldType = field.type === "hidden" ? FieldType.Hidden : FieldType.Text;
            this.processKvp(cipher, field.label, field.value, fieldType);
          });
        } catch {
          /* ignore malformed custom fields */
        }
      }

      switch (recordType) {
        case CipherType.Login:
          cipher.type = CipherType.Login;
          cipher.login = new LoginView();
          cipher.login.username = this.getValueOrDefault(record.username);
          cipher.login.password = this.getValueOrDefault(record.password);
          if (record.additional_urls) {
            try {
              const additionalUrls = JSON.parse(record.additional_urls) as string[];
              cipher.login.uris = this.makeUriArray([record.url, ...additionalUrls]);
            } catch {
              cipher.login.uris = this.makeUriArray(record.url);
            }
          } else {
            cipher.login.uris = this.makeUriArray(record.url);
          }
          break;
        case CipherType.Card:
          cipher.type = CipherType.Card;
          cipher.card.cardholderName = this.getValueOrDefault(record.cardholdername);
          cipher.card.number = this.getValueOrDefault(record.cardnumber);
          cipher.card.code = this.getValueOrDefault(record.cvc);
          cipher.card.brand = CardView.getCardBrandByPatterns(cipher.card.number);
          this.setCardExpiration(cipher, record.expirydate ?? "");
          break;
        case CipherType.Identity:
          cipher.type = CipherType.Identity;
          this.processFullName(cipher, this.getValueOrDefault(record.full_name) ?? "");
          cipher.identity.address1 = this.getValueOrDefault(record.address1);
          cipher.identity.address2 = this.getValueOrDefault(record.address2);
          cipher.identity.city = this.getValueOrDefault(record.city);
          cipher.identity.state = this.getValueOrDefault(record.state);
          cipher.identity.postalCode = this.getValueOrDefault(record.zipcode);
          cipher.identity.country = this.getValueOrDefault(record.country)?.toUpperCase() ?? null;
          cipher.identity.email = this.getValueOrDefault(record.email);
          cipher.identity.phone = this.getValueOrDefault(record.phone_number);
          break;
        case CipherType.SecureNote:
          cipher.type = CipherType.SecureNote;
          cipher.secureNote.type = SecureNoteType.Generic;
          break;
        default:
          break;
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

  private evaluateType(record: NordPassCsvParsed): CipherType | undefined {
    switch (record.type) {
      case "password":
        return CipherType.Login;
      case "credit_card":
        return CipherType.Card;
      case "note":
        return CipherType.SecureNote;
      case "identity":
        return CipherType.Identity;
      default:
        return undefined;
    }
  }
}
