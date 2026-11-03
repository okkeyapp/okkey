import { toast } from "sonner";

export type SaveToastMessages = {
  loading: string;
  success: string;
  error: string;
  /** Shown when a same-item concurrent edit conflict is detected. */
  conflict?: string;
};

const INTERNAL_SAVE_ERROR_RE =
  /^(OUTBOX_ENTRY_NOT_APPENDED|ITEM_UPDATE_CONFLICT|AUTH_REQUIRED|VAULT_NOT_FOUND|ITEMS_SYNC_NOT_READY|VAULT_ITEMS_SYNC_FAILED)(:|$)/;

export function isInternalSaveErrorMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }
  if (INTERNAL_SAVE_ERROR_RE.test(trimmed)) {
    return true;
  }
  // Bare SCREAMING_SNAKE codes (optionally with :SUFFIX) — never show raw to users.
  return /^[A-Z][A-Z0-9_]+(?::[A-Z0-9_]+)?$/.test(trimmed);
}

export function isItemUpdateConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.trim();
  return (
    message === "ITEM_UPDATE_CONFLICT" ||
    message.endsWith(":ITEM_UPDATE_CONFLICT") ||
    message.includes("ITEM_UPDATE_CONFLICT")
  );
}

export function formatSaveError(error: unknown, fallback: string, conflictFallback?: string): string {
  if (isItemUpdateConflictError(error) && conflictFallback?.trim()) {
    return conflictFallback.trim();
  }
  if (error instanceof Error && error.message.trim()) {
    const message = error.message.trim();
    if (isInternalSaveErrorMessage(message)) {
      return fallback;
    }
    return message;
  }
  return fallback;
}

export async function runSaveWithToast<T>(messages: SaveToastMessages, action: () => Promise<T>): Promise<T> {
  return toast
    .promise(action(), {
      loading: messages.loading,
      success: messages.success,
      error: (error) => formatSaveError(error, messages.error, messages.conflict),
    })
    .unwrap();
}
