import type { KeyFormEditorField, KeyFormEditorSection } from "../key-form/KeyFormEditor.js";
import {
  PERSONAL_DATA_SECTION_ID,
  isPersonalDataRequiredNameFieldId,
} from "./itemCategoryDefaultSections.js";

/**
 * Minimal shape matching the `{ kind: "field"; fieldId; sectionId }` variant of
 * `NewItemFormValidationIssue` (apps/web `validateNewItemForm.ts`). Kept local so this
 * package doesn't depend on web's new-item-form validation orchestration, which is
 * intentionally not moved here.
 */
export type PersonalDataFieldValidationIssue = {
  kind: "field";
  fieldId: string;
  sectionId: string;
};

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

/**
 * Reports missing-name issues via `onIssue` rather than a typed array so callers
 * (e.g. web's `validateNewItemForm`) can push into their own richer issue union
 * without this package depending on that union's shape.
 */
export function appendPersonalDataNameIssues(
  sections: readonly KeyFormEditorSection[],
  onIssue: (issue: PersonalDataFieldValidationIssue) => void,
): void {
  const section = sections.find((candidate) => candidate.id === PERSONAL_DATA_SECTION_ID);
  if (!section || hasFilledPersonalDataNameField(section.fields)) {
    return;
  }

  for (const fieldId of ["first-name", "last-name"] as const) {
    onIssue({ kind: "field", fieldId, sectionId: PERSONAL_DATA_SECTION_ID });
  }
}
