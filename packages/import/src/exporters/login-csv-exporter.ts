import type { ExportSourceItem } from "./okkey-exporter.js";
import { collectLoginLike, toCsv } from "./export-field-utils.js";

export type LoginCsvPreset =
  | "chrome"
  | "firefox"
  | "safari"
  | "lastpass"
  | "nordpass"
  | "roboform"
  | "kaspersky"
  | "yandex"
  | "generic"
  | "onepassword";

export function buildLoginCsvExport(
  items: ExportSourceItem[],
  preset: LoginCsvPreset,
): Uint8Array {
  switch (preset) {
    case "chrome":
      return encode(
        ["name", "url", "username", "password", "note"],
        items.map((source) => {
          const login = collectLoginLike(source.item);
          return [source.item.title, login.url, login.username, login.password, login.notes];
        }),
      );
    case "firefox":
      return encode(
        ["url", "username", "password", "httpRealm", "formActionOrigin", "guid", "timeCreated", "timeLastUsed", "timePasswordChanged"],
        items.map((source) => {
          const login = collectLoginLike(source.item);
          return [login.url, login.username, login.password, "", login.url, source.item.itemId, "", "", ""];
        }),
      );
    case "safari":
      return encode(
        ["Title", "URL", "Username", "Password", "Notes", "OTPAuth"],
        items.map((source) => {
          const login = collectLoginLike(source.item);
          return [source.item.title, login.url, login.username, login.password, login.notes, login.totp];
        }),
      );
    case "lastpass":
      return encode(
        ["url", "username", "password", "totp", "extra", "name", "grouping", "fav"],
        items.map((source) => {
          const login = collectLoginLike(source.item);
          return [
            login.url,
            login.username,
            login.password,
            login.totp,
            login.notes,
            source.item.title,
            source.folderPath ?? "",
            source.favorite ? "1" : "0",
          ];
        }),
      );
    case "nordpass":
      return encode(
        ["name", "url", "username", "password", "note", "cardholdername", "cardnumber", "cvc", "expirydate", "zipcode", "folder", "full_name", "phone_number", "email", "address1", "address2", "city", "country", "state", "type"],
        items.map((source) => {
          const login = collectLoginLike(source.item);
          return [
            source.item.title,
            login.url,
            login.username,
            login.password,
            login.notes,
            "",
            "",
            "",
            "",
            "",
            source.folderPath ?? "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "password",
          ];
        }),
      );
    case "roboform":
      return encode(
        ["Name", "Url", "Login", "Pwd", "Note", "Folder"],
        items.map((source) => {
          const login = collectLoginLike(source.item);
          return [
            source.item.title,
            login.url,
            login.username,
            login.password,
            login.notes,
            source.folderPath ?? "",
          ];
        }),
      );
    case "kaspersky":
      return encode(
        ["Name", "Login", "Password", "URL", "Comment"],
        items.map((source) => {
          const login = collectLoginLike(source.item);
          return [source.item.title, login.username, login.password, login.url, login.notes];
        }),
      );
    case "yandex":
      return encode(
        ["url", "username", "password"],
        items.map((source) => {
          const login = collectLoginLike(source.item);
          return [login.url, login.username, login.password];
        }),
      );
    case "onepassword":
      return encode(
        ["Title", "Url", "Username", "Password", "OTPAuth", "Favorite", "Archived", "Tags", "Notes"],
        items.map((source) => {
          const login = collectLoginLike(source.item);
          return [
            source.item.title,
            login.url,
            login.username,
            login.password,
            login.totp,
            source.favorite ? "TRUE" : "FALSE",
            source.item.archived ? "TRUE" : "FALSE",
            (source.item.tags ?? []).join(";"),
            login.notes,
          ];
        }),
      );
    case "generic":
    default:
      return encode(
        ["name", "url", "username", "password", "notes", "folder", "favorite"],
        items.map((source) => {
          const login = collectLoginLike(source.item);
          return [
            source.item.title,
            login.url,
            login.username,
            login.password,
            login.notes,
            source.folderPath ?? "",
            source.favorite ? "true" : "false",
          ];
        }),
      );
  }
}

function encode(headers: string[], rows: string[][]): Uint8Array {
  return new TextEncoder().encode(toCsv(headers, rows));
}
