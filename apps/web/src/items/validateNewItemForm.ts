import type { KeyFormEditorField, KeyFormEditorSection } from "../components/key-form/KeyFormEditor";
import { DATABASE_SECTION_ID, SERVER_SECTION_ID } from "../components/items/itemCategoryDefaultSections";
import { isKeyFormFieldFilled } from "./keyFormFilledFields";

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
  if (categoryId === "database" || categoryId === "server") {
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

function appendDatabaseSectionIssues(
  sections: readonly KeyFormEditorSection[],
  issues: NewItemFormValidationIssue[],
): void {
  const databaseSection = sections.find((section) => section.id === DATABASE_SECTION_ID);
  if (!databaseSection || databaseSection.fields.length === 0) {
    return;
  }

  const hasFilledField = databaseSection.fields.some((field) => !isFieldValueEmpty(field));
  if (hasFilledField) {
    return;
  }

  for (const field of databaseSection.fields) {
    issues.push({ kind: "field", fieldId: field.id, sectionId: databaseSection.id });
  }
}

function appendServerSectionIssues(
  sections: readonly KeyFormEditorSection[],
  issues: NewItemFormValidationIssue[],
): void {
  const serverSection = sections.find((section) => section.id === SERVER_SECTION_ID);
  if (!serverSection || serverSection.fields.length === 0) {
    return;
  }

  const hasFilledField = serverSection.fields.some((field) => !isFieldValueEmpty(field));
  if (hasFilledField) {
    return;
  }

  for (const field of serverSection.fields) {
    issues.push({ kind: "field", fieldId: field.id, sectionId: serverSection.id });
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
      if (isFieldValueEmpty(field)) {
        issues.push({ kind: "field", fieldId: field.id, sectionId: section.id });
      }
    }
  }

  if (input.categoryId === "database") {
    appendDatabaseSectionIssues(input.sections ?? [], issues);
  } else if (input.categoryId === "server") {
    appendServerSectionIssues(input.sections ?? [], issues);
  } else if (!isConfiguredNewItemForm(input.categoryId, input.sections)) {
    appendUnconfiguredFormIssues(input.sections ?? [], issues);
  }

  return { ok: issues.length === 0, issues };
}
