import type { KeyFieldFileValue } from "@okkey/ui";
import { parseKeyFieldFileValue } from "@okkey/ui";

import type { KeyFormEditorSection } from "../components/key-form/KeyFormEditor";

export function collectKeyFieldFileAttachments(sections: readonly KeyFormEditorSection[]): KeyFieldFileValue[] {
  const files: KeyFieldFileValue[] = [];

  for (const section of sections) {
    for (const field of section.fields) {
      if (field.type !== "file" || typeof field.value !== "string") {
        continue;
      }
      const parsed = parseKeyFieldFileValue(field.value);
      if (parsed) {
        files.push(parsed);
      }
    }
  }

  return files;
}

export function diffRemovedKeyFieldFiles(
  before: readonly KeyFormEditorSection[],
  after: readonly KeyFormEditorSection[],
): KeyFieldFileValue[] {
  const afterIds = new Set(collectKeyFieldFileAttachments(after).map((file) => file.attachmentId));
  return collectKeyFieldFileAttachments(before).filter((file) => !afterIds.has(file.attachmentId));
}

export async function deleteRemovedKeyFieldFiles(
  before: readonly KeyFormEditorSection[],
  after: readonly KeyFormEditorSection[],
  deleteFile: (file: KeyFieldFileValue) => Promise<void>,
): Promise<void> {
  const removed = diffRemovedKeyFieldFiles(before, after);
  for (const file of removed) {
    await deleteFile(file);
  }
}
