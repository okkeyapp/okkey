import { ImportResult } from "../types/import-result.js";
import { BaseImporter } from "./base-importer.js";
import type { Importer } from "./importer.js";

const NotesHeader = "Notes\n\n";
const ApplicationsHeader = "Applications\n\n";
const WebsitesHeader = "Websites\n\n";
const Delimiter = "\n---\n";

export class KasperskyTxtImporter extends BaseImporter implements Importer {
  parse(data: string): Promise<ImportResult> {
    const result = new ImportResult();

    let notesData: string | undefined;
    let applicationsData: string | undefined;
    let websitesData: string | undefined;
    let workingData = this.splitNewLine(data).join("\n");

    if (workingData.indexOf(NotesHeader) !== -1) {
      const parts = workingData.split(NotesHeader);
      if (parts.length > 1) {
        workingData = parts[0];
        notesData = parts[1];
      }
    }
    if (workingData.indexOf(ApplicationsHeader) !== -1) {
      const parts = workingData.split(ApplicationsHeader);
      if (parts.length > 1) {
        workingData = parts[0];
        applicationsData = parts[1];
      }
    }
    if (workingData.indexOf(WebsitesHeader) === 0) {
      const parts = workingData.split(WebsitesHeader);
      if (parts.length > 1) {
        workingData = parts[0];
        websitesData = parts[1];
      }
    }

    const notes = this.parseDataCategory(notesData);
    const applications = this.parseDataCategory(applicationsData);
    const websites = this.parseDataCategory(websitesData);

    notes.forEach((n) => {
      const cipher = this.initLoginCipher();
      cipher.name = this.getValueOrDefault(n.get("Name")) ?? "--";
      cipher.notes = this.getValueOrDefault(n.get("Text"));
      this.cleanupCipher(cipher);
      result.ciphers.push(cipher);
    });

    websites.concat(applications).forEach((w) => {
      const cipher = this.initLoginCipher();
      const nameKey = w.has("Website name") ? "Website name" : "Application";
      cipher.name = this.getValueOrDefault(w.get(nameKey), "") ?? "--";
      if (!this.isNullOrWhitespace(w.get("Login name"))) {
        if (!this.isNullOrWhitespace(cipher.name)) {
          cipher.name += ": ";
        }
        cipher.name += w.get("Login name") ?? "";
      }
      cipher.notes = this.getValueOrDefault(w.get("Comment"));
      if (w.has("Website URL")) {
        cipher.login!.uris = this.makeUriArray(w.get("Website URL") ?? "");
      }
      cipher.login!.username = this.getValueOrDefault(w.get("Login"));
      cipher.login!.password = this.getValueOrDefault(w.get("Password"));
      this.cleanupCipher(cipher);
      result.ciphers.push(cipher);
    });

    result.success = true;
    return Promise.resolve(result);
  }

  private parseDataCategory(data: string | undefined): Map<string, string>[] {
    if (this.isNullOrWhitespace(data) || data!.indexOf(Delimiter) === -1) {
      return [];
    }
    const items: Map<string, string>[] = [];
    data!.split(Delimiter).forEach((p) => {
      if (p.indexOf("\n") === -1) {
        return;
      }
      const item = new Map<string, string>();
      let itemComment: string | undefined;
      let itemCommentKey: string | undefined;
      p.split("\n").forEach((l) => {
        if (itemComment != null) {
          itemComment += "\n" + l;
          return;
        }
        const colonIndex = l.indexOf(":");
        if (colonIndex === -1) {
          return;
        }
        const key = l.substring(0, colonIndex);
        const val = l.length > colonIndex + 1 ? l.substring(colonIndex + 2) : "";
        if (key != null) {
          item.set(key, val);
        }
        if (key === "Comment" || key === "Text") {
          itemComment = val;
          itemCommentKey = key;
        }
      });
      if (itemComment != null && itemCommentKey != null) {
        item.set(itemCommentKey, itemComment);
      }
      if (item.size === 0) {
        return;
      }
      items.push(item);
    });
    return items;
  }
}
