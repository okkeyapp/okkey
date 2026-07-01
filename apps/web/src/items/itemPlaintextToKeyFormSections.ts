import type { ItemFieldV2, ItemPlaintextV2 } from "@okkey/types";
import { coerceRecoveryCodesRawToFormValue, coerceSecretRawToFormValue, getSecretKindFromRaw, serializeKeyFieldFileValue } from "@okkey/ui";

import type { KeyFormEditorField, KeyFormEditorSection } from "../components/key-form/KeyFormEditor";
import type { KeyFormEditorMessages } from "../components/key-form/keyFormI18n";
import { getDefaultSectionsForCategory } from "../components/items/itemCategoryDefaultSections";
import { isItemCategoryId } from "../components/items/itemCategoryCatalog";
import { isItemFieldFilled } from "./keyFormFilledFields";

function formFieldType(field: ItemFieldV2): string {
  if (field.type === "note") {
    return "multiline-text";
  }
  if (field.type === "recovery-codes") {
    return "recovery-codes";
  }
  if (field.value.kind === "unknown" && field.value.declaredType === "secret") {
    return "secret";
  }
  if (field.value.kind === "unknown" && field.value.declaredType === "recovery-codes") {
    return "recovery-codes";
  }
  return field.type;
}

function stringValueFromField(field: ItemFieldV2): string {
  switch (field.value.kind) {
    case "text":
      return field.value.text;
    case "password":
      return field.value.password;
    case "url":
      return field.value.url;
    case "totp":
      return field.value.secretBase32;
    case "note":
      return field.value.note;
    case "file":
      if (field.value.kind === "file") {
        const fileValue = field.value;
        if (fileValue.attachmentId?.trim() && fileValue.url?.trim()) {
          return serializeKeyFieldFileValue({
            attachmentId: fileValue.attachmentId.trim(),
            name: fileValue.name ?? "",
            mimeType: fileValue.mimeType ?? "application/octet-stream",
            sizeBytes: fileValue.sizeBytes ?? 0,
            url: fileValue.url.trim(),
          });
        }
        return fileValue.name ?? "";
      }
      return "";
    case "unknown":
      if (field.value.declaredType === "recovery-codes") {
        return coerceRecoveryCodesRawToFormValue(field.value.raw);
      }
      if (field.value.declaredType === "secret") {
        return coerceSecretRawToFormValue(field.value.raw);
      }
      return "";
    default:
      return "";
  }
}

const DEFAULT_SECTION_TITLES: Record<string, string> = {
  credentials: "General",
  websites: "Websites",
};

function sectionTitleForForm(section: { id: string; title?: string; isPreset?: boolean } | undefined): string | undefined {
  if (!section) {
    return undefined;
  }
  const raw = section.title?.trim();
  if (!raw || section.isPreset || raw === section.id || DEFAULT_SECTION_TITLES[section.id] === raw) {
    return undefined;
  }
  return raw;
}

function isFieldDeletable(
  sectionId: string,
  field: ItemFieldV2,
  sectionFields: ItemFieldV2[],
  isPresetSection: boolean,
): boolean {
  const type = formFieldType(field);

  if (!isPresetSection) {
    return true;
  }

  if (sectionId === "credentials") {
    if (field.id === "login" || field.id === "password") {
      return false;
    }
    if (type === "totp") {
      return true;
    }
    if (type === "password" || type === "text") {
      return false;
    }
    return false;
  }

  if (sectionId === "websites" && type === "url") {
    return sectionFields.filter((candidate) => formFieldType(candidate) === "url").length > 1;
  }

  return false;
}

function isFieldLabelEditable(
  sectionId: string,
  field: ItemFieldV2,
  isPresetSection: boolean,
): boolean {
  if (!isPresetSection) {
    return true;
  }

  if (sectionId === "websites" && formFieldType(field) === "url") {
    return true;
  }

  return false;
}

function isFieldRequired(
  sectionId: string,
  field: ItemFieldV2,
  sectionFields: ItemFieldV2[],
  isPresetSection: boolean,
): boolean {
  if (!isPresetSection) {
    return false;
  }

  if (sectionId === "credentials" && (field.id === "login" || field.type === "password")) {
    return true;
  }

  if (sectionId === "websites" && formFieldType(field) === "url") {
    return sectionFields.filter((candidate) => formFieldType(candidate) === "url").length > 0;
  }

  return false;
}

