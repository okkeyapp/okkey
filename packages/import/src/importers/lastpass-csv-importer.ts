import { CipherType, SecureNoteType } from "../types/enums.js";
import { ImportResult } from "../types/import-result.js";
import { CardView, CipherView, LoginView, SecureNoteView } from "../types/views/cipher.view.js";
import { FolderView } from "../types/views/folder.view.js";
import { BaseImporter } from "./base-importer.js";
import type { Importer } from "./importer.js";

export class LastPassCsvImporter extends BaseImporter implements Importer {
  parse(data: string): Promise<ImportResult> {
    const result = new ImportResult();
    const results = this.parseCsv(data, true);
    if (results == null) {
      result.success = false;
      return Promise.resolve(result);
    }

    results.forEach((value) => {
      const cipherIndex = result.ciphers.length;
      let folderIndex = result.folders.length;
      let grouping = value.grouping?.replace(/\\/g, "/").replace(/[\x00-\x1F\x7F-\x9F]/g, "");
      const hasFolder = this.getValueOrDefault(grouping, "(none)") !== "(none)";
      let addFolder = hasFolder;

      if (hasFolder && grouping) {
        for (let i = 0; i < result.folders.length; i++) {
          if (result.folders[i].name === grouping) {
            addFolder = false;
            folderIndex = i;
            break;
          }
        }
      }

      const cipher = this.buildBaseCipher(value);
      if (cipher.type === CipherType.Login) {
        cipher.notes = this.getValueOrDefault(value.extra);
        cipher.login = new LoginView();
        cipher.login.uris = this.makeUriArray(value.url);
        cipher.login.username = this.getValueOrDefault(value.username);
        cipher.login.password = this.getValueOrDefault(value.password);
        cipher.login.totp = this.getValueOrDefault(value.totp);
      } else if (cipher.type === CipherType.SecureNote) {
        cipher.secureNote = new SecureNoteView();
        cipher.secureNote.type = SecureNoteType.Generic;
        cipher.notes = this.getValueOrDefault(value.extra);
      } else if (cipher.type === CipherType.Card) {
        cipher.card = this.parseCard(value);
        cipher.notes = this.getValueOrDefault(value.notes);
      }

      result.ciphers.push(cipher);

      if (addFolder && grouping) {
        const f = new FolderView();
        f.name = grouping;
        result.folders.push(f);
      }
      if (hasFolder) {
        result.folderRelationships.push([cipherIndex, folderIndex]);
      }
    });

    if (this.organization) {
      this.moveFoldersToCollections(result);
    }

    result.success = true;
    return Promise.resolve(result);
  }

  private buildBaseCipher(value: Record<string, string>): CipherView {
    const cipher = new CipherView();
    if ("profilename" in value && "profilelanguage" in value) {
      cipher.name = this.getValueOrDefault(value.profilename, "--") ?? "--";
      cipher.type = CipherType.Card;
    } else {
      cipher.favorite = !this.organization && this.getValueOrDefault(value.fav, "0") === "1";
      cipher.name = this.getValueOrDefault(value.name, "--") ?? "--";
      cipher.type = value.url === "http://sn" ? CipherType.SecureNote : CipherType.Login;
    }
    return cipher;
  }

  private parseCard(value: Record<string, string>): CardView {
    const card = new CardView();
    card.cardholderName = this.getValueOrDefault(value.ccname);
    card.number = this.getValueOrDefault(value.ccnum);
    card.code = this.getValueOrDefault(value.cccsc);
    card.brand = CardView.getCardBrandByPatterns(card.number);
    if (!this.isNullOrWhitespace(value.ccexp) && value.ccexp.indexOf("-") > -1) {
      const [year, month] = value.ccexp.split("-");
      card.expYear = year;
      card.expMonth = month?.length === 2 && month[0] === "0" ? month[1] : month;
    }
    return card;
  }
}
