import { isInternalSaveErrorMessage } from "../lib/saveWithToast";

const CONFLICT_ERROR_RE =
  /VERSION_MISMATCH|SYNC_ITEM_ALREADY_EXISTS|ITEM_UPDATE_CONFLICT/;

/**
 * Map import failures to a localized sentence. Raw outbox and sync codes stay
 * off the screen.
 */
export function formatImportFailureMessage(
  message: string,
  t: (messageKey: string) => string,
): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return t("web.tools.import.errors.generic");
  }
  if (CONFLICT_ERROR_RE.test(trimmed)) {
    return t("web.tools.import.errors.conflict");
  }
  if (
    isInternalSaveErrorMessage(trimmed) ||
    trimmed.startsWith("OUTBOX_ENTRY_NOT_APPENDED") ||
    trimmed === "CREATE_ITEMS_MIXED_VAULT" ||
    trimmed === "Import batch create failed"
  ) {
    return t("web.tools.import.errors.incomplete");
  }
  return trimmed;
}
