import { parseCsv as parseCsvRows } from "../utils/csv.js";

import { ImportResult } from "../types/import-result.js";
import { CipherType, FieldType, SecureNoteType } from "../types/enums.js";
import {
  CipherView,
  CollectionView,
  FieldView,
  FolderView,
  LoginUriView,
  LoginView,
  SecureNoteView,
} from "../types/views/index.js";
import { normalizeExpiryYearFormat, Utils } from "../utils/utils.js";

export abstract class BaseImporter {
  organizationId: string | null = null;

  protected newLineRegex = /(?:\r\n|\r|\n)/;

  protected passwordFieldNames = [
    "password",
    "pass word",
    "passphrase",
    "pass phrase",
    "pass",
    "code",
    "code word",
    "codeword",
    "secret",
    "secret word",
    "personpwd",
    "key",
    "keyword",
    "key word",
    "keyphrase",
    "key phrase",
    "form_pw",
    "wppassword",
    "pin",
    "pwd",
    "pw",
    "pword",
    "passwd",
    "p",
    "serial",
    "serial#",
    "license key",
    "reg #",
    "passwort",
  ];

  protected usernameFieldNames = [
    "user",
    "name",
    "user name",
    "username",
    "login name",
    "email",
    "e-mail",
    "id",
    "userid",
    "user id",
    "login",
    "form_loginname",
    "wpname",
    "mail",
    "loginid",
    "login id",
    "log",
    "personlogin",
    "first name",
    "last name",
    "card#",
    "account #",
    "member",
    "member #",
    "nom",
    "benutzername",
  ];

  protected notesFieldNames = [
    "note",
    "notes",
    "comment",
    "comments",
    "memo",
    "description",
    "free form",
    "freeform",
    "free text",
    "freetext",
    "free",
    "kommentar",
  ];

  protected uriFieldNames: string[] = [
    "url",
    "hyper link",
    "hyperlink",
    "link",
    "host",
    "hostname",
    "host name",
    "server",
    "address",
    "hyper ref",
    "href",
    "web",
    "website",
    "web site",
    "site",
    "web-site",
    "uri",
    "ort",
    "adresse",
  ];

  protected parseCsvOptions = {
    encoding: "UTF-8",
    skipEmptyLines: false,
  };

  protected get organization() {
    return this.organizationId != null;
  }

