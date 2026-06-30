import type { ItemPlaintextV2 } from "@okkey/types";

export function patchItemRecoveryCodesField(
  item: ItemPlaintextV2,
  fieldId: string,
  nextValue: string,
): ItemPlaintextV2 {
  return {
    ...item,
    updatedAtMs: Date.now(),
    fields: item.fields.map((field) => {
      if (field.id !== fieldId) {
        return field;
      }

      return {
        ...field,
        type: "recovery-codes",
        value: {
          kind: "unknown",
          declaredType: "recovery-codes",
          raw: nextValue,
        },
      };
    }),
  };
}
