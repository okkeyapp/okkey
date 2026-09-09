import { generateEntityId } from "@okkey/id";
import type { ItemPlaintextV2 } from "@okkey/types";

/** Assign fresh ids for a new vault while keeping structure. Returns field id remapping. */
export function remintItemIds(
  item: ItemPlaintextV2,
  vaultId: string,
): { item: ItemPlaintextV2; fieldIdMap: Map<string, string> } {
  const sectionIdMap = new Map<string, string>();
  const fieldIdMap = new Map<string, string>();
  const sections = item.sections.map((section) => {
    const nextId = generateEntityId();
    sectionIdMap.set(section.id, nextId);
    return { ...section, id: nextId };
  });
  const fields = item.fields.map((field) => {
    const nextId = generateEntityId();
    fieldIdMap.set(field.id, nextId);
    return {
      ...field,
      id: nextId,
      sectionId: sectionIdMap.get(field.sectionId) ?? field.sectionId,
    };
  });
  return {
    item: {
      ...item,
      itemId: generateEntityId(),
      vaultId,
      sections,
      fields,
      faviconId: undefined,
    },
    fieldIdMap,
  };
}
