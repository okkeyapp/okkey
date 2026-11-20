import type { KeyFormEditorField, KeyFormEditorSection } from "../components/key-form/KeyFormEditor";
import {
  BANK_ACCOUNT_SECTION_ID,
  CRYPTO_WALLET_SECTION_ID,
  PASSPORT_SECTION_ID,
  SECURE_FILES_SECTION_ID,
  SECURE_NOTE_SECTION_ID,
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
  options?: { linkedAccountItemId?: string },
): boolean {
  if (categoryId === "database" || categoryId === "server" || categoryId === "wifi_router" || categoryId === "credit_card" || categoryId === "bank_account" || categoryId === "crypto_wallet" || categoryId === "personal_data" || categoryId === "passport" || categoryId === "secure_files" || categoryId === "secure_note") {
    return true;
  }

  if (
    categoryId === "login" &&
    typeof options?.linkedAccountItemId === "string" &&
    options.linkedAccountItemId.trim().length > 0
  ) {
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

function isLoginCredentialFieldId(fieldId: string): boolean {
  return fieldId === "login" || fieldId === "password";
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
  /** When set on a login item, username/password are not required (relation-only allowed). */
  linkedAccountItemId?: string;
}): NewItemFormValidationResult {
  const issues: NewItemFormValidationIssue[] = [];
  const linkedAccountItemId =
    typeof input.linkedAccountItemId === "string" ? input.linkedAccountItemId.trim() : "";
  const relaxLoginCredentials =
    input.categoryId === "login" && linkedAccountItemId.length > 0;

  if (!input.recordName.trim()) {
    issues.push({ kind: "recordName" });
  }

  if (!input.vaultId.trim()) {
    issues.push({ kind: "vault" });
  }

  for (const section of input.sections ?? []) {
    for (const field of section.fields) {
      // Website URLs are optional: blank rows (primary or extra) never block Save.
      // Non-blank URL fields still honor `required` and other field checks as before.
      if (section.id === "websites" && field.type === "url" && isFieldValueEmpty(field)) {
        continue;
      }
      if (!field.required) {
        continue;
      }
      if (relaxLoginCredentials && section.id === "credentials" && isLoginCredentialFieldId(field.id)) {
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
    appendPersonalDataNameIssues(input.sections ?? [], (issue) => issues.push(issue));
  } else if (input.categoryId === "passport") {
    appendFlexiblePresetSectionIssues(PASSPORT_SECTION_ID, input.sections ?? [], issues);
  } else if (input.categoryId === "secure_files") {
    appendFlexiblePresetSectionIssues(SECURE_FILES_SECTION_ID, input.sections ?? [], issues, isKeyFormFieldFilled);
  } else if (input.categoryId === "secure_note") {
    appendFlexiblePresetSectionIssues(SECURE_NOTE_SECTION_ID, input.sections ?? [], issues, isKeyFormFieldFilled);
  } else if (
    !isConfiguredNewItemForm(input.categoryId, input.sections, {
      linkedAccountItemId: linkedAccountItemId || undefined,
    })
  ) {
    appendUnconfiguredFormIssues(input.sections ?? [], issues);
  }

  return { ok: issues.length === 0, issues };
}
