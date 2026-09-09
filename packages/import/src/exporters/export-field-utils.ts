import type { ItemFieldV2, ItemPlaintextV2 } from "@okkey/types";

export function readFieldText(item: ItemPlaintextV2, fieldId: string): string {
  const field = item.fields.find((entry) => entry.id === fieldId);
  return fieldValueToText(field);
}

export function fieldValueToText(field: ItemFieldV2 | undefined): string {
  if (!field) {
    return "";
  }
  const value = field.value;
  switch (value.kind) {
    case "text":
      return value.text ?? "";
    case "password":
      return value.password ?? "";
    case "url":
      return value.url ?? "";
    case "totp":
      return value.secretBase32 ?? "";
    case "note":
      return value.note ?? "";
    case "file":
      return value.name ?? "";
    default:
      return "";
  }
}

export function collectLoginLike(item: ItemPlaintextV2): {
  username: string;
  password: string;
  url: string;
  totp: string;
  notes: string;
} {
  const username = readFieldText(item, "login");
  const password = readFieldText(item, "password");
  const websiteField = item.fields.find((field) => field.id === "website-1" || field.type === "url");
  const url = fieldValueToText(websiteField);
  const totpField = item.fields.find((field) => field.type === "totp" || field.id === "totp");
  const totp = fieldValueToText(totpField);
  const notes = readFieldText(item, "note");
  return { username, password, url, totp, notes };
}

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}
