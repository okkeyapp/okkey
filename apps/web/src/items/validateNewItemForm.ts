import type { KeyFormEditorField, KeyFormEditorSection } from "../components/key-form/KeyFormEditor";
import { DATABASE_SECTION_ID } from "../components/items/itemCategoryDefaultSections";

export type NewItemFormValidationIssue =
  | { kind: "recordName" }
  | { kind: "vault" }
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
  }

  return { ok: issues.length === 0, issues };
}
