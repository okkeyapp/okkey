import type { ItemFieldV2, ItemPlaintextV2 } from "@okkey/types";
import { coerceSecretRawToFormValue, parseKeyFieldSecretRaw } from "@okkey/ui";

/**
 * Standard password fields in Authorization-group categories only.
 * Custom password/secret fields are excluded (often tokens or arbitrary hidden text).
 */
const MONITORING_PASSWORD_FIELD_IDS_BY_CATEGORY: Readonly<Record<string, ReadonlySet<string>>> = {
  login: new Set(["password"]),
  database: new Set(["db-password"]),
  server: new Set(["server-password", "admin-console-password"]),
  wifi_router: new Set([
    "wifi-station-password",
    "wifi-network-password",
    "wifi-connected-storage-password",
  ]),
};

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

function isMonitoredPasswordField(categoryId: string, fieldId: string): boolean {
  const allowed = MONITORING_PASSWORD_FIELD_IDS_BY_CATEGORY[categoryId];
  return allowed?.has(fieldId) ?? false;
}

/**
 * Active Authorization items: only preset password fields (login / DB / server / Wi‑Fi).
 * Skips credit-card PINs, API secrets, and any custom password fields.
 */
export function extractItemPasswordEntries(items: readonly ItemPlaintextV2[]): ItemPasswordEntry[] {
  const out: ItemPasswordEntry[] = [];
  for (const item of items) {
    if (item.deleted || item.archived) {
      continue;
    }
    for (const field of item.fields) {
      if (!isMonitoredPasswordField(item.categoryId, field.id)) {
        continue;
      }
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
