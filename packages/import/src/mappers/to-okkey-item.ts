import { generateEntityId } from "@okkey/id";
import {
  createPresetItemPlaintextV2,
  ITEM_CATEGORY_CREDIT_CARD,
  ITEM_CATEGORY_LOGIN,
  ITEM_CATEGORY_SECURE_NOTE,
  ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
  type ItemFieldV2,
  type ItemPlaintextV2,
  type ItemSectionV2,
} from "@okkey/types";

import { remintItemIds } from "../utils/okkey-item-ids.js";
import { CipherType, FieldType } from "../types/enums.js";
import type { ImportResult } from "../types/import-result.js";
import type { OkkeyNativeImportEntry } from "../types/okkey-export.js";
import type { AttachmentView, CipherView, FieldView } from "../types/views/cipher.view.js";

export type OkkeyImportItemDraft = {
  item: ItemPlaintextV2;
  attachments: ImportAttachmentDraft[];
  favorite?: boolean;
};

export type ImportAttachmentDraft = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  /** Bitwarden attachment id/path inside export, if known. */
  sourceKey?: string;
  /** When set, restore bytes into this field instead of appending a new file field. */
  targetFieldId?: string;
};

const ITEM_CATEGORY_PERSONAL_DATA = "personal_data";
const ADDITIONAL_SECTION_ID = "additional";

export function mapImportResultToOkkeyItems(params: {
  result: ImportResult;
  vaultId: string;
  attachmentFiles?: Map<string, Uint8Array>;
}): OkkeyImportItemDraft[] {
  if (params.result.nativeEntries.length > 0) {
    return params.result.nativeEntries.map((entry) =>
      mapNativeEntryToOkkeyItem({
        entry,
        vaultId: params.vaultId,
        attachmentFiles: params.attachmentFiles,
      }),
    );
  }
  return params.result.ciphers.map((cipher, index) =>
    mapCipherToOkkeyItem({
      cipher,
      vaultId: params.vaultId,
      attachmentFiles: params.attachmentFiles,
      cipherIndex: index,
    }),
  );
}

function mapNativeEntryToOkkeyItem(params: {
  entry: OkkeyNativeImportEntry;
  vaultId: string;
  attachmentFiles?: Map<string, Uint8Array>;
}): OkkeyImportItemDraft {
  const reminted = remintItemIds(params.entry.item, params.vaultId);
  const attachments: ImportAttachmentDraft[] = [];
  for (const ref of params.entry.attachmentRefs) {
    const bytes =
      params.attachmentFiles?.get(ref.relativePath) ??
      params.attachmentFiles?.get(ref.relativePath.replace(/\\/g, "/"));
    if (!bytes) {
      continue;
    }
    const targetFieldId = reminted.fieldIdMap.get(ref.fieldId);
    attachments.push({
      fileName: ref.fileName,
      mimeType: guessMime(ref.fileName),
      bytes,
      sourceKey: ref.relativePath,
      targetFieldId,
    });
  }
  return {
    item: reminted.item,
    attachments,
    favorite: params.entry.favorite,
  };
}

