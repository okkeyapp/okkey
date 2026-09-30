/**
 * Web clipboard clear wrappers — keep `(userId, …)` API; policy lives in `@okkey/vault`.
 */
import {
  _resetVaultClipboardClearForTests as sharedReset,
  copyTextWithVaultClipboardPolicy as sharedCopy,
  scheduleClipboardClearAfterCopy as sharedSchedule,
} from "@okkey/vault";
import { readVaultDevicePrefs } from "./vaultDevicePrefs";

/**
 * Must be called in the same turn as a user-gesture clipboard write (or
 * immediately after it) so deferred `ClipboardItem` can capture activation.
 */
export function scheduleClipboardClearAfterCopy(
  userId: string | null,
  copiedText?: string,
): void {
  const seconds = userId ? readVaultDevicePrefs(userId).clipboardClearSeconds : 0;
  sharedSchedule({ clipboardClearSeconds: seconds, copiedText });
}

export async function copyTextWithVaultClipboardPolicy(
  userId: string | null,
  text: string,
): Promise<void> {
  const seconds = userId ? readVaultDevicePrefs(userId).clipboardClearSeconds : 0;
  await sharedCopy({ clipboardClearSeconds: seconds, text });
}

/** @internal test helper */
export function _resetVaultClipboardClearForTests(): void {
  sharedReset();
}
