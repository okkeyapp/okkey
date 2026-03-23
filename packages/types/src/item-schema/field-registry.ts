import type { FieldTypeId } from "./types.js";

/** UI / client hints only; no server involvement. */
export interface FieldTypeDefinition {
  id: FieldTypeId;
  /** When true, render masked and exclude from logs/screenshots in UI. */
  sensitive: boolean;
  /** Suggested input affordance on clients. */
  editor: "text" | "password" | "totp" | "url" | "multiline" | "file";
  /** When true, password generator may be offered (client-only). */
  supportsPasswordGenerator?: boolean;
}

const registry: Record<string, FieldTypeDefinition> = {
  text: { id: "text", sensitive: false, editor: "text" },
  password: { id: "password", sensitive: true, editor: "password", supportsPasswordGenerator: true },
  totp: { id: "totp", sensitive: true, editor: "totp" },
  url: { id: "url", sensitive: false, editor: "url" },
  note: { id: "note", sensitive: false, editor: "multiline" },
  file: { id: "file", sensitive: true, editor: "file" },
};

export function getFieldTypeDefinition(type: string): FieldTypeDefinition | undefined {
  return registry[type];
}

export function listRegisteredFieldTypes(): FieldTypeDefinition[] {
  return Object.values(registry);
}
