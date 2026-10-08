import type { ItemFieldV2, ItemPlaintextV2 } from "@okkey/types";
import {
  formatKeyFieldAddressCopyValue,
  parseKeyFieldAddressValue,
} from "@okkey/ui/lib/key-field-address";

export type ExtensionItemListRecord = {
  id: string;
  vaultId: string;
  categoryId: string;
  title: string;
  description: string;
  urls: string[];
  tags: string[];
  updatedAtMs: number;
  archived: boolean;
  deleted: boolean;
  faviconId?: string;
};

export function collectItemUrls(item: ItemPlaintextV2): string[] {
  return item.fields
    .filter((field) => field.type === "url" && field.value.kind === "url")
    .map((field) => (field.value.kind === "url" ? field.value.url.trim() : ""))
    .filter((url) => url.length > 0);
}

function isSecretItemField(field: ItemFieldV2): boolean {
  if (field.type === "password" || field.type === "totp" || field.type === "recovery-codes") {
    return true;
  }
  return field.value.kind === "unknown" && field.value.declaredType === "secret";
}

function itemFieldDisplayValue(field: ItemFieldV2, locale = "en"): string {
  switch (field.value.kind) {
    case "text":
      return field.value.text.trim();
    case "url":
      return field.value.url.trim();
    case "note": {
      const firstLine = field.value.note.trim().split("\n")[0]?.trim() ?? "";
      return firstLine;
    }
    case "password":
      return field.value.password.trim();
    case "file":
      return field.value.name?.trim() ?? "";
    case "unknown":
      if (field.value.declaredType === "address" && typeof field.value.raw === "string") {
        return formatKeyFieldAddressCopyValue(parseKeyFieldAddressValue(field.value.raw), locale);
      }
      return "";
    default:
      return "";
  }
}

function isItemFieldFilled(field: ItemFieldV2): boolean {
  if (field.value.kind === "unknown" && field.value.declaredType === "address") {
    if (typeof field.value.raw !== "string") {
      return false;
    }
    const address = parseKeyFieldAddressValue(field.value.raw);
    return [
      address.apartment,
      address.house,
      address.street,
      address.city,
      address.state,
      address.postalCode,
      address.country,
    ].some((part) => part.trim().length > 0);
  }
  return itemFieldDisplayValue(field).length > 0;
}

function orderedItemFields(item: ItemPlaintextV2): ItemFieldV2[] {
  const fieldsBySection = new Map<string, ItemFieldV2[]>();
  for (const field of item.fields) {
    const bucket = fieldsBySection.get(field.sectionId) ?? [];
    bucket.push(field);
    fieldsBySection.set(field.sectionId, bucket);
  }

  const ordered: ItemFieldV2[] = [];
  const seenFieldIds = new Set<string>();
  const sectionIds = [...item.sections]
    .sort((left, right) => left.order - right.order)
    .map((section) => section.id);

  for (const sectionId of sectionIds) {
    const sectionFields = (fieldsBySection.get(sectionId) ?? []).sort(
      (left, right) => left.order - right.order,
    );
    for (const field of sectionFields) {
      ordered.push(field);
      seenFieldIds.add(field.id);
    }
  }

  const orphanFields = item.fields
    .filter((field) => !seenFieldIds.has(field.id))
    .sort((left, right) => left.order - right.order);

  return [...ordered, ...orphanFields];
}

export function readFirstNonSecretFilledFieldDescription(
  item: ItemPlaintextV2,
  locale = "en",
): string {
  for (const field of orderedItemFields(item)) {
    if (!isItemFieldFilled(field) || isSecretItemField(field)) {
      continue;
    }
    const displayValue = itemFieldDisplayValue(field, locale);
    if (displayValue.length > 0) {
      return displayValue;
    }
  }
  return "";
}