function guessMime(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function mapCipherToOkkeyItem(params: {
  cipher: CipherView;
  vaultId: string;
  attachmentFiles?: Map<string, Uint8Array>;
  cipherIndex: number;
}): OkkeyImportItemDraft {
  const { cipher, vaultId } = params;
  const now = Date.now();
  const itemId = generateEntityId();

  if (cipher.type === CipherType.Card) {
    const item = createPresetItemPlaintextV2({
      categoryId: ITEM_CATEGORY_CREDIT_CARD,
      itemId,
      vaultId,
      title: cipher.name || "Card",
      nowMs: now,
    });
    setFieldText(item, "card-number", cipher.card.number ?? "");
    setFieldText(item, "card-expiry", formatCardExpiration(cipher));
    applyImportedCardCode(item, cipher.card.code ?? "");
    setFieldText(item, "card-holder", cipher.card.cardholderName ?? "");
    if (cipher.card.brand?.trim()) {
      appendCustomFieldsAsFields(item, [
        { name: "Brand", value: cipher.card.brand, type: FieldType.Text },
      ]);
    }
    appendNotes(item, cipher.notes);
    appendCustomFieldsAsFields(item, cipher.fields ?? []);
    return {
      item,
      attachments: resolveAttachments(cipher, params.attachmentFiles),
      favorite: cipher.favorite,
    };
  }

  if (cipher.type === CipherType.Identity) {
    const item = createPersonalDataItem({
      itemId,
      vaultId,
      title: cipher.name || "Identity",
      nowMs: now,
      cipher,
    });
    appendNotes(item, cipher.notes);
    appendCustomFieldsAsFields(item, cipher.fields ?? []);
    return {
      item,
      attachments: resolveAttachments(cipher, params.attachmentFiles),
      favorite: cipher.favorite,
    };
  }

  if (cipher.type === CipherType.SecureNote || cipher.type === CipherType.SshKey) {
    const item = createPresetItemPlaintextV2({
      categoryId: ITEM_CATEGORY_SECURE_NOTE,
      itemId,
      vaultId,
      title: cipher.name || (cipher.type === CipherType.SshKey ? "SSH Key" : "Secure note"),
      nowMs: now,
    });
    setFieldNote(item, "note", cipher.notes ?? "");
    if (cipher.type === CipherType.SshKey) {
      appendSshKeyFields(item, cipher);
    }
    appendCustomFieldsAsFields(item, cipher.fields ?? []);
    return {
      item,
      attachments: resolveAttachments(cipher, params.attachmentFiles),
      favorite: cipher.favorite,
    };
  }

  // Login (default) and unknown types
  const item = createPresetItemPlaintextV2({
    categoryId: ITEM_CATEGORY_LOGIN,
    itemId,
    vaultId,
    title: cipher.name || "Login",
    nowMs: now,
  });
  setFieldText(item, "login", cipher.login?.username ?? "");
  setFieldPassword(item, "password", cipher.login?.password ?? "");
  setLoginUris(item, cipher.login?.uris ?? []);
  if (cipher.login?.totp?.trim()) {
    ensureTotpField(item, cipher.login.totp);
  }
  appendNotes(item, cipher.notes);
  appendCustomFieldsAsFields(item, cipher.fields ?? []);
  return {
    item,
    attachments: resolveAttachments(cipher, params.attachmentFiles),
    favorite: cipher.favorite,
  };
}

function createPersonalDataItem(params: {
  itemId: string;
  vaultId: string;
  title: string;
  nowMs: number;
  cipher: CipherView;
}): ItemPlaintextV2 {
  const id = params.cipher.identity;
  const sectionId = "personal-data";
  const sections: ItemSectionV2[] = [
    { id: sectionId, title: "Personal data", order: 0, isPreset: true },
  ];
  const fields: ItemFieldV2[] = [
    textField("first-name", sectionId, 0, "First name", id.firstName ?? ""),
    textField("last-name", sectionId, 1, "Last name", id.lastName ?? ""),
    textField("middle-name", sectionId, 2, "Middle name", id.middleName ?? ""),
    textField("email", sectionId, 3, "Email", id.email ?? ""),
    textField("phone", sectionId, 4, "Phone", id.phone ?? ""),
    {
      id: "address",
      type: "address",
      sectionId,
      order: 5,
      label: "Address",
      value: {
        kind: "text",
        text: JSON.stringify({
          street: [id.address1, id.address2, id.address3].filter(Boolean).join(", "),
          city: id.city ?? "",
          state: id.state ?? "",
          postalCode: id.postalCode ?? "",
          country: id.country ?? "",
        }),
      },
    },
  ];

  const extras: Array<[string, string | null | undefined]> = [
    ["Title", id.title],
    ["Username", id.username],
    ["Company", id.company],
    ["SSN", id.ssn],
    ["Passport", id.passportNumber],
    ["License", id.licenseNumber],
  ];
  for (const [label, value] of extras) {
    if (value?.trim()) {
      fields.push(textField(generateEntityId(), sectionId, fields.length, label, value));
    }
  }

  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId: params.itemId,
    vaultId: params.vaultId,
    title: params.title,
    categoryId: ITEM_CATEGORY_PERSONAL_DATA,
    createdAtMs: params.nowMs,
    updatedAtMs: params.nowMs,
    sections,
    fields,
  };
}

function textField(
  id: string,
  sectionId: string,
  order: number,
  label: string,
  text: string,
): ItemFieldV2 {
  return {
    id,
    type: "text",
    sectionId,
    order,
    label,
    value: { kind: "text", text },
  };
}

function setFieldText(item: ItemPlaintextV2, fieldId: string, text: string) {
  const field = item.fields.find((f) => f.id === fieldId);
  if (field && field.value.kind === "text") {
    field.value.text = text;
  }
}

function setFieldPassword(item: ItemPlaintextV2, fieldId: string, password: string) {
  const field = item.fields.find((f) => f.id === fieldId);
  if (field && field.value.kind === "password") {
    field.value.password = password;
  }
}

