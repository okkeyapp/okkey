import type { ItemFieldV2, ItemPlaintextV2 } from "@okkey/types";
import { coerceSecretRawToFormValue, parseKeyFieldSecretRaw } from "@okkey/ui";

export type ItemPasswordEntry = {
  itemId: string;
  vaultId: string;
  fieldId: string;
  password: string;
  updatedAtMs: number;
};

function passwordFromField(field: ItemFieldV2): string | null {
  const { value } = field;
  if (value.kind === "password") {
    const password = value.password.trim();
    return password.length > 0 ? password : null;
  }
  if (value.kind === "unknown" && value.declaredType === "secret") {
    const parsed = parseKeyFieldSecretRaw(value.raw);
    if (!parsed || parsed.secretKind !== "password") {
      return null;
    }
    const formValue = coerceSecretRawToFormValue(value.raw);
    const password = typeof formValue === "string" ? formValue.trim() : "";
    return password.length > 0 ? password : null;
  }
  if (field.type === "password" && value.kind === "text") {
    const password = value.text.trim();
    return password.length > 0 ? password : null;
  }
  return null;
}

/** Active (non-deleted, non-archived) items with non-empty password-like fields. */
export function extractItemPasswordEntries(items: readonly ItemPlaintextV2[]): ItemPasswordEntry[] {
  const out: ItemPasswordEntry[] = [];
  for (const item of items) {
    if (item.deleted || item.archived) {
      continue;
    }
    for (const field of item.fields) {
      const password = passwordFromField(field);
      if (!password) {
        continue;
      }
      out.push({
        itemId: item.itemId,
        vaultId: item.vaultId,
        fieldId: field.id,
        password,
        updatedAtMs: item.updatedAtMs,
      });
    }
  }
  return out;
}
