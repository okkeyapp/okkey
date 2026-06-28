import type { KeyFormEditorField, KeyFormEditorSection } from "../components/key-form/KeyFormEditor";

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

export function validateNewItemForm(input: {
  recordName: string;
  vaultId: string;
  sections: readonly KeyFormEditorSection[] | null;
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

  return { ok: issues.length === 0, issues };
}
