import type { KeyFormEditorField, KeyFormEditorSection } from "../components/key-form/KeyFormEditor";
import {
  PERSONAL_DATA_SECTION_ID,
  isPersonalDataRequiredNameFieldId,
} from "../components/items/itemCategoryDefaultSections";
import type { NewItemFormValidationIssue } from "./validateNewItemForm";

function isPersonalDataNameFieldValueEmpty(field: KeyFormEditorField | undefined): boolean {
  if (!field || typeof field.value !== "string") {
    return true;
  }
  return field.value.trim().length === 0;
}

export function hasFilledPersonalDataNameField(fields: readonly KeyFormEditorField[]): boolean {
  return fields.some(
    (field) =>
      isPersonalDataRequiredNameFieldId(field.id) &&
      typeof field.value === "string" &&
      field.value.trim().length > 0,
  );
}

export function isInvalidPersonalDataNameField(section: KeyFormEditorSection, field: KeyFormEditorField): boolean {
  if (section.id !== PERSONAL_DATA_SECTION_ID || !isPersonalDataRequiredNameFieldId(field.id)) {
    return false;
  }

  if (hasFilledPersonalDataNameField(section.fields)) {
    return false;
  }

  return isPersonalDataNameFieldValueEmpty(field);
}

export function appendPersonalDataNameIssues(
  sections: readonly KeyFormEditorSection[],
  issues: NewItemFormValidationIssue[],
): void {
  const section = sections.find((candidate) => candidate.id === PERSONAL_DATA_SECTION_ID);
  if (!section || hasFilledPersonalDataNameField(section.fields)) {
    return;
  }

  for (const fieldId of ["first-name", "last-name"] as const) {
    issues.push({ kind: "field", fieldId, sectionId: PERSONAL_DATA_SECTION_ID });
  }
}