function setFieldUrl(item: ItemPlaintextV2, fieldId: string, url: string) {
  const field = item.fields.find((f) => f.id === fieldId);
  if (field && field.value.kind === "url") {
    field.value.url = url;
  }
}

function setFieldNote(item: ItemPlaintextV2, fieldId: string, note: string) {
  const field = item.fields.find((f) => f.id === fieldId);
  if (field && field.value.kind === "note") {
    field.value.note = note;
  }
}

function setLoginUris(
  item: ItemPlaintextV2,
  uris: ReadonlyArray<{ uri?: string | null } | null> | null | undefined,
) {
  const cleaned = (uris ?? [])
    .map((entry) => entry?.uri?.trim() ?? "")
    .filter((uri) => uri.length > 0);
  if (cleaned.length === 0) {
    setFieldUrl(item, "website-1", "");
    return;
  }

  setFieldUrl(item, "website-1", cleaned[0] ?? "");
  const websitesSection = item.sections.find((section) => section.id === "websites");
  const sectionId = websitesSection?.id ?? "websites";
  for (let index = 1; index < cleaned.length; index += 1) {
    const fieldId = `website-${index + 1}`;
    item.fields.push({
      id: fieldId,
      type: "url",
      sectionId,
      order: index,
      label: "Website",
      value: { kind: "url", url: cleaned[index] ?? "" },
    });
  }
}

function ensureTotpField(item: ItemPlaintextV2, totp: string) {
  const secretBase32 = totp.replace(/^otpauth:\/\/[^\s]*secret=([^&]+).*$/i, "$1");
  const existing = item.fields.find((field) => field.id === "totp");
  if (existing && existing.value.kind === "totp") {
    existing.value.secretBase32 = secretBase32;
    return;
  }
  item.fields.push({
    id: "totp",
    type: "totp",
    sectionId: "credentials",
    order: item.fields.filter((field) => field.sectionId === "credentials").length,
    label: "Authenticator",
    value: { kind: "totp", secretBase32, periodSeconds: 30, digits: 6 },
  });
}

function appendNotes(item: ItemPlaintextV2, notes: string | null | undefined) {
  if (!notes?.trim()) {
    return;
  }
  const noteField = item.fields.find((f) => f.type === "note" || f.id === "note");
  if (noteField && noteField.value.kind === "note") {
    noteField.value.note = [noteField.value.note, notes].filter(Boolean).join("\n\n");
    return;
  }
  ensureAdditionalSection(item);
  item.fields.push({
    id: generateEntityId(),
    type: "note",
    sectionId: ADDITIONAL_SECTION_ID,
    order: item.fields.length,
    label: "Notes",
    value: { kind: "note", note: notes },
  });
}

function appendSshKeyFields(item: ItemPlaintextV2, cipher: CipherView) {
  const ssh = cipher.sshKey;
  const entries: Array<[string, string | null | undefined, boolean]> = [
    ["Private key", ssh.privateKey, true],
    ["Public key", ssh.publicKey, false],
    ["Fingerprint", ssh.keyFingerprint, false],
  ];
  ensureAdditionalSection(item);
  let order = item.fields.filter((field) => field.sectionId === ADDITIONAL_SECTION_ID).length;
  for (const [label, value, hidden] of entries) {
    if (!value?.trim()) {
      continue;
    }
    if (hidden) {
      item.fields.push({
        id: generateEntityId(),
        type: "password",
        sectionId: ADDITIONAL_SECTION_ID,
        order,
        label,
        value: { kind: "password", password: value },
      });
    } else {
      item.fields.push({
        id: generateEntityId(),
        type: "text",
        sectionId: ADDITIONAL_SECTION_ID,
        order,
        label,
        value: { kind: "text", text: value },
      });
    }
    order += 1;
  }
}

function appendCustomFieldsAsFields(
  item: ItemPlaintextV2,
  fields: ReadonlyArray<Pick<FieldView, "name" | "value" | "type">>,
) {
  const usable = fields.filter((field) => field.value.trim().length > 0 || field.type === FieldType.Boolean);
  if (usable.length === 0) {
    return;
  }
  ensureAdditionalSection(item);
  let order = item.fields.filter((field) => field.sectionId === ADDITIONAL_SECTION_ID).length;
  for (const field of usable) {
    const label = field.name.trim() || "Custom field";
    if (field.type === FieldType.Hidden) {
      item.fields.push({
        id: generateEntityId(),
        type: "password",
        sectionId: ADDITIONAL_SECTION_ID,
        order,
        label,
        value: { kind: "password", password: field.value },
      });
    } else if (field.type === FieldType.Boolean) {
      item.fields.push({
        id: generateEntityId(),
        type: "text",
        sectionId: ADDITIONAL_SECTION_ID,
        order,
        label,
        value: { kind: "text", text: field.value === "true" ? "true" : "false" },
      });
    } else {
      item.fields.push({
        id: generateEntityId(),
        type: "text",
        sectionId: ADDITIONAL_SECTION_ID,
        order,
        label,
        value: { kind: "text", text: field.value },
      });
    }
    order += 1;
  }
}

