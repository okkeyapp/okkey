import type { KeyFormEditorField, KeyFormEditorSection } from "../components/key-form/KeyFormEditor";
import {
  WIFI_ROUTER_SECTION_ID,
} from "../components/items/itemCategoryDefaultSections";
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
  if (categoryId === "database" || categoryId === "server" || categoryId === "wifi_router") {
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
): void {
  const section = sections.find((candidate) => candidate.id === sectionId);
  if (!section || section.fields.length === 0) {
    return;
  }

  const hasFilledField = section.fields.some((field) => !isFieldValueEmpty(field));
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
      if (isFieldValueEmpty(field)) {
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
  } else if (!isConfiguredNewItemForm(input.categoryId, input.sections)) {
    appendUnconfiguredFormIssues(input.sections ?? [], issues);
  }

  return { ok: issues.length === 0, issues };
}
