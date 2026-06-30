import type { ItemFieldV2, ItemPlaintextV2 } from "@okkey/types";
import {
  coerceRecoveryCodesRawToFormValue,
  parseKeyFieldRecoveryCodesValue,
  serializeKeyFieldRecoveryCodesValue,
} from "@okkey/ui";

function isRecoveryCodesField(field: ItemFieldV2): boolean {
  return (
    field.type === "recovery-codes" ||
    (field.value.kind === "unknown" && field.value.declaredType === "recovery-codes")
  );
}

function recoveryCodesRawWithoutUsed(field: ItemFieldV2): string {
  const raw = field.value.kind === "unknown" ? coerceRecoveryCodesRawToFormValue(field.value.raw) : "";
  const codes = parseKeyFieldRecoveryCodesValue(raw).map((entry) => ({
    code: entry.code,
    used: false,
  }));
  return serializeKeyFieldRecoveryCodesValue(codes);
}

function normalizedItemWithoutRecoveryUsedAndTimestamp(item: ItemPlaintextV2): ItemPlaintextV2 {
  return {
    ...item,
    updatedAtMs: 0,
    fields: item.fields.map((field) => {
      if (!isRecoveryCodesField(field)) {
        return field;
      }

      return {
        ...field,
        type: "recovery-codes",
        value: {
          kind: "unknown",
          declaredType: "recovery-codes",
          raw: recoveryCodesRawWithoutUsed(field),
        },
      };
    }),
  };
}

function recoveryCodesUsedFingerprint(item: ItemPlaintextV2): string {
  const parts: string[] = [];

  for (const field of item.fields) {
    if (!isRecoveryCodesField(field)) {
      continue;
    }

    const raw = field.value.kind === "unknown" ? coerceRecoveryCodesRawToFormValue(field.value.raw) : "";
    const used = parseKeyFieldRecoveryCodesValue(raw)
      .map((entry) => `${entry.code}:${entry.used ? "1" : "0"}`)
      .join("|");
    parts.push(`${field.id}=${used}`);
  }

  parts.sort();
  return parts.join(";");
}

/** True when the only meaningful plaintext diff is recovery-code `used` flags. */
export function isRecoveryCodesUsageOnlyItemUpdate(
  previous: ItemPlaintextV2 | undefined,
  next: ItemPlaintextV2,
): boolean {
  if (!previous || previous.itemId !== next.itemId) {
    return false;
  }

  const previousNormalized = normalizedItemWithoutRecoveryUsedAndTimestamp(previous);
  const nextNormalized = normalizedItemWithoutRecoveryUsedAndTimestamp(next);

  if (JSON.stringify(previousNormalized) !== JSON.stringify(nextNormalized)) {
    return false;
  }

  return recoveryCodesUsedFingerprint(previous) !== recoveryCodesUsedFingerprint(next);
}