function ensureAdditionalSection(item: ItemPlaintextV2) {
  if (item.sections.some((section) => section.id === ADDITIONAL_SECTION_ID)) {
    return;
  }
  item.sections.push({
    id: ADDITIONAL_SECTION_ID,
    title: "",
    order: item.sections.length,
    isPreset: false,
  });
}

function formatCardExpiration(cipher: CipherView): string {
  const monthRaw = (cipher.card.expMonth ?? "").replace(/\D/g, "");
  const yearRaw = (cipher.card.expYear ?? "").replace(/\D/g, "");
  if (!monthRaw && !yearRaw) {
    return "";
  }
  const month = monthRaw.padStart(2, "0").slice(-2);
  const year = yearRaw.length >= 2 ? yearRaw.slice(-2) : yearRaw.padStart(2, "0");
  return `${month} / ${year}`;
}

/**
 * Importers expose a single `card.code` field. OKKEY separates:
 * - exactly 3 digits → CVC/CVV preset field
 * - exactly 4 digits → PIN custom field (never truncated into CVC)
 * - any other non-empty digit string → custom "Security code" (data preserved)
 */
function applyImportedCardCode(item: ItemPlaintextV2, rawCode: string) {
  const digits = rawCode.replace(/\D/g, "");
  if (!digits) {
    setFieldPassword(item, "card-pin", "");
    return;
  }

  if (digits.length === 3) {
    setFieldPassword(item, "card-pin", digits);
    return;
  }

  setFieldPassword(item, "card-pin", "");
  if (digits.length === 4) {
    appendCustomFieldsAsFields(item, [{ name: "PIN", value: digits, type: FieldType.Hidden }]);
    return;
  }

  appendCustomFieldsAsFields(item, [
    { name: "Security code", value: digits, type: FieldType.Hidden },
  ]);
}

function resolveAttachments(
  cipher: CipherView,
  attachmentFiles: Map<string, Uint8Array> | undefined,
): ImportAttachmentDraft[] {
  if (!cipher.attachments?.length || !attachmentFiles?.size) {
    return [];
  }
  const drafts: ImportAttachmentDraft[] = [];
  for (const attachment of cipher.attachments) {
    const resolved = resolveAttachmentBytes(attachment, attachmentFiles);
    if (!resolved) {
      continue;
    }
    drafts.push(resolved);
  }
  return drafts;
}

function resolveAttachmentBytes(
  attachment: AttachmentView,
  attachmentFiles: Map<string, Uint8Array>,
): ImportAttachmentDraft | null {
  const fileName = attachment.fileName ?? attachment.id ?? "attachment";
  const candidates = [
    attachment.id ? `attachments/${attachment.id}` : null,
    attachment.id ? `attachments/${attachment.id}/${fileName}` : null,
    attachment.fileName ? `attachments/${attachment.fileName}` : null,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const bytes = attachmentFiles.get(candidate);
    if (bytes) {
      return {
        fileName,
        mimeType: "application/octet-stream",
        bytes,
        sourceKey: candidate,
      };
    }
  }

  for (const [key, bytes] of attachmentFiles.entries()) {
    if (attachment.id && (key === `attachments/${attachment.id}` || key.startsWith(`attachments/${attachment.id}/`))) {
      const nestedName = key.split("/").pop() || fileName;
      return {
        fileName: attachment.fileName?.trim() || nestedName,
        mimeType: "application/octet-stream",
        bytes,
        sourceKey: key,
      };
    }
    if (key.endsWith(`/${fileName}`) || key === fileName || key.endsWith(fileName)) {
      return {
        fileName,
        mimeType: "application/octet-stream",
        bytes,
        sourceKey: key,
      };
    }
  }

  return null;
}

export { formatCustomFieldsNoteFromFields };

function formatCustomFieldsNoteFromFields(fields: ItemFieldV2[]): string {
  return fields
    .map((field) => {
      if (field.value.kind === "text") {
        return `${field.label ?? field.id}: ${field.value.text}`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}
