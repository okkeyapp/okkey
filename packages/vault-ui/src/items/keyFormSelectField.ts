import type { FieldValueV2, ItemFieldV2 } from "@okkey/types";

import type { KeyFormEditorField, KeyFormSelectOption } from "../key-form/KeyFormEditor.js";

export type SelectFieldValueRaw = {
  value: string;
  options: KeyFormSelectOption[];
};

/** Same trailing empty-line rules as recovery codes editor. */
export function normalizeSelectOptionsEditorText(text: string): string {
  const parts = text.split("\n");
  if (parts.length <= 1) {
    return text;
  }

  while (parts.length > 1 && parts[parts.length - 1] === "" && parts[parts.length - 2] === "") {
    parts.pop();
  }

  return parts.join("\n");
}

export function appendSelectOptionsEditorLineAtEnd(text: string): string {
  const normalized = normalizeSelectOptionsEditorText(text);
  if (normalized.endsWith("\n") || normalized.length === 0) {
    return normalized;
  }

  return `${normalized}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSelectOptionsFromRaw(raw: unknown): KeyFormSelectOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const options: KeyFormSelectOption[] = [];

  for (const entry of raw) {
    if (!isRecord(entry)) {
      continue;
    }
    const value = typeof entry.value === "string" ? entry.value.trim() : "";
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    const label = typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : value;
    options.push({ value, label });
  }

  return options;
}

export function serializeSelectFieldValue(field: KeyFormEditorField): FieldValueV2 {
  const value = typeof field.value === "string" ? field.value : "";
  const options = (field.selectOptions ?? []).map((option) => ({
    value: option.value,
    label: option.label,
  }));

  return {
    kind: "unknown",
    declaredType: "select",
    raw: {
      value,
      options,
    } satisfies SelectFieldValueRaw,
  };
}

export function parseSelectFieldValueFromItem(field: ItemFieldV2): {
  value: string;
  selectOptions?: KeyFormSelectOption[];
} {
  const isSelectField =
    field.type === "select" ||
    (field.value.kind === "unknown" && field.value.declaredType === "select");

  if (!isSelectField) {
    return { value: "" };
  }

  if (field.value.kind === "unknown" && field.value.declaredType === "select") {
    const raw = field.value.raw;
    if (isRecord(raw)) {
      const value = typeof raw.value === "string" ? raw.value : "";
      const selectOptions = parseSelectOptionsFromRaw(raw.options);
      return selectOptions.length > 0 ? { value, selectOptions } : { value };
    }
    return { value: "" };
  }

  if (field.value.kind === "text") {
    return { value: field.value.text };
  }

  return { value: "" };
}

export function selectFieldValueFromRaw(raw: unknown): string {
  if (!isRecord(raw) || typeof raw.value !== "string") {
    return "";
  }
  return raw.value;
}