  protected parseXml(data: string): Document | null {
    if (!this.validateNoExternalEntities(data)) {
      return null;
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(data, "application/xml");
    return doc != null && doc.querySelector("parsererror") == null ? doc : null;
  }

  protected parseCsv(data: string, header: boolean, _options: Record<string, unknown> = {}): Record<string, string>[] | null {
    data = this.splitNewLine(data).join("\n").trim();
    const parsed = parseCsvRows(data, { header, skipEmptyLines: false });
    if (!parsed || parsed.length === 0) {
      return null;
    }
    return parsed as Record<string, string>[];
  }

  protected parseSingleRowCsv(rowData: string): string[] | null {
    if (this.isNullOrWhitespace(rowData)) {
      return null;
    }
    const parsedRow = this.parseCsv(rowData, false) as unknown as string[][] | null;
    if (parsedRow != null && parsedRow.length > 0 && parsedRow[0].length > 0) {
      return parsedRow[0];
    }
    return null;
  }

  protected makeUriArray(uri: string | string[] | null | undefined): LoginUriView[] | null {
    if (uri == null) {
      return null;
    }

    if (typeof uri === "string") {
      const loginUri = new LoginUriView();
      loginUri.uri = this.fixUri(uri);
      if (this.isNullOrWhitespace(loginUri.uri)) {
        return null;
      }
      return [loginUri];
    }

    if (uri.length > 0) {
      const returnArr: LoginUriView[] = [];
      uri.forEach((u) => {
        const loginUri = new LoginUriView();
        loginUri.uri = this.fixUri(u);
        if (this.isNullOrWhitespace(loginUri.uri)) {
          return;
        }
        returnArr.push(loginUri);
      });
      return returnArr.length === 0 ? null : returnArr;
    }

    return null;
  }

  protected fixUri(uri: string | null | undefined): string | null {
    if (uri == null) {
      return null;
    }
    let fixed = uri.trim();
    if (fixed.indexOf("://") === -1 && fixed.indexOf(".") >= 0) {
      fixed = "http://" + fixed;
    }
    if (fixed.length > 1000) {
      return fixed.substring(0, 1000);
    }
    return fixed;
  }

  protected nameFromUrl(url: string): string | null {
    const hostname = Utils.getHostname(url);
    if (!hostname || this.isNullOrWhitespace(hostname)) {
      return null;
    }
    return hostname.startsWith("www.") ? hostname.replace("www.", "") : hostname;
  }

  protected isNullOrWhitespace(str: string | undefined | null): boolean {
    return Utils.isNullOrWhitespace(str);
  }

  protected getValueOrDefault(str: string | null | undefined, defaultValue: string | null = null): string | null {
    if (this.isNullOrWhitespace(str)) {
      return defaultValue;
    }
    return str ?? defaultValue;
  }

  protected splitNewLine(str: string): string[] {
    return str.split(this.newLineRegex);
  }

  protected setCardExpiration(cipher: CipherView, expiration: string): boolean {
    if (this.isNullOrWhitespace(expiration)) {
      return false;
    }

    const normalized = expiration.replace(/\s/g, "");
    const monthRegex = "0?(?<month>[1-9]|1[0-2])";
    const yearRegex = "(?<year>(?:[1-2][0-9])?[0-9]{2})";
    const expiryRegex = new RegExp(`^${monthRegex}/${yearRegex}$`);
    const expiryMatch = normalized.match(expiryRegex);
    if (!expiryMatch?.groups) {
      return false;
    }

    cipher.card.expMonth = expiryMatch.groups.month;
    cipher.card.expYear = normalizeExpiryYearFormat(expiryMatch.groups.year);
    return true;
  }

  protected moveFoldersToCollections(result: ImportResult) {
    result.folderRelationships.forEach((r) => result.collectionRelationships.push(r));
    result.collections = result.folders.map((f) => {
      return new CollectionView({
        name: f.name,
        organizationId: this.organizationId,
        id: f.id && f.id !== "" ? f.id : null,
      });
    });
    result.folderRelationships = [];
    result.folders = [];
  }

  protected querySelectorDirectChild(parentEl: Element, query: string): Element | null {
    const els = this.querySelectorAllDirectChild(parentEl, query);
    return els.length === 0 ? null : els[0];
  }

  protected querySelectorAllDirectChild(parentEl: Element, query: string): Element[] {
    return Array.from(parentEl.querySelectorAll(query)).filter((el) => el.parentNode === parentEl);
  }

  protected initLoginCipher(): CipherView {
    const cipher = new CipherView();
    cipher.favorite = false;
    cipher.notes = "";
    cipher.fields = [];
    cipher.login = new LoginView();
    cipher.type = CipherType.Login;
    return cipher;
  }

  protected cleanupCipher(cipher: CipherView) {
    if (cipher == null) {
      return;
    }
    if (cipher.type !== CipherType.Login) {
      cipher.login = null;
    }
    if (this.isNullOrWhitespace(cipher.name)) {
      cipher.name = "--";
    }
    if (this.isNullOrWhitespace(cipher.notes)) {
      cipher.notes = null;
    }
  }

  protected processKvp(cipher: CipherView, key: string, value: string, type: FieldType = FieldType.Text) {
    if (this.isNullOrWhitespace(value)) {
      return;
    }
    if (this.isNullOrWhitespace(key)) {
      key = "";
    }
    if (value.length > 200 || value.trim().search(this.newLineRegex) > -1) {
      if (cipher.notes == null) {
        cipher.notes = "";
      }
      cipher.notes += key + ": " + this.splitNewLine(value).join("\n") + "\n";
    } else {
      if (cipher.fields == null) {
        cipher.fields = [];
      }
      const field = new FieldView();
      field.type = type;
      field.name = key;
      field.value = value;
      cipher.fields.push(field);
    }
  }

  protected processFolder(result: ImportResult, folderName: string, addRelationship = true) {
    if (this.isNullOrWhitespace(folderName)) {
      return;
    }

    let folderIndex = result.folders.length;
    folderName = folderName.replace(/\\/g, "/").replace(/^\/+/g, "");
    let addFolder = true;

    for (let i = 0; i < result.folders.length; i++) {
      if (result.folders[i].name === folderName) {
        addFolder = false;
        folderIndex = i;
        break;
      }
    }

    if (addFolder) {
      const f = new FolderView();
      f.name = folderName;
      result.folders.push(f);
    }

    if (addRelationship) {
      result.folderRelationships.push([result.ciphers.length, folderIndex]);
    }

    const parts = folderName.split("/");
    for (let i = parts.length - 1; i > 0; i--) {
      const parentName = parts.slice(0, i).join("/");
      if (result.folders.find((c) => c.name === parentName) == null) {
        const folder = new FolderView();
        folder.name = parentName;
        result.folders.push(folder);
      }
    }
  }

  protected convertToNoteIfNeeded(cipher: CipherView) {
    if (
      cipher.type === CipherType.Login &&
      cipher.login &&
      this.isNullOrWhitespace(cipher.login.username) &&
      this.isNullOrWhitespace(cipher.login.password) &&
      (cipher.login.uris == null || cipher.login.uris.length === 0)
    ) {
      cipher.type = CipherType.SecureNote;
      cipher.secureNote = new SecureNoteView();
      cipher.secureNote.type = SecureNoteType.Generic;
    }
  }

  protected processFullName(cipher: CipherView, fullName: string) {
    if (this.isNullOrWhitespace(fullName)) {
      return;
    }

    const nameParts = fullName.split(" ");
    if (nameParts.length > 0) {
      cipher.identity.firstName = this.getValueOrDefault(nameParts[0]);
    }
    if (nameParts.length === 2) {
      cipher.identity.lastName = this.getValueOrDefault(nameParts[1]);
    } else if (nameParts.length >= 3) {
      cipher.identity.middleName = this.getValueOrDefault(nameParts[1]);
      cipher.identity.lastName = nameParts.slice(2, nameParts.length).join(" ");
    }
  }

  private validateNoExternalEntities(data: string): boolean {
    const regex = new RegExp("<!ENTITY", "i");
    return !regex.test(data);
  }
}