function mergeLoginPresetSections(
  loaded: KeyFormEditorSection[],
  messages: KeyFormEditorMessages,
): KeyFormEditorSection[] {
  const defaults = getDefaultSectionsForCategory("login", messages);
  const loadedById = new Map(loaded.map((section) => [section.id, section]));

  const mergedPreset = defaults.map((defaultSection) => {
    const loadedSection = loadedById.get(defaultSection.id);
    if (!loadedSection) {
      return defaultSection;
    }

    if (defaultSection.id === "websites") {
      const urlFields = loadedSection.fields.filter((field) => field.type === "url");
      if (urlFields.length === 0) {
        return defaultSection;
      }

      return {
        ...defaultSection,
        ...loadedSection,
        fields: urlFields.map((field) => ({
          ...field,
          required: true,
          deletable: urlFields.length > 1,
          editableLabel: true,
        })),
      };
    }

    if (defaultSection.id === "credentials") {
      const defaultFieldsById = new Map(defaultSection.fields.map((field) => [field.id, field]));
      const mergedFields: KeyFormEditorField[] = [];

      for (const defaultField of defaultSection.fields) {
        const loadedField = loadedSection.fields.find((field) => field.id === defaultField.id);
        mergedFields.push(
          loadedField
            ? {
                ...defaultField,
                ...loadedField,
                deletable: false,
                required: true,
                editableLabel: false,
                secret: defaultField.id === "password" ? true : loadedField.secret,
              }
            : defaultField,
        );
      }

      for (const loadedField of loadedSection.fields) {
        if (!defaultFieldsById.has(loadedField.id)) {
          mergedFields.push(loadedField);
        }
      }

      return {
        ...defaultSection,
        ...loadedSection,
        fields: mergedFields,
      };
    }

    return loadedSection;
  });

  const additional = loaded.filter((section) => !defaults.some((defaultSection) => defaultSection.id === section.id));
  return [...mergedPreset, ...additional];
}

function toFormField(
  field: ItemFieldV2,
  sectionId: string,
  sectionFields: ItemFieldV2[],
  isPresetSection: boolean,
): KeyFormEditorField {
  const value = stringValueFromField(field);
  const type = formFieldType(field);
  const deletable = isFieldDeletable(sectionId, field, sectionFields, isPresetSection);
  const secretKind = type === "secret" ? getSecretKindFromRaw(field.value.kind === "unknown" ? field.value.raw : null) : undefined;
  return {
    id: field.id,
    type,
    label: field.label ?? field.id,
    value,
    copyValue: type === "password" || type === "secret" || type === "url" ? value : undefined,
    secret: type === "password" || type === "secret",
    editableLabel: isFieldLabelEditable(sectionId, field, isPresetSection),
    deletable,
    required: isFieldRequired(sectionId, field, sectionFields, isPresetSection),
    ...(secretKind ? { secretKind } : {}),
    ...(type === "url" ? { urlAutofillScope: "entire-site" as const } : {}),
  };
}

export function itemPlaintextToKeyFormSections(
  item: ItemPlaintextV2,
  messages?: KeyFormEditorMessages,
): KeyFormEditorSection[] {
  const sectionsById = new Map(item.sections.map((section) => [section.id, section]));
  const orderedSectionIds = [...item.sections]
    .sort((a, b) => a.order - b.order)
    .map((section) => section.id);

  const fieldsBySection = new Map<string, ItemFieldV2[]>();
  for (const field of item.fields) {
    if (!isItemFieldFilled(field)) {
      continue;
    }
    const bucket = fieldsBySection.get(field.sectionId) ?? [];
    bucket.push(field);
    fieldsBySection.set(field.sectionId, bucket);
  }

  const sections = orderedSectionIds
    .map((sectionId) => {
      const section = sectionsById.get(sectionId);
      const sectionFields = (fieldsBySection.get(sectionId) ?? []).sort((a, b) => a.order - b.order);
      if (sectionFields.length === 0) {
        return null;
      }
      const isPresetSection = Boolean(section?.isPreset);
      const fields = sectionFields.map((field) => toFormField(field, sectionId, sectionFields, isPresetSection));
      return {
        id: sectionId,
        variant: section?.isPreset ? "primary" : "additional",
        title: sectionTitleForForm(section),
        fields,
      } satisfies KeyFormEditorSection;
    })
    .filter((section): section is KeyFormEditorSection => section !== null);

  if (messages && isItemCategoryId(item.categoryId) && item.categoryId === "login") {
    return mergeLoginPresetSections(sections, messages);
  }

  return sections;
}
