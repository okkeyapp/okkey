import { FieldType } from "../types/enums.js";
import { ImportResult } from "../types/import-result.js";
import { FieldView } from "../types/views/cipher.view.js";
import { FolderView } from "../types/views/folder.view.js";
import { BaseImporter } from "./base-importer.js";
import type { Importer } from "./importer.js";

export class KeePass2XmlImporter extends BaseImporter implements Importer {
  result = new ImportResult();

  parse(data: string): Promise<ImportResult> {
    const doc = this.parseXml(data);
    if (doc == null) {
      this.result.success = false;
      return Promise.resolve(this.result);
    }

    const rootGroup = doc.querySelector("KeePassFile > Root > Group");
    if (rootGroup == null) {
      this.result.errorMessage = "Missing KeePass XML structure";
      this.result.success = false;
      return Promise.resolve(this.result);
    }

    this.traverse(rootGroup, true, "");
    if (this.organization) {
      this.moveFoldersToCollections(this.result);
    }
    this.result.success = true;
    return Promise.resolve(this.result);
  }

  traverse(node: Element, isRootNode: boolean, groupPrefixName: string) {
    const folderIndex = this.result.folders.length;
    let groupName = groupPrefixName;

    if (!isRootNode) {
      if (groupName !== "") {
        groupName += "/";
      }
      const nameEl = this.querySelectorDirectChild(node, "Name");
      groupName += nameEl == null ? "-" : (nameEl.textContent ?? "-");
      const folder = new FolderView();
      folder.name = groupName;
      this.result.folders.push(folder);
    }

    this.querySelectorAllDirectChild(node, "Entry").forEach((entry) => {
      const cipherIndex = this.result.ciphers.length;
      const cipher = this.initLoginCipher();

      this.querySelectorAllDirectChild(entry, "String").forEach((entryString) => {
        const valueEl = this.querySelectorDirectChild(entryString, "Value");
        const value = valueEl?.textContent;
        if (this.isNullOrWhitespace(value)) {
          return;
        }
        const keyEl = this.querySelectorDirectChild(entryString, "Key");
        const key = keyEl?.textContent ?? "";

        if (key === "URL") {
          cipher.login!.uris = this.makeUriArray(value!);
        } else if (key === "UserName") {
          cipher.login!.username = value;
        } else if (key === "Password") {
          cipher.login!.password = value;
        } else if (key === "otp") {
          cipher.login!.totp = value!.replace("key=", "");
        } else if (key === "Title") {
          cipher.name = value!;
        } else if (key === "Notes") {
          cipher.notes = `${cipher.notes ?? ""}${value}\n`;
        } else {
          const isProtected = valueEl?.getAttribute("ProtectInMemory") === "True";
          if (isProtected) {
            const field = new FieldView();
            field.type = FieldType.Hidden;
            field.name = key;
            field.value = value!;
            cipher.fields.push(field);
          } else {
            this.processKvp(cipher, key, value!, FieldType.Text);
          }
        }
      });

      this.cleanupCipher(cipher);
      this.result.ciphers.push(cipher);
      if (!isRootNode) {
        this.result.folderRelationships.push([cipherIndex, folderIndex]);
      }
    });

    this.querySelectorAllDirectChild(node, "Group").forEach((group) => {
      this.traverse(group, false, groupName);
    });
  }
}
