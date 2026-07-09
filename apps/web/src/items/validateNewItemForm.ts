import type { KeyFormEditorField, KeyFormEditorSection } from "../components/key-form/KeyFormEditor";
import {
  BANK_ACCOUNT_SECTION_ID,
  CRYPTO_WALLET_SECTION_ID,
  PASSPORT_SECTION_ID,
  SECURE_FILES_SECTION_ID,
  WIFI_ROUTER_SECTION_ID,
  isCreditCardRequiredFieldId,
} from "../components/items/itemCategoryDefaultSections";
import { isCreditCardRequiredFieldEmpty } from "./creditCardFormValidation";
import { isKeyFormFieldFilled } from "./keyFormFilledFields";
import { appendPersonalDataNameIssues } from "./personalDataFormValidation";

export type NewItemFormValidationIssue =
  | { kind: "recordName" }
  | { kind: "vault" }
  | { kind: "anyField" }
  | { kind: "field"; fieldId: string; sectionId: string };

export type NewItemFormValidationResult = {
  ok: boolean;
  issues: NewItemFormValidationIssue[];
};

function isFieldValueEmpty(field: KeyFormEditorField): boolean {
  if (typeof field.value !== "string") {
    return true;
  }
  return field.value.trim().length === 0;
}

export function isConfiguredNewItemForm(
  categoryId: string | undefined,
  sections: readonly KeyFormEditorSection[] | null,
): boolean {
  if (categoryId === "database" || categoryId === "server" || categoryId === "wifi_router" || categoryId === "credit_card" || categoryId === "bank_account" || categoryId === "crypto_wallet" || categoryId === "personal_data" || categoryId === "passport" || categoryId === "secure_files") {
    return true;
  }

  for (const section of sections ?? []) {
    for (const field of section.fields) {
      if (field.required) {
        return true;
      }
    }
  }

  return false;
}

function appendUnconfiguredFormIssues(
  sections: readonly KeyFormEditorSection[],
  issues: NewItemFormValidationIssue[],
): void {
  const hasAnyFilledField = sections.some((section) => section.fields.some(isKeyFormFieldFilled));
  if (!hasAnyFilledField) {
    issues.push({ kind: "anyField" });
  }
}

function appendFlexiblePresetSectionIssues(
  sectionId: string,
  sections: readonly KeyFormEditorSection[],
  issues: NewItemFormValidationIssue[],
  isFieldFilled: (field: KeyFormEditorField) => boolean = (field) => !isFieldValueEmpty(field),
): void {
  const section = sections.find((candidate) => candidate.id === sectionId);
  if (!section || section.fields.length === 0) {
    return;
  }

  const hasFilledField = section.fields.some(isFieldFilled);
  if (hasFilledField) {
    return;
  }

  for (const field of section.fields) {
    issues.push({ kind: "field", fieldId: field.id, sectionId: section.id });
  }
}

export function validateNewItemForm(input: {
  recordName: string;
  vaultId: string;
  sections: readonly KeyFormEditorSection[] | null;
  categoryId?: string;
}): NewItemFormValidationResult {
  const issues: NewItemFormValidationIssue[] = [];

  if (!input.recordName.trim()) {
    issues.push({ kind: "recordName" });
  }

  if (!input.vaultId.trim()) {
    issues.push({ kind: "vault" });
  }

  for (const section of input.sections ?? []) {
    for (const field of section.fields) {
      if (!field.required) {
        continue;
      }
      const isEmpty =
        input.categoryId === "credit_card" && isCreditCardRequiredFieldId(field.id)
          ? isCreditCardRequiredFieldEmpty(field)
          : isFieldValueEmpty(field);
      if (isEmpty) {
        issues.push({ kind: "field", fieldId: field.id, sectionId: section.id });
      }
    }
  }

  if (input.categoryId === "database") {
    appendFlexiblePresetSectionIssues("database", input.sections ?? [], issues);
  } else if (input.categoryId === "server") {
    appendFlexiblePresetSectionIssues("server", input.sections ?? [], issues);
  } else if (input.categoryId === "wifi_router") {
    appendFlexiblePresetSectionIssues(WIFI_ROUTER_SECTION_ID, input.sections ?? [], issues);
  } else if (input.categoryId === "bank_account") {
    appendFlexiblePresetSectionIssues(BANK_ACCOUNT_SECTION_ID, input.sections ?? [], issues);
  } else if (input.categoryId === "crypto_wallet") {
    appendFlexiblePresetSectionIssues(CRYPTO_WALLET_SECTION_ID, input.sections ?? [], issues);
  } else if (input.categoryId === "personal_data") {
    appendPersonalDataNameIssues(input.sections ?? [], issues);
  } else if (input.categoryId === "passport") {
    appendFlexiblePresetSectionIssues(PASSPORT_SECTION_ID, input.sections ?? [], issues);
  } else if (input.categoryId === "secure_files") {
    appendFlexiblePresetSectionIssues(SECURE_FILES_SECTION_ID, input.sections ?? [], issues, isKeyFormFieldFilled);
  } else if (!isConfiguredNewItemForm(input.categoryId, input.sections)) {
    appendUnconfiguredFormIssues(input.sections ?? [], issues);
  }

  return { ok: issues.length === 0, issues };
}
