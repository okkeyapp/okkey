/**
 * Schedule clearing the system clipboard after copying sensitive values.
 */
import { readVaultDevicePrefs } from "./vaultDevicePrefs";

let clearTimer: ReturnType<typeof setTimeout> | null = null;
let clearGeneration = 0;

export function scheduleClipboardClearAfterCopy(userId: string | null): void {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  if (!userId) {
    return;
  }
  const seconds = readVaultDevicePrefs(userId).clipboardClearSeconds;
  if (seconds <= 0) {
    return;
  }
  const gen = ++clearGeneration;
  clearTimer = setTimeout(() => {
    clearTimer = null;
    if (gen !== clearGeneration) {
      return;
    }
    void navigator.clipboard.writeText("").catch(() => {
      /* permission / focus */
    });
  }, seconds * 1000);
}

export async function copyTextWithVaultClipboardPolicy(
  userId: string | null,
  text: string,
): Promise<void> {
  await navigator.clipboard.writeText(text);
  scheduleClipboardClearAfterCopy(userId);
}
