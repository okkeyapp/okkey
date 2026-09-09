import { CipherType, FieldType, SecureNoteType } from "../types/enums.js";
import { ImportResult } from "../types/import-result.js";
import { CipherView, SecureNoteView } from "../types/views/cipher.view.js";
import { BaseImporter } from "./base-importer.js";
import type { Importer } from "./importer.js";

const Delimiter = "\n---\n";

const SECTION_HEADERS = [
  { id: "websites", title: "Websites" },
  { id: "applications", title: "Applications" },
  { id: "otherAccounts", title: "Other Accounts" },
  { id: "notes", title: "Notes" },
] as const;

type KasperskySectionId = (typeof SECTION_HEADERS)[number]["id"];

/**
 * Kaspersky Password Manager plaintext export:
 * Websites / Applications / Other Accounts / Notes, entries separated by `---`.
 */
export class KasperskyTxtImporter extends BaseImporter implements Importer {
  parse(data: string): Promise<ImportResult> {
    const result = new ImportResult();
    const workingData = this.splitNewLine(data.replace(/^\uFEFF/, "")).join("\n");
    const sections = this.splitSections(workingData);

    this.parseNotes(this.parseDataCategory(sections.notes)).forEach((cipher) => {
      result.ciphers.push(cipher);
    });

    this.parseOtherAccounts(this.parseDataCategory(sections.otherAccounts)).forEach((cipher) => {
      result.ciphers.push(cipher);
    });

    this.parseWebsiteOrAppLogins(this.parseDataCategory(sections.websites), "Website name").forEach(
      (cipher) => {
        result.ciphers.push(cipher);
      },
    );

    this.parseWebsiteOrAppLogins(this.parseDataCategory(sections.applications), "Application").forEach(
      (cipher) => {
        result.ciphers.push(cipher);
      },
    );

    result.success = true;
    return Promise.resolve(result);
  }

  private splitSections(data: string): Record<KasperskySectionId, string> {
    const empty: Record<KasperskySectionId, string> = {
      websites: "",
      applications: "",
      otherAccounts: "",
      notes: "",
    };

    const matches: Array<{ id: KasperskySectionId; index: number; headerLength: number }> = [];
    for (const header of SECTION_HEADERS) {
      const pattern = new RegExp(`(^|\\n)${escapeRegExp(header.title)}\\s*(?=\\n|$)`);
      const match = pattern.exec(data);
      if (!match) {
        continue;
      }
      const index = match.index + (match[1] ? match[1].length : 0);
      matches.push({ id: header.id, index, headerLength: header.title.length });
    }

    if (matches.length === 0) {
      // Legacy / partial exports that omit section headers.
      empty.websites = data;
      return empty;
    }

    matches.sort((a, b) => a.index - b.index);

    // Content before the first known header is treated as Websites (header may be missing after BOM strip).
    if (matches[0]!.index > 0 && matches[0]!.id !== "websites") {
      empty.websites = data.slice(0, matches[0]!.index).replace(/^\n+|\n+$/g, "");
    }

    for (let i = 0; i < matches.length; i += 1) {
      const current = matches[i]!;
      const contentStart = current.index + current.headerLength;
      const contentEnd = i + 1 < matches.length ? matches[i + 1]!.index : data.length;
      empty[current.id] = data.slice(contentStart, contentEnd).replace(/^\n+/, "");
    }
    return empty;
  }

  private parseNotes(items: Map<string, string>[]): CipherView[] {
    return items.map((item) => {
      const cipher = this.initSecureNoteCipher();
      cipher.name = this.getValueOrDefault(item.get("Name")) ?? "--";
      cipher.notes = this.getValueOrDefault(item.get("Text"));
      this.cleanupCipher(cipher);
      return cipher;
    });
  }

  private parseOtherAccounts(items: Map<string, string>[]): CipherView[] {
    return items.map((item) => {
      const cipher = this.initSecureNoteCipher();
      cipher.name = this.getValueOrDefault(item.get("Account name")) ?? "--";
      if (!this.isNullOrWhitespace(item.get("Login name"))) {
        if (!this.isNullOrWhitespace(cipher.name) && cipher.name !== "--") {
          cipher.name += ": ";
        } else {
          cipher.name = "";
        }
        cipher.name += item.get("Login name") ?? "";
      }
      cipher.notes = this.getValueOrDefault(item.get("Comment"));
      this.processKvp(cipher, "Login", item.get("Login") ?? "", FieldType.Text);
      this.processKvp(cipher, "Password", item.get("Password") ?? "", FieldType.Hidden);
      this.cleanupCipher(cipher);
      return cipher;
    });
  }

  private parseWebsiteOrAppLogins(items: Map<string, string>[], nameKey: string): CipherView[] {
    return items.map((item) => {
      const cipher = this.initLoginCipher();
      cipher.name = this.getValueOrDefault(item.get(nameKey), "") ?? "--";
      if (!this.isNullOrWhitespace(item.get("Login name"))) {
        if (!this.isNullOrWhitespace(cipher.name)) {
          cipher.name += ": ";
        }
        cipher.name += item.get("Login name") ?? "";
      }
      cipher.notes = this.getValueOrDefault(item.get("Comment"));
      if (item.has("Website URL")) {
        cipher.login!.uris = this.makeUriArray(item.get("Website URL") ?? "");
      }
      cipher.login!.username = this.getValueOrDefault(item.get("Login"));
      cipher.login!.password = this.getValueOrDefault(item.get("Password"));
      this.convertToNoteIfNeeded(cipher);
      this.cleanupCipher(cipher);
      return cipher;
    });
  }

  private initSecureNoteCipher(): CipherView {
    const cipher = new CipherView();
    cipher.favorite = false;
    cipher.notes = "";
    cipher.fields = [];
    cipher.login = null;
    cipher.type = CipherType.SecureNote;
    cipher.secureNote = new SecureNoteView();
    cipher.secureNote.type = SecureNoteType.Generic;
    return cipher;
  }

  private parseDataCategory(data: string | undefined): Map<string, string>[] {
    if (this.isNullOrWhitespace(data)) {
      return [];
    }

    const chunks = data!.includes(Delimiter) ? data!.split(Delimiter) : [data!];
    const items: Map<string, string>[] = [];

    for (const chunk of chunks) {
      if (chunk.indexOf("\n") === -1 && chunk.indexOf(":") === -1) {
        continue;
      }
      const item = new Map<string, string>();
      let itemComment: string | undefined;
      let itemCommentKey: string | undefined;
      chunk.split("\n").forEach((line) => {
        if (itemComment != null) {
          itemComment += "\n" + line;
          return;
        }
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) {
          return;
        }
        const key = line.substring(0, colonIndex);
        const val = line.length > colonIndex + 1 ? line.substring(colonIndex + 2) : "";
        item.set(key, val);
        if (key === "Comment" || key === "Text") {
          itemComment = val;
          itemCommentKey = key;
        }
      });
      if (itemComment != null && itemCommentKey != null) {
        item.set(itemCommentKey, itemComment);
      }
      if (item.size === 0) {
        continue;
      }
      items.push(item);
    }
    return items;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
