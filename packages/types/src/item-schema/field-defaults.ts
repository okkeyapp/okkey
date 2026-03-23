import type { FieldTypeId, FieldValueV2 } from "./types.js";

export function emptyValueForFieldType(type: FieldTypeId): FieldValueV2 {
  switch (type) {
    case "text":
      return { kind: "text", text: "" };
    case "password":
      return { kind: "password", password: "" };
    case "totp":
      return { kind: "totp", secretBase32: "", periodSeconds: 30, digits: 6 };
    case "url":
      return { kind: "url", url: "" };
    case "note":
      return { kind: "note", note: "" };
    case "file":
      return { kind: "file", name: "" };
    default:
      return { kind: "unknown", declaredType: type, raw: null };
  }
}