export function itemPlaintextToExtensionListRecord(
  item: ItemPlaintextV2,
  locale = "en",
): ExtensionItemListRecord {
  return {
    id: item.itemId,
    vaultId: item.vaultId,
    categoryId: item.categoryId,
    title: item.title,
    description: readFirstNonSecretFilledFieldDescription(item, locale),
    urls: collectItemUrls(item),
    tags: [...(item.tags ?? [])],
    updatedAtMs: item.updatedAtMs,
    archived: item.archived ?? false,
    deleted: item.deleted ?? false,
    ...(item.faviconId ? { faviconId: item.faviconId } : {}),
  };
}

export type ReadableItemField = {
  id: string;
  label: string;
  type: string;
  value: string;
  conceal: boolean;
  copyable: boolean;
};

/** Compact read-card fields for extension popup (login / password / urls / text / notes). */
export function extractReadableItemFields(item: ItemPlaintextV2): ReadableItemField[] {
  const out: ReadableItemField[] = [];
  for (const field of orderedItemFields(item)) {
    if (field.value.kind === "password") {
      const value = field.value.password;
      if (!value) continue;
      out.push({
        id: field.id,
        label: field.label || field.id,
        type: field.type,
        value,
        conceal: true,
        copyable: true,
      });
      continue;
    }
    if (field.value.kind === "text") {
      const value = field.value.text.trim();
      if (!value) continue;
      out.push({
        id: field.id,
        label: field.label || field.id,
        type: field.type,
        value,
        conceal: false,
        copyable: true,
      });
      continue;
    }
    if (field.value.kind === "url") {
      const value = field.value.url.trim();
      if (!value) continue;
      out.push({
        id: field.id,
        label: field.label || field.id,
        type: field.type,
        value,
        conceal: false,
        copyable: true,
      });
      continue;
    }
    if (field.value.kind === "note") {
      const value = field.value.note.trim();
      if (!value) continue;
      out.push({
        id: field.id,
        label: field.label || field.id,
        type: field.type,
        value,
        conceal: false,
        copyable: true,
      });
    }
  }
  return out;
}

export type LoginAutofillSecrets = {
  username: string;
  password: string;
  totpSecretBase32: string;
  totpPeriodSeconds: number;
  totpDigits: number;
};

function firstFilledText(item: ItemPlaintextV2, predicate: (field: ItemFieldV2) => boolean): string {
  for (const field of orderedItemFields(item)) {
    if (!predicate(field) || field.value.kind !== "text") {
      continue;
    }
    const text = field.value.text.trim();
    if (text) {
      return text;
    }
  }
  return "";
}

/** Login + password (+ TOTP secret if present) for autofill of Логин/пароль items. */
export function extractLoginAutofillSecrets(item: ItemPlaintextV2): LoginAutofillSecrets | null {
  let username = "";
  let password = "";
  let totpSecretBase32 = "";
  let totpPeriodSeconds = 30;
  let totpDigits = 6;

  for (const field of orderedItemFields(item)) {
    if (!username && (field.id === "login" || field.type === "email") && field.value.kind === "text") {
      username = field.value.text.trim();
    }
    if (!password && field.value.kind === "password") {
      password = field.value.password;
    }
    if (!totpSecretBase32 && field.value.kind === "totp") {
      totpSecretBase32 = field.value.secretBase32.trim();
      totpPeriodSeconds = field.value.periodSeconds && field.value.periodSeconds > 0 ? field.value.periodSeconds : 30;
      totpDigits = field.value.digits && field.value.digits > 0 ? field.value.digits : 6;
    }
  }

  if (!username) {
    username = firstFilledText(
      item,
      (field) => field.type === "text" && field.id !== "password" && !isSecretItemField(field),
    );
  }

  if (!username && !password && !totpSecretBase32) {
    return null;
  }

  return { username, password, totpSecretBase32, totpPeriodSeconds, totpDigits };
}

/** Copy-guard applies to login / password (not URL, TOTP, notes). */
export function isLoginOrPasswordCopyField(field: { id: string; type: string }): boolean {
  return field.type === "password" || field.type === "email" || field.id === "login";
}

